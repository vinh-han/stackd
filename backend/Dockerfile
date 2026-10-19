# syntax=docker/dockerfile:1

FROM python:3.12-slim
COPY --from=ghcr.io/astral-sh/uv:0.12.3 /uv /bin/uv

WORKDIR /app
ENV UV_COMPILE_BYTECODE=1 \
    UV_LINK_MODE=copy \
    PYTHONUNBUFFERED=1 \
    PATH="/app/.venv/bin:$PATH" \
    HF_HOME=/models/hf \
    EASYOCR_MODULE_PATH=/models/easyocr

# Dependencies first, cached until pyproject/uv.lock change.
COPY pyproject.toml uv.lock ./
# Cache mount: uv's download cache (~1.5 GB of wheels) speeds rebuilds but stays out of the image.
RUN --mount=type=cache,target=/root/.cache/uv uv sync --frozen --no-dev

COPY stackd_api ./stackd_api

# Bake every model into the image (layout, tables, OCR) by running the real extraction once on a text PDF
# with a table and a scanned PDF. No upload ever waits on a download, and the server runs offline.
COPY tests/fixtures/storage.pdf tests/fixtures/scanned.pdf /tmp/warmup/
RUN python -c "from pathlib import Path; from stackd_api.extract import extract; [extract(p.name, p.read_bytes()) for p in Path('/tmp/warmup').iterdir()]" \
    && rm -rf /tmp/warmup
ENV HF_HUB_OFFLINE=1

RUN useradd --system --no-create-home app
USER app
EXPOSE 8000
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD python -c "import urllib.request; urllib.request.urlopen('http://127.0.0.1:8000/health', timeout=4)"
CMD ["uvicorn", "stackd_api.main:app", "--host", "0.0.0.0", "--port", "8000", "--proxy-headers"]
