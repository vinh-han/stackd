import json
import time

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


# ---------- /extract and /jobs ----------


def poll(client, job_id: str, tries: int = 50) -> dict:
    for _ in range(tries):
        body = client.get(f"/jobs/{job_id}").json()
        if body["status"] in ("done", "failed"):
            return body
        time.sleep(0.05)
    raise AssertionError(f"job stuck: {body}")


def test_extract_rejects_bad_file_before_queueing(client):
    res = client.post("/extract?filename=fake.pdf", content=b"not a pdf")
    assert res.status_code == 400
    assert res.json() == {"error": "This file is not a valid PDF file.", "code": "bad_request"}


def test_extract_job_returns_chunks_with_pages(client, monkeypatch):
    from stackd_api import jobs
    from stackd_api.chunking import Chunk

    def fake_extract(filename, data, on_progress):
        on_progress(1, 2)
        on_progress(2, 2)
        return [Chunk("Glacier text", [1, 2])]

    monkeypatch.setattr(jobs, "extract", fake_extract)
    monkeypatch.setattr("stackd_api.main.check_upload", lambda *_: None)  # the fake bytes are not a real PDF
    res = client.post("/extract?filename=notes.pdf", content=b"%PDF-1.7")
    assert res.status_code == 202
    body = poll(client, res.json()["jobId"])
    assert body["status"] == "done"
    assert body["chunks"] == [{"text": "Glacier text", "pages": [1, 2]}]
    assert (body["pagesDone"], body["pagesTotal"]) == (2, 2)


def test_failed_extraction_reports_the_reason(client, monkeypatch):
    from stackd_api import jobs
    from stackd_api.extract import ExtractError

    def fail(*_args, **_kwargs):
        raise ExtractError("No text found in this file.")

    monkeypatch.setattr(jobs, "extract", fail)
    monkeypatch.setattr("stackd_api.main.check_upload", lambda *_: None)
    body = poll(client, client.post("/extract?filename=a.png", content=b"x").json()["jobId"])
    assert (body["status"], body["error"], body["code"]) == ("failed", "No text found in this file.", "bad_request")


def test_unknown_job_is_404_in_api_error_shape(client):
    res = client.get("/jobs/nope")
    assert res.status_code == 404
    assert res.json()["code"] == "bad_request"


# ---------- /anki ----------


def test_anki_export_then_import_through_the_api(client):
    res = client.post("/anki/export", json={"deckName": "D", "cards": [{"id": "c1", "front": "Q?", "back": "A.", "topic": "T"}]})
    assert res.status_code == 200
    back = client.post("/anki/import", content=res.content)
    assert back.status_code == 200
    assert back.json() == {"decks": [{"name": "D", "cards": [{"front": "Q?", "back": "A.", "type": "qa", "topic": "T", "srs": None}]}]}


def test_anki_import_rejects_non_package(client):
    res = client.post("/anki/import", content=b"not a zip")
    assert res.status_code == 400
    assert res.json()["code"] == "bad_request"


def test_generate_rejects_oversized_chunk(client, stub_gemini):
    seen = stub_gemini(lambda _: gemini_reply({"cards": []}))
    res = client.post("/generate", json={"text": "x" * (CHUNK_MAX + 201)})
    assert res.status_code == 400
    assert seen == []  # never reaches Gemini
