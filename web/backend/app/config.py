"""Runtime configuration for the read-only data browser API.

The backend never writes to the exported database. Every setting is derived from
the environment at request time so tests can point ETO_DB at a temporary file
without reloading the application.
"""

from __future__ import annotations

import os
from pathlib import Path

# config.py lives at web/backend/app/config.py; three parents up is the repo root,
# which keeps the default database path aligned with the CLI (`data/eto.db`).
REPO_ROOT = Path(__file__).resolve().parents[3]
DEFAULT_DB_PATH = REPO_ROOT / 'data' / 'eto.db'

# Raw response bodies are zlib-compressed blobs. Decoding more than this per
# request would produce multi-megabyte JSON payloads for the browser.
RAW_BODY_LIMIT = 2 * 1024 * 1024

# The Vite dev server is the only cross-origin caller; production is same-origin.
CORS_ORIGINS = ['http://localhost:5173', 'http://127.0.0.1:5173']


def get_db_path() -> Path:
    """Return the SQLite file to open, honouring the ETO_DB override.

    Relative ETO_DB values are resolved against the repository root, matching how
    the CLI resolves its own --db default when invoked from the repo.
    """
    override = os.environ.get('ETO_DB')
    if not override:
        return DEFAULT_DB_PATH
    path = Path(override).expanduser()
    return path if path.is_absolute() else REPO_ROOT / path


def get_frontend_dist() -> Path:
    """Return the built Vue app directory hosted by FastAPI in production."""
    return REPO_ROOT / 'web' / 'frontend' / 'dist'
