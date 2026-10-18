import asyncio
import json

import httpx
import pytest

from stackd_api.gemini import MAX_CARDS_PER_CHUNK, ConfigError, GeminiClient, MissingKeyError, UpstreamError, sanitize
from tests.conftest import gemini_reply, make_gemini

SOURCE = "S3 Glacier Flexible Retrieval returns expedited retrievals in 1 to 5 minutes."


def card(**overrides):
    base = {
        "front": "How fast are expedited Glacier retrievals?",
        "back": "1 to 5 minutes.",
        "topic": "Storage",
        "card_type": "qa",
        "source_quote": "1 to 5 minutes",
    }
    return {**base, **overrides}


# ---------- sanitize ----------


def test_sanitize_keeps_a_valid_card():
    out = sanitize({"language": "en", "cards": [card(subtopic="S3")]}, SOURCE)
    assert out.language == "en"
    [c] = out.cards
    assert (c.front, c.back, c.topic, c.subtopic, c.type, c.source_quote) == (
        "How fast are expedited Glacier retrievals?",
        "1 to 5 minutes.",
        "Storage",
        "S3",
        "qa",
        "1 to 5 minutes",
    )


def test_sanitize_drops_cards_missing_front_or_back():
    out = sanitize({"cards": [card(front="  "), card(back=None), "not a card", card()]}, SOURCE)
    assert len(out.cards) == 1


def test_sanitize_drops_quotes_not_in_source():
    """A made-up quote is worse than none: the user would trust it."""
    out = sanitize({"cards": [card(source_quote="returns data instantly")]}, SOURCE)
    assert out.cards[0].source_quote == ""


def test_sanitize_coerces_bad_fields():
    out = sanitize({"language": "English!", "cards": [card(card_type="essay", topic="", subtopic="")]}, SOURCE)
    c = out.cards[0]
    assert (c.type, c.topic, c.subtopic) == ("qa", "General", None)
    assert out.language is None


def test_sanitize_caps_lengths_and_count():
    many = [card(front="Q" * 2000, back="A" * 5000, topic="T" * 100) for _ in range(MAX_CARDS_PER_CHUNK + 5)]
    out = sanitize({"cards": many}, SOURCE)
    assert len(out.cards) == MAX_CARDS_PER_CHUNK
    assert (len(out.cards[0].front), len(out.cards[0].back), len(out.cards[0].topic)) == (600, 1500, 40)


@pytest.mark.parametrize("payload", [None, [], "cards", {"cards": "nope"}])
def test_sanitize_tolerates_garbage(payload):
    assert sanitize(payload, SOURCE).cards == []


def test_sanitize_keeps_vietnamese():
    src = "Duy trì: to maintain. Ví dụ: duy trì thói quen học mỗi ngày."
    out = sanitize({"language": "vi", "cards": [card(front="duy trì", back="to maintain", card_type="vocab", source_quote="duy trì thói quen")]}, src)
    assert out.language == "vi"
    assert out.cards[0].front == "duy trì"
    assert out.cards[0].source_quote == "duy trì thói quen"


# ---------- client ----------


def run(client: GeminiClient, text: str = SOURCE, topics: list[str] | None = None):
    return asyncio.run(client.generate_cards(text, topics or []))


def test_client_requires_a_key():
    with pytest.raises(MissingKeyError):
        GeminiClient(api_key="", model="m", http=httpx.AsyncClient())


def test_client_sends_structured_request():
    seen: list[httpx.Request] = []

    def handler(request: httpx.Request) -> httpx.Response:
        seen.append(request)
        return gemini_reply({"language": "en", "cards": [card()]})

    out = run(make_gemini(handler), topics=["Storage", "Networking"])

    [req] = seen
    assert req.url.path.endswith("/models/test-model:generateContent")
    assert req.headers["x-goog-api-key"] == "test-key"
    assert "key=" not in str(req.url)  # key stays out of URLs and logs
    body = json.loads(req.content)
    assert body["generationConfig"]["responseMimeType"] == "application/json"
    assert "responseSchema" in body["generationConfig"]
    prompt = body["contents"][0]["parts"][0]["text"]
    assert f"<source>\n{SOURCE}\n</source>" in prompt
    assert "Storage, Networking" in prompt
    assert len(out.cards) == 1


@pytest.mark.parametrize(
    "response",
    [
        httpx.Response(429, text="quota exceeded"),
        httpx.Response(200, json={"candidates": []}),
        httpx.Response(200, json={"candidates": [{"content": {"parts": []}, "finishReason": "SAFETY"}]}),
        gemini_reply("{not json"),
    ],
    ids=["http-error", "no-candidates", "empty-content", "malformed-json"],
)
def test_client_raises_upstream_error(response):
    with pytest.raises(UpstreamError):
        run(make_gemini(lambda _: response))


@pytest.mark.parametrize("status", [400, 401, 403, 404])
def test_client_flags_setup_errors_as_config(status):
    """A wrong model or revoked key must not look like a transient failure."""
    with pytest.raises(ConfigError):
        run(make_gemini(lambda _: httpx.Response(status, text="model not found")))


def test_client_wraps_network_errors():
    def handler(request: httpx.Request) -> httpx.Response:
        raise httpx.ConnectError("boom", request=request)

    with pytest.raises(UpstreamError):
        run(make_gemini(handler))
