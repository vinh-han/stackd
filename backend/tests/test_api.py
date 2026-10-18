import json

import httpx

from stackd_api.chunking import CHUNK_MAX, MAX_INPUT_CHARS
from tests.conftest import gemini_reply

SOURCE = "Amazon EFS gives many Linux EC2 instances one shared POSIX file system."
CARD = {
    "front": "Which service gives EC2 instances a shared POSIX file system?",
    "back": "Amazon EFS.",
    "topic": "Storage",
    "subtopic": "EFS",
    "card_type": "qa",
    "source_quote": "one shared POSIX file system",
}


def test_health(client):
    assert client.get("/health").json() == {"status": "ok"}


# ---------- /chunk ----------


def test_chunk_splits_text(client):
    text = "\n\n".join("p" * 2000 for _ in range(3))
    res = client.post("/chunk", json={"text": text})
    assert res.status_code == 200
    assert len(res.json()["chunks"]) == 3


def test_chunk_rejects_empty_text(client):
    res = client.post("/chunk", json={"text": "   "})
    assert res.status_code == 400
    assert res.json() == {"error": "No text to split.", "code": "bad_request"}


def test_chunk_rejects_oversized_text(client):
    res = client.post("/chunk", json={"text": "x" * (MAX_INPUT_CHARS + 1)})
    assert res.status_code == 400
    assert "50,000" in res.json()["error"]


def test_malformed_body_is_a_400_not_a_422(client):
    res = client.post("/chunk", content="not json", headers={"content-type": "application/json"})
    assert res.status_code == 400
    assert res.json()["code"] == "bad_request"


# ---------- /generate ----------


def test_generate_without_key_is_503(client, monkeypatch):
    monkeypatch.delenv("GEMINI_API_KEY", raising=False)
    res = client.post("/generate", json={"text": SOURCE})
    assert res.status_code == 503
    assert res.json()["code"] == "missing_key"


def test_generate_returns_camel_case_cards(client, stub_gemini):
    stub_gemini(lambda _: gemini_reply({"language": "en", "cards": [CARD]}))
    res = client.post("/generate", json={"text": SOURCE, "topics": ["Storage"]})

    assert res.status_code == 200
    assert res.json() == {
        "language": "en",
        "cards": [
            {
                "front": CARD["front"],
                "back": "Amazon EFS.",
                "topic": "Storage",
                "subtopic": "EFS",
                "type": "qa",
                "sourceQuote": "one shared POSIX file system",
            }
        ],
    }


def test_generate_cleans_topics_before_prompting(client, stub_gemini):
    seen = stub_gemini(lambda _: gemini_reply({"language": "en", "cards": []}))
    topics = ["  Storage  ", "", "N" * 100] + [f"t{i}" for i in range(60)]
    client.post("/generate", json={"text": SOURCE, "topics": topics})

    prompt = json.loads(seen[0].content)["contents"][0]["parts"][0]["text"]
    listed = prompt.split("Existing topics in this deck: ")[1].split("\n")[0].split(", ")
    assert listed[0] == "Storage"
    assert listed[1] == "N" * 40
    assert len(listed) == 50


def test_generate_upstream_failure_is_502(client, stub_gemini):
    stub_gemini(lambda _: httpx.Response(500, text="internal"))
    res = client.post("/generate", json={"text": SOURCE})
    assert res.status_code == 502
    assert res.json() == {"error": "Card generation failed. Try again.", "code": "upstream"}


def test_generate_bad_model_is_a_config_error(client, stub_gemini):
    stub_gemini(lambda _: httpx.Response(404, text="models/nope is not found"))
    res = client.post("/generate", json={"text": SOURCE})
    assert res.status_code == 503
    assert res.json()["code"] == "bad_config"


def test_generate_rejects_oversized_chunk(client, stub_gemini):
    seen = stub_gemini(lambda _: gemini_reply({"cards": []}))
    res = client.post("/generate", json={"text": "x" * (CHUNK_MAX + 201)})
    assert res.status_code == 400
    assert seen == []  # never reaches Gemini
