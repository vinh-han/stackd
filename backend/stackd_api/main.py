"""Stackd backend. Server-side work lives here (in Python, for Docling): chunking, generation, ingestion."""

import logging
import os
from contextlib import asynccontextmanager

import httpx
from fastapi import Depends, FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse, Response

from . import jobs
from .anki import MAX_APKG_BYTES, AnkiError, export_apkg, import_apkg
from .chunking import chunk_text
from .extract import MAX_FILE_BYTES, ExtractError, check_upload
from .gemini import ConfigError, GeminiClient, MissingKeyError, UpstreamError
from .schemas import AnkiExportRequest, AnkiImport, ChunkRequest, ChunkResponse, ErrorResponse, GenerateRequest, GenerateResponse, JobCreated, JobStatus

log = logging.getLogger("stackd")
DEFAULT_MODEL = "gemini-3.1-flash-lite"


@asynccontextmanager
async def lifespan(app: FastAPI):
    async with httpx.AsyncClient() as http:
        app.state.http = http
        yield


app = FastAPI(title="Stackd API", lifespan=lifespan)


def get_generator(request: Request) -> GeminiClient:
    # Read per request so a key added to the environment is picked up without code changes.
    return GeminiClient(
        api_key=os.environ.get("GEMINI_API_KEY", ""),
        model=os.environ.get("GEMINI_MODEL") or DEFAULT_MODEL,
        http=request.app.state.http,
    )


def _error(status: int, message: str, code: str) -> JSONResponse:
    return JSONResponse(ErrorResponse(error=message, code=code).model_dump(), status_code=status)


@app.exception_handler(RequestValidationError)
async def _bad_request(_: Request, exc: RequestValidationError) -> JSONResponse:
    first = exc.errors()[0] if exc.errors() else {}
    message = str(first.get("msg", "Invalid request.")).removeprefix("Value error, ")
    return _error(400, message, "bad_request")


@app.exception_handler(ExtractError)
@app.exception_handler(AnkiError)
async def _bad_file(_: Request, exc: ValueError) -> JSONResponse:
    return _error(400, str(exc), "bad_request")


@app.exception_handler(MissingKeyError)
async def _missing_key(_: Request, __: MissingKeyError) -> JSONResponse:
    return _error(503, "Card generation is not configured. Set GEMINI_API_KEY in .env.local.", "missing_key")


@app.exception_handler(ConfigError)
async def _config(_: Request, exc: ConfigError) -> JSONResponse:
    log.error("generate: %s", exc)
    return _error(503, "Gemini rejected the request. Check GEMINI_API_KEY and GEMINI_MODEL.", "bad_config")


@app.exception_handler(UpstreamError)
async def _upstream(_: Request, exc: UpstreamError) -> JSONResponse:
    log.error("generate: %s", exc)
    return _error(502, "Card generation failed. Try again.", "upstream")


@app.get("/health")
async def health() -> dict[str, str]:
    return {"status": "ok"}


@app.post("/chunk", response_model=ChunkResponse)
async def chunk(req: ChunkRequest) -> ChunkResponse:
    return ChunkResponse(chunks=chunk_text(req.text))


@app.post("/generate", response_model=GenerateResponse)
async def generate(req: GenerateRequest, gemini: GeminiClient = Depends(get_generator)) -> GenerateResponse:
    """Generates cards for one chunk. The client fans out over chunks and shows progress."""
    return await gemini.generate_cards(req.text, req.topics)


@app.post("/extract", response_model=JobCreated, status_code=202)
async def extract_file(request: Request, filename: str) -> JobCreated:
    """Queues a file (raw request body) for text extraction. Poll /jobs/{job_id} for the chunks."""
    if int(request.headers.get("content-length") or 0) > MAX_FILE_BYTES:
        raise ExtractError(f"File is larger than {MAX_FILE_BYTES // (1024 * 1024)} MB.")
    data = await request.body()
    check_upload(filename, data)
    return JobCreated(job_id=jobs.submit(filename, data))


@app.get("/jobs/{job_id}", response_model=JobStatus)
async def job_status(job_id: str) -> JobStatus | JSONResponse:
    status = jobs.get(job_id)
    return status if status else _error(404, "This upload has expired. Upload the file again.", "bad_request")


@app.post("/anki/import", response_model=AnkiImport)
async def anki_import(request: Request) -> AnkiImport:
    """Parses an .apkg (raw request body). Fast enough to answer directly: no Docling, just SQLite."""
    if int(request.headers.get("content-length") or 0) > MAX_APKG_BYTES:
        raise AnkiError(f"Anki package is larger than {MAX_APKG_BYTES // (1024 * 1024)} MB.")
    return AnkiImport(decks=import_apkg(await request.body()))


@app.post("/anki/export")
async def anki_export(req: AnkiExportRequest) -> Response:
    data = export_apkg(req.deck_name, [c.model_dump() for c in req.cards])
    return Response(data, media_type="application/octet-stream")
