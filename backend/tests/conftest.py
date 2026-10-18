import json
from collections.abc import Callable, Iterator
from typing import Any

import httpx
import pytest
from fastapi.testclient import TestClient

from stackd_api.gemini import GeminiClient
from stackd_api.main import app, get_generator

Handler = Callable[[httpx.Request], httpx.Response]


def gemini_reply(payload: Any, status: int = 200) -> httpx.Response:
    """A generateContent response whose text part is `payload` as JSON."""
    text = payload if isinstance(payload, str) else json.dumps(payload)
    return httpx.Response(status, json={"candidates": [{"content": {"parts": [{"text": text}]}, "finishReason": "STOP"}]})


def make_gemini(handler: Handler, api_key: str = "test-key") -> GeminiClient:
    """A real GeminiClient whose HTTP calls go to `handler` instead of the network."""
    return GeminiClient(api_key=api_key, model="test-model", http=httpx.AsyncClient(transport=httpx.MockTransport(handler)))


@pytest.fixture
def client() -> Iterator[TestClient]:
    with TestClient(app) as c:
        yield c
    app.dependency_overrides.clear()


@pytest.fixture
def stub_gemini() -> Callable[[Handler], list[httpx.Request]]:
    """Routes /generate to a stubbed Gemini. Returns the list of requests Gemini received."""

    def install(handler: Handler) -> list[httpx.Request]:
        seen: list[httpx.Request] = []

        def record(request: httpx.Request) -> httpx.Response:
            seen.append(request)
            return handler(request)

        app.dependency_overrides[get_generator] = lambda: make_gemini(record)
        return seen

    return install
