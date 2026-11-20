"""FastAPI application for the read-only data browser.

Routes are registered here as the app grows: health and schema introspection
first, then the generic table query API and the raw response browser. Static
hosting of the built frontend is added by the integration task.
"""

from __future__ import annotations

from fastapi import Depends, FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse

from . import db, query, raw, schema
from .config import CORS_ORIGINS, get_frontend_dist
from .models import QueryRequest, RowRequest

app = FastAPI(title='eto data browser', version='0.1.0')

# Only the Vite dev server is cross-origin; production is served from this same
# process. Keeping the explicit list avoids the wildcard CORS trap.
app.add_middleware(
    CORSMiddleware,
    allow_origins=CORS_ORIGINS,
    allow_methods=['GET', 'POST'],
    allow_headers=['*'],
)


@app.get('/api/health')
def health() -> dict:
    return db.health()


@app.get('/api/schema')
def get_schema(connection=Depends(db.get_connection)) -> dict:
    """Describe all tables so the UI can drive itself from the live database."""
    return schema.describe_database(connection)


@app.post('/api/tables/{table}/query')
def query_table(
    table: str, request: QueryRequest, connection=Depends(db.get_connection)
) -> dict:
    """Run one page of a filtered/sorted table query.

    The request model only validates shape; query.py applies the schema
    allowlist and parameter binding.
    """
    return query.run_query(connection, table, request)


@app.post('/api/tables/{table}/row')
def get_row(
    table: str, request: RowRequest, connection=Depends(db.get_connection)
) -> dict:
    """Fetch one row by its full primary key (single or composite)."""
    result = query.fetch_row(connection, table, request.pk)
    if result is None:
        raise HTTPException(status_code=404, detail='row not found')
    return result


@app.get('/api/runs')
def get_runs(
    platform: str | None = None,
    status: str | None = None,
    limit: int = 50,
    offset: int = 0,
    connection=Depends(db.get_connection),
) -> dict:
    return raw.list_runs(
        connection, platform=platform, status=status, limit=limit, offset=offset
    )


@app.get('/api/runs/{run_id}')
def get_run(run_id: int, connection=Depends(db.get_connection)) -> dict:
    result = raw.get_run(connection, run_id)
    if result is None:
        raise HTTPException(status_code=404, detail='run not found')
    return result


@app.get('/api/responses')
def get_responses(
    run_id: int | None = None,
    platform: str | None = None,
    endpoint: str | None = None,
    status_code: int | None = None,
    q: str | None = None,
    limit: int = 50,
    offset: int = 0,
    connection=Depends(db.get_connection),
) -> dict:
    return raw.list_responses(
        connection,
        run_id=run_id,
        platform=platform,
        endpoint=endpoint,
        status_code=status_code,
        q=q,
        limit=limit,
        offset=offset,
    )


@app.get('/api/responses/{response_id}')
def get_response(response_id: int, connection=Depends(db.get_connection)) -> dict:
    result = raw.get_response(connection, response_id)
    if result is None:
        raise HTTPException(status_code=404, detail='response not found')
    return result


@app.get('/{full_path:path}', include_in_schema=False)
def serve_frontend(full_path: str):
    """Serve the built Vue app, including SPA deep links.

    This catch-all is registered after every API route so known endpoints win.
    Unknown `/api/...` paths must stay JSON 404s instead of falling back to
    index.html; real files under dist are served directly, everything else gets
    the SPA entry point for Vue Router.
    """
    if full_path.startswith('api/'):
        raise HTTPException(status_code=404, detail='not found')

    dist = get_frontend_dist().resolve()
    index = dist / 'index.html'
    if not index.is_file():
        raise HTTPException(status_code=404, detail='frontend not built')

    candidate = (dist / full_path).resolve() if full_path else index
    if candidate.is_file() and candidate.is_relative_to(dist):
        return FileResponse(candidate)
    return FileResponse(index)
