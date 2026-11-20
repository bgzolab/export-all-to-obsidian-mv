"""HTTP contract for the generic query endpoint."""

from __future__ import annotations

import sqlite3

import pytest


@pytest.fixture()
def seeded(db_path):
    connection = sqlite3.connect(db_path)
    connection.executemany(
        'INSERT INTO zhihu_content (content_id, title, author_json, voteup_count, '
        'updated_time, response_id) VALUES (?, ?, ?, ?, ?, ?)',
        [
            ('1', 'alpha', '{"name": "A"}', 10, 200, 1),
            ('2', 'beta', None, 20, 250, 2),
            ('3', 'gamma', '{bad json', 30, 260, 3),
        ],
    )
    connection.commit()
    connection.close()


def test_query_returns_rows_columns_and_total(client, seeded):
    response = client.post(
        '/api/tables/zhihu_content/query',
        json={
            'columns': ['content_id', 'title'],
            'sort': [{'column': 'updated_time', 'dir': 'desc'}],
            'limit': 2,
        },
    )
    assert response.status_code == 200
    body = response.json()
    assert body['table'] == 'zhihu_content'
    assert body['total'] == 3
    assert body['limit'] == 2
    assert [row['content_id'] for row in body['rows']] == ['3', '2']
    assert body['columns'] == [
        {'name': 'content_id', 'type': 'TEXT', 'json': False},
        {'name': 'title', 'type': 'TEXT', 'json': False},
    ]


def test_query_decodes_json_columns(client, seeded):
    response = client.post(
        '/api/tables/zhihu_content/query',
        json={'columns': ['content_id', 'author_json'], 'sort': [{'column': 'content_id'}]},
    )
    authors = {row['content_id']: row['author_json'] for row in response.json()['rows']}
    assert authors['1'] == {'name': 'A'}
    assert authors['2'] is None
    assert authors['3'] == '{bad json'


def test_query_clamps_limit_to_200(client, seeded):
    response = client.post('/api/tables/zhihu_content/query', json={'limit': 999})
    assert response.status_code == 200
    assert response.json()['limit'] == 200


@pytest.mark.parametrize(
    'payload,detail',
    [
        ({'columns': ['nope']}, 'unknown column'),
        ({'filters': [{'column': 'title', 'op': 'regex', 'value': 'a'}]}, 'unknown operator'),
        ({'columns': ['body']}, 'not queryable'),
    ],
)
def test_query_rejects_invalid_input(client, payload, detail):
    table = 'sync_response' if 'body' in payload.get('columns', []) else 'zhihu_content'
    response = client.post(f'/api/tables/{table}/query', json=payload)
    assert response.status_code == 400
    assert detail in response.json()['detail']


def test_query_rejects_unknown_table(client):
    response = client.post('/api/tables/not_a_table/query', json={})
    assert response.status_code == 400


def test_query_rejects_hidden_body_column(client):
    # Even selecting the compressed raw body through the generic API must fail.
    response = client.post('/api/tables/sync_response/query', json={'columns': ['body']})
    assert response.status_code == 400
    assert response.json()['detail'] == 'column is not queryable: body'


def test_row_by_single_primary_key(client, seeded):
    response = client.post(
        '/api/tables/zhihu_content/row', json={'pk': {'content_id': '2'}}
    )
    assert response.status_code == 200
    assert response.json()['row']['title'] == 'beta'


def test_row_by_composite_primary_key(client, db_path):
    connection = sqlite3.connect(db_path)
    connection.execute(
        "INSERT INTO bilibili_fav_item (fav_id, media_id, title) VALUES (1, 20, 'fav')"
    )
    connection.commit()
    connection.close()

    response = client.post(
        '/api/tables/bilibili_fav_item/row', json={'pk': {'fav_id': 1, 'media_id': 20}}
    )
    assert response.status_code == 200
    assert response.json()['row']['title'] == 'fav'


def test_row_missing_returns_404(client, seeded):
    response = client.post(
        '/api/tables/zhihu_content/row', json={'pk': {'content_id': 'missing'}}
    )
    assert response.status_code == 404
    assert response.json()['detail'] == 'row not found'


def test_row_with_incomplete_primary_key_is_400(client, db_path):
    response = client.post(
        '/api/tables/bilibili_fav_item/row', json={'pk': {'fav_id': 1}}
    )
    assert response.status_code == 400
    assert 'primary key must contain exactly' in response.json()['detail']
