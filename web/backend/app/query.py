"""SQL construction for the generic, schema-driven table API.

Every request is translated to a fixed SQL shape. Table names, column names,
sort directions and operators are checked against the live schema allowlist;
all user values are bound as parameters. There is deliberately no endpoint that
accepts raw SQL.
"""

from __future__ import annotations

import json
import sqlite3
from typing import Any

from fastapi import HTTPException

from .models import Filter, QueryRequest
from .schema import find_table, quote_identifier

MAX_LIMIT = 200
DEFAULT_LIMIT = 50

OPERATORS = {'eq', 'ne', 'gt', 'gte', 'lt', 'lte', 'like', 'in', 'is_null', 'not_null'}
NULL_OPERATORS = {'is_null', 'not_null'}
SORT_DIRECTIONS = {'asc', 'desc'}


def _bad_request(detail: str) -> HTTPException:
    return HTTPException(status_code=400, detail=detail)


def resolve_table(connection: sqlite3.Connection, table: str) -> dict:
    """Return table metadata or raise 400 for unknown names."""
    meta = find_table(connection, table)
    if meta is None:
        raise _bad_request(f'unknown table: {table}')
    return meta


def _visible_columns(meta: dict) -> list[dict]:
    return [column for column in meta['columns'] if not column['hidden']]


def _resolve_column(meta: dict, name: str, *, role: str) -> dict:
    """Allowlist one column name and reject hidden blob columns.

    Hidden columns (currently `sync_response.body`) are unreachable from the
    generic API even if a client knows their names.
    """
    for column in meta['columns']:
        if column['name'] != name:
            continue
        if column['hidden']:
            raise _bad_request(f'column is not queryable: {name}')
        return column
    raise _bad_request(f'unknown column {role}: {name}')


def _escape_like(value: str) -> str:
    # Escape the escape character first so the later replacements stay literal.
    return value.replace('\\', '\\\\').replace('%', '\\%').replace('_', '\\_')


def _is_blob(column: dict) -> bool:
    return 'BLOB' in (column['type'] or '').upper()


def _filter_clause(meta: dict, request_filter: Filter) -> tuple[str, list[Any]]:
    column = _resolve_column(meta, request_filter.column, role='in filter')
    operator = request_filter.op
    if operator not in OPERATORS:
        raise _bad_request(f'unknown operator: {operator}')

    # JSON and BLOB values have no meaningful ordering or equality for users;
    # they can still be checked for presence.
    if operator not in NULL_OPERATORS and (column['json'] or _is_blob(column)):
        raise _bad_request(f'operator {operator} is not supported for {column["name"]}')

    if operator in NULL_OPERATORS:
        return (
            (
                f'{quote_identifier(column["name"])} IS '
                f'{"NOT " if operator == "not_null" else ""}NULL'
            ),
            [],
        )

    value = request_filter.value
    if value is None:
        raise _bad_request(f'value is required for operator {operator}')

    if operator == 'like':
        if not isinstance(value, str):
            raise _bad_request('like value must be a string')
        return (
            f"{quote_identifier(column['name'])} LIKE ? ESCAPE '\\'",
            [f'%{_escape_like(value)}%'],
        )

    if operator == 'in':
        if not isinstance(value, list):
            raise _bad_request('in value must be a list')
        if not value:
            return '0', []
        placeholders = ', '.join('?' for _ in value)
        return f'{quote_identifier(column["name"])} IN ({placeholders})', list(value)

    sql_operator = {
        'eq': '=',
        'ne': '<>',
        'gt': '>',
        'gte': '>=',
        'lt': '<',
        'lte': '<=',
    }[operator]
    return f'{quote_identifier(column["name"])} {sql_operator} ?', [value]


def build_where(
    meta: dict,
    filters: list[Filter],
    search: str | None,
    search_columns: list[str] | None = None,
) -> tuple[str, list[Any]]:
    """Build the WHERE body and its parameters.

    Search is a case-insensitive `LIKE` over text columns; SQLite's default
    LIKE is already case-insensitive for ASCII. Wildcards typed by the user are
    escaped so the term is always treated as a literal substring.

    `search_columns` is an explicit allowlist for tables that want to search a
    JSON snapshot such as Bangumi `subject_json`. Without it, JSON columns stay
    excluded so a term like `name` cannot match every serialized object.
    """
    clauses: list[str] = []
    params: list[Any] = []

    for request_filter in filters:
        clause, clause_params = _filter_clause(meta, request_filter)
        clauses.append(clause)
        params.extend(clause_params)

    term = (search or '').strip()
    if term:
        if search_columns is not None:
            if not search_columns:
                raise _bad_request('search_columns must not be empty')
            searchable = []
            seen: set[str] = set()
            for name in search_columns:
                if name in seen:
                    continue
                column = _resolve_column(meta, name, role='in search_columns')
                if 'TEXT' not in (column['type'] or '').upper():
                    raise _bad_request(f'column is not searchable: {name}')
                searchable.append(column)
                seen.add(name)
        else:
            searchable = [
                column
                for column in _visible_columns(meta)
                if 'TEXT' in (column['type'] or '').upper() and not column['json']
            ]
        if not searchable:
            raise _bad_request('table has no searchable text columns')
        pattern = f'%{_escape_like(term)}%'
        clauses.append(
            '('
            + ' OR '.join(
                f"{quote_identifier(column['name'])} LIKE ? ESCAPE '\\'"
                for column in searchable
            )
            + ')'
        )
        params.extend([pattern] * len(searchable))

    return (' AND '.join(clauses) if clauses else '1=1'), params


def _selected_columns(meta: dict, requested: list[str] | None) -> list[dict]:
    if requested is None:
        return _visible_columns(meta)
    if not requested:
        raise _bad_request('columns must not be empty')
    selected: list[dict] = []
    seen: set[str] = set()
    for name in requested:
        if name in seen:
            continue
        selected.append(_resolve_column(meta, name, role='in columns'))
        seen.add(name)
    return selected


def _order_by(meta: dict, sorts: list) -> str:
    """Build ORDER BY from client sorts plus primary key for stable paging."""
    parts: list[str] = []
    used: set[str] = set()
    for sort in sorts:
        direction = sort.dir.lower()
        if direction not in SORT_DIRECTIONS:
            raise _bad_request(f'unknown sort direction: {sort.dir}')
        column = _resolve_column(meta, sort.column, role='in sort')
        if column['json'] or _is_blob(column):
            raise _bad_request(f'column is not sortable: {column["name"]}')
        if column['name'] in used:
            continue
        parts.append(f'{quote_identifier(column["name"])} {direction.upper()}')
        used.add(column['name'])
    # Without the primary key, equal sort values can shuffle between pages and
    # rows appear twice or not at all.
    for name in meta['primary_key']:
        if name not in used:
            parts.append(f'{quote_identifier(name)} ASC')
            used.add(name)
    return ', '.join(parts)


def build_select(
    meta: dict, request: QueryRequest
) -> tuple[str, list[dict], list[Any]]:
    """Return (SQL, selected column metadata, params) for one page."""
    columns = _selected_columns(meta, request.columns)
    where, params = build_where(
        meta, request.filters, request.search, request.search_columns
    )
    limit = min(request.limit, MAX_LIMIT)
    sql = (
        f'SELECT {", ".join(quote_identifier(c["name"]) for c in columns)} '
        f'FROM {quote_identifier(meta["name"])} WHERE {where}'
    )
    order_by = _order_by(meta, request.sort)
    if order_by:
        sql += f' ORDER BY {order_by}'
    sql += ' LIMIT ? OFFSET ?'
    params.extend([limit, request.offset])
    return sql, columns, params


def build_count(meta: dict, request: QueryRequest) -> tuple[str, list[Any]]:
    where, params = build_where(
        meta, request.filters, request.search, request.search_columns
    )
    return (
        f'SELECT COUNT(*) FROM {quote_identifier(meta["name"])} WHERE {where}',
        params,
    )


def _decode_row(row: sqlite3.Row, columns: list[dict]) -> dict:
    """Convert a row to JSON-friendly values, parsing `*_json` columns.

    Malformed JSON stays a string instead of failing the whole page: historical
    responses are rarely perfect and the UI can still show the raw text.
    """
    decoded: dict[str, Any] = {}
    for column in columns:
        value = row[column['name']]
        if column['json'] and isinstance(value, str) and value:
            try:
                value = json.loads(value)
            except ValueError:
                pass
        decoded[column['name']] = value
    return decoded


def run_query(
    connection: sqlite3.Connection, table: str, request: QueryRequest
) -> dict:
    """Execute one filtered, sorted page and return rows plus the total count."""
    meta = resolve_table(connection, table)
    sql, columns, params = build_select(meta, request)
    rows = connection.execute(sql, params).fetchall()
    count_sql, count_params = build_count(meta, request)
    total = connection.execute(count_sql, count_params).fetchone()[0]
    return {
        'table': meta['name'],
        'columns': [
            {'name': column['name'], 'type': column['type'], 'json': column['json']}
            for column in columns
        ],
        'rows': [_decode_row(row, columns) for row in rows],
        'total': total,
        'limit': min(request.limit, MAX_LIMIT),
        'offset': request.offset,
    }


def fetch_row(
    connection: sqlite3.Connection, table: str, pk: dict[str, Any]
) -> dict | None:
    """Fetch a single row by full primary key; None when it does not exist."""
    meta = resolve_table(connection, table)
    expected = list(meta['primary_key'])
    if not expected:
        raise _bad_request(f'table has no primary key: {table}')
    if set(pk) != set(expected):
        raise _bad_request(f'primary key must contain exactly: {", ".join(expected)}')
    columns = _visible_columns(meta)
    where = ' AND '.join(f'{quote_identifier(name)} = ?' for name in expected)
    sql = (
        f'SELECT {", ".join(quote_identifier(c["name"]) for c in columns)} '
        f'FROM {quote_identifier(meta["name"])} WHERE {where} LIMIT 1'
    )
    row = connection.execute(sql, [pk[name] for name in expected]).fetchone()
    if row is None:
        return None
    return {'table': meta['name'], 'row': _decode_row(row, columns)}
