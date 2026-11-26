"""Read-only SQLite access shared by every API route.

Each request opens its own connection because FastAPI runs sync handlers in a
thread pool and SQLite connections are not safe to share across threads. The
`mode=ro` URI makes accidental writes fail at the SQLite layer, and the busy
timeout tolerates the short write locks held by a concurrent `ownlog` sync.
"""

from __future__ import annotations

import sqlite3
from collections.abc import Iterator
from typing import Annotated
from urllib.parse import quote

from fastapi import Depends, HTTPException

from .config import get_db_path


def _readonly_uri(path) -> str:
    # Query-string characters in the filesystem path must be percent-encoded,
    # otherwise SQLite parses them as URI parameters (e.g. a directory named `?`).
    return 'file:' + quote(str(path), safe='/') + '?mode=ro'


def open_readonly() -> sqlite3.Connection:
    """Open the configured database read-only or fail with a 503.

    A missing file is an expected deployment mistake, not an internal error, so
    the API reports 503 instead of letting sqlite3 raise.
    """
    path = get_db_path()
    if not path.is_file():
        raise HTTPException(status_code=503, detail=f'database not found: {path}')
    try:
        connection = sqlite3.connect(
            _readonly_uri(path), uri=True, check_same_thread=False
        )
        connection.row_factory = sqlite3.Row
        # query_only is belt-and-braces on top of mode=ro: any future code path that
        # reuses this helper still cannot mutate the export.
        connection.execute('PRAGMA query_only=ON')
        connection.execute('PRAGMA busy_timeout=5000')
        # Force a schema read so a non-SQLite or unreadable file fails here rather
        # than in the first endpoint query.
        connection.execute('PRAGMA schema_version').fetchone()
    except sqlite3.Error as exc:
        raise HTTPException(
            status_code=503, detail=f'database unavailable: {exc}'
        ) from exc
    return connection


def get_connection() -> Iterator[sqlite3.Connection]:
    """FastAPI dependency yielding one connection per request."""
    connection = open_readonly()
    try:
        yield connection
    finally:
        connection.close()


# Annotated dependency keeps FastAPI signatures readable and avoids calling
# Depends() in every default argument (ruff B008).
DbConnection = Annotated[sqlite3.Connection, Depends(get_connection)]


def health() -> dict:
    """Report connectivity, the database path and the schema version.

    The version is read from PRAGMA user_version instead of hard-coding the
    migration number so the UI keeps working across database upgrades.
    """
    path = get_db_path()
    connection = open_readonly()
    try:
        version = connection.execute('PRAGMA user_version').fetchone()[0]
    finally:
        connection.close()
    return {'status': 'ok', 'db': str(path), 'user_version': version, 'readonly': True}
