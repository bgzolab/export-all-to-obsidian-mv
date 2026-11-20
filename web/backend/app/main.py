"""FastAPI application for the read-only data browser.

Routes are registered here as the app grows: health and schema introspection
first, then the generic table query API and the raw response browser. Static
hosting of the built frontend is added by the integration task.
"""

from __future__ import annotations

from fastapi import Depends, FastAPI
from fastapi.middleware.cors import CORSMiddleware

from . import db, query, schema
from .config import CORS_ORIGINS
from .models import QueryRequest

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
