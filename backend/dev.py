"""Local dev server: auto-reload, plus ../.env.local when it exists (the backend runs fine without a key)."""

from pathlib import Path

import uvicorn

ENV_FILE = Path(__file__).resolve().parent.parent / ".env.local"

if __name__ == "__main__":
    uvicorn.run(
        "stackd_api.main:app",
        port=8000,
        reload=True,
        env_file=ENV_FILE if ENV_FILE.exists() else None,
    )
