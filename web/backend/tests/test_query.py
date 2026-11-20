"""Query builder contract: operators, paging, allowlist and parameter binding."""

from __future__ import annotations

import sqlite3

import pytest
from app.models import Filter, QueryRequest, SortSpec
from app.query import build_select, fetch_row, run_query
from app.schema import find_table
from fastapi import HTTPException

from app import db


@pytest.fixture()
def connection(db_path):
    connection = db.open_readonly()
    yield connection
    connection.close()


@pytest.fixture()
def seeded(db_path):
    connection = sqlite3.connect(db_path)
    connection.executemany(
        'INSERT INTO zhihu_content (content_id, title, body_html, author_json, '
        'voteup_count, created_time, updated_time, response_id) '
        'VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
        [
            ('1', 'alpha', '<p>a</p>', '{"name": "A"}', 10, 100, 200, 1),
            ('2', 'beta', '<p>b</p>', None, 20, 150, 250, 2),
            ('3', '100%', '<p>c</p>', '{bad json', 30, 160, 260, 3),
            ('4', 'gamma', '<p>d</p>', '{"name": "B"}', 40, 170, 270, 4),
        ],
    )
    connection.executemany(
        'INSERT INTO bilibili_fav_item (fav_id, media_id, title, cover) VALUES (?, ?, ?, ?)',
        [
            (2, 10, 'second fav', None),
            (1, 30, 'first fav', None),
            (1, 20, 'also first', None),
        ],
    )
    connection.commit()
    connection.close()


def _query(connection, request, table='zhihu_content'):
    response = run_query(connection, table, request)
    return [row['content_id'] for row in response['rows']]


@pytest.mark.parametrize(
    ('request_filter', 'expected'),
    [
        (Filter(column='voteup_count', op='eq', value=20), ['2']),
        (Filter(column='voteup_count', op='ne', value=20), ['1', '3', '4']),
        (Filter(column='voteup_count', op='gt', value=20), ['3', '4']),
        (Filter(column='voteup_count', op='gte', value=30), ['3', '4']),
        (Filter(column='voteup_count', op='lt', value=20), ['1']),
        (Filter(column='voteup_count', op='lte', value=20), ['1', '2']),
        (Filter(column='title', op='like', value='et'), ['2']),
        (Filter(column='voteup_count', op='in', value=[10, 40]), ['1', '4']),
        (Filter(column='author_json', op='is_null'), ['2']),
        (Filter(column='author_json', op='not_null'), ['1', '3', '4']),
    ],
)
def test_filter_operators(connection, seeded, request_filter, expected):
    assert _query(connection, QueryRequest(filters=[request_filter])) == expected


def test_like_escapes_user_wildcards(connection, seeded):
    assert _query(connection, QueryRequest(search='100%')) == ['3']


def test_search_ignores_json_columns(connection, seeded):
    assert _query(connection, QueryRequest(search='name')) == []


def test_sort_appends_primary_key(connection, seeded):
    sql, _, _ = build_select(
        find_table(connection, 'bilibili_fav_item'),
        QueryRequest(columns=['title'], sort=[SortSpec(column='title', dir='desc')]),
    )
    assert 'ORDER BY "title" DESC, "fav_id" ASC, "media_id" ASC' in sql

    response = run_query(
        connection,
        'bilibili_fav_item',
        QueryRequest(columns=['fav_id', 'media_id']),
    )
    assert [(row['fav_id'], row['media_id']) for row in response['rows']] == [
        (1, 20),
        (1, 30),
        (2, 10),
    ]


def test_limit_is_clamped_and_total_is_unfiltered_by_paging(connection, seeded):
    response = run_query(connection, 'zhihu_content', QueryRequest(limit=999))
    assert response['limit'] == 200
    assert len(response['rows']) == 4
    assert response['total'] == 4


def test_json_columns_are_decoded_and_malformed_values_kept(connection, seeded):
    response = run_query(
        connection,
        'zhihu_content',
        QueryRequest(
            columns=['content_id', 'author_json'], sort=[SortSpec(column='content_id')]
        ),
    )
    author = {row['content_id']: row['author_json'] for row in response['rows']}
    assert author['1'] == {'name': 'A'}
    assert author['3'] == '{bad json'


def test_hidden_columns_are_rejected(connection, seeded):
    with pytest.raises(HTTPException) as excinfo:
        build_select(
            find_table(connection, 'sync_response'),
            QueryRequest(columns=['body']),
        )
    assert excinfo.value.status_code == 400


@pytest.mark.parametrize(
    ('query_request', 'detail'),
    [
        (
            QueryRequest(filters=[Filter(column='nope', op='eq', value=1)]),
            'unknown column',
        ),
        (
            QueryRequest(filters=[Filter(column='title', op='regex', value='a')]),
            'unknown operator',
        ),
        (QueryRequest(sort=[SortSpec(column='nope')]), 'unknown column'),
        (
            QueryRequest(sort=[SortSpec(column='title', dir='sideways')]),
            'unknown sort direction',
        ),
        (
            QueryRequest(filters=[Filter(column='author_json', op='eq', value='{}')]),
            'not supported',
        ),
    ],
)
def test_invalid_requests_are_400(connection, seeded, query_request, detail):
    with pytest.raises(HTTPException) as excinfo:
        run_query(connection, 'zhihu_content', query_request)
    assert excinfo.value.status_code == 400
    assert detail in excinfo.value.detail


def test_unknown_table_is_400(connection):
    with pytest.raises(HTTPException) as excinfo:
        run_query(connection, 'missing_table', QueryRequest())
    assert excinfo.value.status_code == 400


def test_injection_string_is_bound_as_value(connection, seeded, db_path):
    payload = "' OR 1=1 --"
    writer = sqlite3.connect(db_path)
    writer.execute(
        'INSERT INTO zhihu_content (content_id, title, response_id) VALUES (?, ?, ?)',
        ('5', payload, 5),
    )
    writer.commit()
    writer.close()

    sql, _, params = build_select(
        find_table(connection, 'zhihu_content'),
        QueryRequest(filters=[Filter(column='title', op='eq', value=payload)]),
    )
    assert payload not in sql
    assert payload in params
    assert _query(
        connection,
        QueryRequest(filters=[Filter(column='title', op='eq', value=payload)]),
    ) == ['5']


def test_fetch_row_supports_compound_primary_key(connection, seeded):
    row = fetch_row(connection, 'bilibili_fav_item', {'fav_id': 1, 'media_id': 30})
    assert row['row']['title'] == 'first fav'
    assert (
        fetch_row(connection, 'bilibili_fav_item', {'fav_id': 1, 'media_id': 99})
        is None
    )


def test_fetch_row_requires_exact_primary_key(connection, seeded):
    with pytest.raises(HTTPException) as excinfo:
        fetch_row(connection, 'bilibili_fav_item', {'fav_id': 1})
    assert excinfo.value.status_code == 400
    with pytest.raises(HTTPException) as excinfo:
        fetch_row(
            connection, 'bilibili_fav_item', {'fav_id': 1, 'media_id': 30, 'x': 1}
        )
    assert excinfo.value.status_code == 400
