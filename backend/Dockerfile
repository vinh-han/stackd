# syntax=docker/dockerfile:1

FROM python:3.12-slim
COPY --from=ghcr.io/astral-sh/uv:0.12.3 /uv /bin/uv

WORKDIR /app
ENV UV_COMPILE_BYTECODE=1 \
    UV_LINK_MODE=copy \
    PYTHONUNBUFFERED=1 \
    PATH="/app/.venv/bin:$PATH"

# Dependencies first, cached until pyproject/uv.lock change.
COPY pyproject.toml uv.lock ./
RUN uv sync --frozen --no-dev

COPY stackd_api ./stackd_api

RUN useradd --system --no-create-home app
USER app
EXPOSE 8000
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD python -c "import urllib.request; urllib.request.urlopen('http://127.0.0.1:8000/health', timeout=4)"
CMD ["uvicorn", "stackd_api.main:app", "--host", "0.0.0.0", "--port", "8000", "--proxy-headers"]
