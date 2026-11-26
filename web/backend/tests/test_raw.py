"""Raw run/response browser contract, including zlib decompression and truncation."""

from __future__ import annotations

import sqlite3
import zlib

import pytest

BIG_BODY = b'{"data":"' + b'a' * (2 * 1024 * 1024 + 10) + b'"}'


@pytest.fixture()
def raw_data(db_path):
    connection = sqlite3.connect(db_path)
    connection.executemany(
        'INSERT INTO sync_run (platform, operation, status, started_at) VALUES (?, ?, ?, ?)',
        [
            ('zhihu', 'contents', 'success', '2026-11-20T10:00:00Z'),
            ('v2ex', 'favorites', 'partial', '2026-11-20T11:00:00Z'),
        ],
    )
    connection.executemany(
        'INSERT INTO sync_response (run_id, endpoint, request, status_code, fetched_at, body) '
        'VALUES (?, ?, ?, ?, ?, ?)',
        [
            (
                1,
                'zhihu.contents.page',
                '{"page": 1}',
                200,
                '2026-11-20T10:00:01Z',
                zlib.compress(b'{"ok": 1}'),
            ),
            (
                1,
                'zhihu.author.detail',
                None,
                200,
                '2026-11-20T10:00:02Z',
                zlib.compress(b'plain text'),
            ),
            (
                2,
                'v2ex.favorites.page',
                '{"page": 2}',
                200,
                '2026-11-20T11:00:01Z',
                zlib.compress(BIG_BODY),
            ),
            (2, 'v2ex.balance', None, None, '2026-11-20T11:00:02Z', None),
        ],
    )
    connection.commit()
    connection.close()


def test_runs_list_is_newest_first_and_paginated(client, raw_data):
    response = client.get('/api/runs?limit=1')
    assert response.status_code == 200
    body = response.json()
    assert body['total'] == 2
    assert body['limit'] == 1
    assert [run['platform'] for run in body['runs']] == ['v2ex']


@pytest.mark.parametrize(
    ('query', 'expected'),
    [
        ('platform=zhihu', ['zhihu']),
        ('status=partial', ['v2ex']),
        ('platform=zhihu&status=partial', []),
    ],
)
def test_runs_filters(client, raw_data, query, expected):
    response = client.get(f'/api/runs?{query}')
    assert [run['platform'] for run in response.json()['runs']] == expected


def test_run_detail_includes_response_count(client, raw_data):
    body = client.get('/api/runs/1').json()
    assert body['run']['platform'] == 'zhihu'
    assert body['response_count'] == 2


def test_unknown_run_is_404(client, raw_data):
    assert client.get('/api/runs/999').status_code == 404


def test_responses_list_never_returns_body(client, raw_data):
    response = client.get('/api/responses?limit=5')
    assert response.status_code == 200
    body = response.json()
    assert body['total'] == 4
    assert len(body['responses']) == 4
    assert all('body' not in item for item in body['responses'])
    by_endpoint = {item['endpoint']: item for item in body['responses']}
    assert by_endpoint['v2ex.favorites.page']['request'] == {'page': 2}


def test_responses_filter_by_run_platform_and_keyword(client, raw_data):
    assert [
        item['id'] for item in client.get('/api/responses?run_id=1').json()['responses']
    ] == [2, 1]
    assert [
        item['id']
        for item in client.get('/api/responses?platform=v2ex').json()['responses']
    ] == [4, 3]
    assert [
        item['endpoint']
        for item in client.get('/api/responses?q=author').json()['responses']
    ] == ['zhihu.author.detail']


def test_response_detail_parses_json_body(client, raw_data):
    body = client.get('/api/responses/1').json()
    assert body['body'] == {'ok': 1}
    assert body['content_type'] == 'json'
    assert body['body_truncated'] is False
    assert body['body_size'] == len(b'{"ok": 1}')
    assert body['request'] == {'page': 1}


def test_response_detail_returns_text_body(client, raw_data):
    body = client.get('/api/responses/2').json()
    assert body['body'] == 'plain text'
    assert body['content_type'] == 'text'
    assert body['body_truncated'] is False


def test_response_detail_truncates_large_body(client, raw_data):
    body = client.get('/api/responses/3').json()
    assert body['body_truncated'] is True
    assert body['body_size'] == len(BIG_BODY)
    # The truncated payload stays at or below the configured 2MB cap; decoding
    # with replacement characters may shrink it slightly.
    assert len(body['body'].encode()) <= 2 * 1024 * 1024
    assert body['content_type'] == 'text'


def test_response_detail_handles_missing_body(client, raw_data):
    body = client.get('/api/responses/4').json()
    assert body['body'] is None
    assert body['content_type'] == 'empty'
    assert body['body_size'] == 0


def test_unknown_response_is_404(client, raw_data):
    assert client.get('/api/responses/999').status_code == 404
