"""Request and response models. JSON is camelCase to match the TypeScript frontend."""

from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator
from pydantic.alias_generators import to_camel

from .chunking import CHUNK_MAX, MAX_INPUT_CHARS

CARD_TYPES = ("qa", "cloze", "definition", "scenario", "vocab")
CardType = Literal["qa", "cloze", "definition", "scenario", "vocab"]
ErrorCode = Literal["missing_key", "bad_config", "bad_request", "upstream"]


class ApiModel(BaseModel):
    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True)


class ChunkRequest(ApiModel):
    text: str

    @field_validator("text")
    @classmethod
    def _text(cls, v: str) -> str:
        v = v.strip()
        if not v:
            raise ValueError("No text to split.")
        if len(v) > MAX_INPUT_CHARS:
            raise ValueError(f"Text is longer than {MAX_INPUT_CHARS:,} characters.")
        return v


class ChunkResponse(ApiModel):
    chunks: list[str]


class GenerateRequest(ApiModel):
    text: str
    # Topics already in the deck, so the model reuses them instead of inventing synonyms.
    topics: list[str] = Field(default_factory=list)

    @field_validator("text")
    @classmethod
    def _text(cls, v: str) -> str:
        v = v.strip()
        if not v:
            raise ValueError("No text to generate from.")
        if len(v) > CHUNK_MAX + 200:
            raise ValueError("Chunk too long.")
        return v

    @field_validator("topics")
    @classmethod
    def _topics(cls, v: list[str]) -> list[str]:
        return [t.strip()[:40] for t in v if t.strip()][:50]


class GeneratedCard(ApiModel):
    front: str
    back: str
    topic: str
    subtopic: str | None = None
    type: CardType
    # Short verbatim excerpt of the chunk that supports the card. Empty when none was verified.
    source_quote: str = ""


class GenerateResponse(ApiModel):
    # BCP 47 primary tag of the source, e.g. "vi", "en".
    language: str | None = None
    cards: list[GeneratedCard]


class ExtractedChunk(ApiModel):
    text: str
    pages: list[int]


class JobCreated(ApiModel):
    job_id: str


class JobStatus(ApiModel):
    status: Literal["queued", "running", "done", "failed"]
    pages_done: int = 0
    pages_total: int | None = None
    chunks: list[ExtractedChunk] | None = None
    error: str | None = None
    code: ErrorCode | None = None


class ErrorResponse(ApiModel):
    error: str
    code: ErrorCode
