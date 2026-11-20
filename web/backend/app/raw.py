"""Raw layer browsing: sync runs and their compressed HTTP responses.

Response bodies are zlib blobs in the append-only raw table. The list endpoint
never selects them; only the detail endpoint decompresses one body, truncating
oversized payloads so a single request cannot return hundreds of megabytes.
"""

from __future__ import annotations

import json
import sqlite3
import zlib
from typing import Any

from .config import RAW_BODY_LIMIT
from .query import DEFAULT_LIMIT, MAX_LIMIT, _escape_like

RUN_COLUMNS = (
    'id, platform, operation, scope, command, started_at, finished_at, status, error'
)
# `body` is deliberately absent: listing responses must stay cheap and never
# leak compressed payloads into the generic table output.
RESPONSE_LIST_COLUMNS = (
    'id',
    'run_id',
    'endpoint',
    'request',
    'status_code',
    'fetched_at',
    'sha256',
    'error',
)


def _page(limit: int, offset: int) -> tuple[int, int]:
    return min(max(limit, 1), MAX_LIMIT), max(offset, 0)


def _parse_json(value: Any) -> Any:
    """Parse a JSON text column, keeping the original string on failure."""
    if not isinstance(value, str) or not value:
        return value
    try:
        return json.loads(value)
    except ValueError:
        return value


def list_runs(
    connection: sqlite3.Connection,
    *,
    platform: str | None = None,
    status: str | None = None,
    limit: int = DEFAULT_LIMIT,
    offset: int = 0,
) -> dict:
    clauses: list[str] = []
    params: list[Any] = []
    if platform:
        clauses.append('platform = ?')
        params.append(platform)
    if status:
        clauses.append('status = ?')
        params.append(status)
    where = ' AND '.join(clauses) if clauses else '1=1'
    limit, offset = _page(limit, offset)

    total = connection.execute(
        f'SELECT COUNT(*) FROM sync_run WHERE {where}', params
    ).fetchone()[0]
    rows = connection.execute(
        f'SELECT {RUN_COLUMNS} FROM sync_run WHERE {where} ORDER BY id DESC LIMIT ? OFFSET ?',
        [*params, limit, offset],
    ).fetchall()
    return {
        'runs': [dict(row) for row in rows],
        'total': total,
        'limit': limit,
        'offset': offset,
    }


def get_run(connection: sqlite3.Connection, run_id: int) -> dict | None:
    row = connection.execute(
        f'SELECT {RUN_COLUMNS} FROM sync_run WHERE id = ?', (run_id,)
    ).fetchone()
    if row is None:
        return None
    response_count = connection.execute(
        'SELECT COUNT(*) FROM sync_response WHERE run_id = ?', (run_id,)
    ).fetchone()[0]
    return {'run': dict(row), 'response_count': response_count}


def list_responses(
    connection: sqlite3.Connection,
    *,
    run_id: int | None = None,
    platform: str | None = None,
    endpoint: str | None = None,
    status_code: int | None = None,
    q: str | None = None,
    limit: int = DEFAULT_LIMIT,
    offset: int = 0,
) -> dict:
    clauses: list[str] = []
    params: list[Any] = []
    if run_id is not None:
        clauses.append('r.run_id = ?')
        params.append(run_id)
    if platform:
        # Responses do not duplicate the platform; it lives on the parent run.
        clauses.append('run.platform = ?')
        params.append(platform)
    if endpoint:
        clauses.append('r.endpoint = ?')
        params.append(endpoint)
    if status_code is not None:
        clauses.append('r.status_code = ?')
        params.append(status_code)
    if q:
        pattern = f'%{_escape_like(q.strip())}%'
        clauses.append("(r.endpoint LIKE ? ESCAPE '\\' OR r.error LIKE ? ESCAPE '\\')")
        params.extend([pattern, pattern])
    where = ' AND '.join(clauses) if clauses else '1=1'
    limit, offset = _page(limit, offset)

    joins = 'FROM sync_response r JOIN sync_run run ON run.id = r.run_id'
    total = connection.execute(
        f'SELECT COUNT(*) {joins} WHERE {where}', params
    ).fetchone()[0]
    rows = connection.execute(
        f'SELECT {", ".join(f"r.{name}" for name in RESPONSE_LIST_COLUMNS)} '
        f'{joins} WHERE {where} ORDER BY r.id DESC LIMIT ? OFFSET ?',
        [*params, limit, offset],
    ).fetchall()
    responses = []
    for row in rows:
        item = dict(row)
        item['request'] = _parse_json(item['request'])
        responses.append(item)
    return {
        'responses': responses,
        'total': total,
        'limit': limit,
        'offset': offset,
    }


def _decompress(body: bytes | None) -> bytes | None:
    if body is None:
        return None
    try:
        return zlib.decompress(body)
    except zlib.error:
        # A hand-edited or legacy row may hold plain text; show it rather than
        # failing the whole detail view.
        return bytes(body)


def get_response(connection: sqlite3.Connection, response_id: int) -> dict | None:
    row = connection.execute(
        'SELECT id, run_id, endpoint, request, status_code, fetched_at, body, sha256, error '
        'FROM sync_response WHERE id = ?',
        (response_id,),
    ).fetchone()
    if row is None:
        return None

    raw = _decompress(row['body'])
    original_size = len(raw) if raw is not None else 0
    truncated = raw is not None and original_size > RAW_BODY_LIMIT
    if raw is None:
        body: Any = None
        content_type = 'empty'
    elif truncated:
        # Do not attempt JSON parsing on a partial document: it can only fail.
        body = raw[:RAW_BODY_LIMIT].decode('utf-8', errors='replace')
        content_type = 'text'
    else:
        text = raw.decode('utf-8', errors='replace')
        try:
            body = json.loads(text)
            content_type = 'json'
        except ValueError:
            body = text
            content_type = 'text'

    return {
        'id': row['id'],
        'run_id': row['run_id'],
        'endpoint': row['endpoint'],
        'request': _parse_json(row['request']),
        'status_code': row['status_code'],
        'fetched_at': row['fetched_at'],
        'sha256': row['sha256'],
        'error': row['error'],
        'body': body,
        'body_truncated': truncated,
        'body_size': original_size,
        'content_type': content_type,
    }
