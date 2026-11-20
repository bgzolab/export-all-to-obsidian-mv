"""Schema introspection for the generic table API.

The export database evolves with the CLI migrations, so the browser never hard-
codes a table list. It reads `sqlite_master` and `PRAGMA table_info` on demand,
which also means a new platform table becomes browsable without a backend change.
"""

from __future__ import annotations

import sqlite3

# Columns whose values are zlib-compressed blobs and must only be fetched through
# the dedicated raw response endpoint.
HIDDEN_COLUMNS = {('sync_response', 'body')}

# The raw layer is not a platform; the table prefix would otherwise group these
# tables under "sync".
RAW_TABLES = {'sync_run', 'sync_response'}


def quote_identifier(name: str) -> str:
    """Quote a trusted identifier for interpolation into SQL.

    Table/column names come from sqlite_master or PRAGMA output, never from the
    request, so escaping embedded double quotes is sufficient here. Request values
    still travel as bound parameters.
    """
    return '"' + name.replace('"', '""') + '"'


def _is_json_column(name: str) -> bool:
    # Projection tables serialize nested API objects into `*_json` TEXT columns;
    # raw requests are JSON too. Everything else is treated as a scalar.
    return name.endswith('_json') or name == 'request'


def _columns(connection: sqlite3.Connection, table: str) -> list[dict]:
    rows = connection.execute(f'PRAGMA table_info({quote_identifier(table)})').fetchall()
    return [
        {
            'name': row['name'],
            'type': row['type'],
            'not_null': bool(row['notnull']),
            'pk': row['pk'],
            'json': _is_json_column(row['name']),
            'hidden': (table, row['name']) in HIDDEN_COLUMNS,
        }
        for row in rows
    ]


def _table_names(connection: sqlite3.Connection) -> list[str]:
    rows = connection.execute(
        "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name"
    ).fetchall()
    return [row['name'] for row in rows]


def describe_table(connection: sqlite3.Connection, table: str) -> dict:
    """Return metadata and the current row count for one table.

    Callers must pass a name returned by `list_tables`; this helper does no
    allowlist check of its own.
    """
    columns = _columns(connection, table)
    primary_key = [column['name'] for column in sorted(columns, key=lambda c: c['pk']) if column['pk']]
    row_count = connection.execute(f'SELECT COUNT(*) FROM {quote_identifier(table)}').fetchone()[0]
    is_raw = table in RAW_TABLES
    return {
        'name': table,
        'platform': 'raw' if is_raw else table.split('_', 1)[0],
        'kind': 'raw' if is_raw else 'projection',
        'row_count': row_count,
        'primary_key': primary_key,
        'columns': columns,
    }


def list_tables(connection: sqlite3.Connection) -> list[dict]:
    """Describe every non-system table in the database."""
    return [describe_table(connection, name) for name in _table_names(connection)]


def describe_database(connection: sqlite3.Connection) -> dict:
    tables = list_tables(connection)
    platforms: dict[str, int] = {}
    for table in tables:
        platforms[table['platform']] = platforms.get(table['platform'], 0) + 1
    return {'tables': tables, 'platforms': platforms}


def find_table(connection: sqlite3.Connection, table: str) -> dict | None:
    """Look up one table without the row count used by the schema listing.

    Query routes only need columns and primary keys; skipping COUNT(*) keeps the
    per-request metadata lookup cheap on large tables.
    """
    if table not in _table_names(connection):
        return None
    columns = _columns(connection, table)
    primary_key = [column['name'] for column in sorted(columns, key=lambda c: c['pk']) if column['pk']]
    is_raw = table in RAW_TABLES
    return {
        'name': table,
        'platform': 'raw' if is_raw else table.split('_', 1)[0],
        'kind': 'raw' if is_raw else 'projection',
        'primary_key': primary_key,
        'columns': columns,
    }
