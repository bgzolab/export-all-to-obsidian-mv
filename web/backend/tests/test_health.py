"""Health endpoint contract: connectivity, path, schema version, read-only flag."""

from __future__ import annotations

import sqlite3

import pytest
from fastapi.testclient import TestClient


def test_health_reports_database(client, db_path):
    response = client.get('/api/health')
    assert response.status_code == 200
    body = response.json()
    assert body['status'] == 'ok'
    assert body['readonly'] is True
    assert body['user_version'] == 7
    assert body['db'] == str(db_path)


def test_connection_rejects_writes(client):
    # mode=ro is the guarantee behind `readonly: true`; assert the write fails
    # instead of silently depending on the connection setup.
    from app.db import get_db_path, open_readonly

    connection = open_readonly()
    try:
        with pytest.raises(sqlite3.OperationalError):
            connection.execute(
                'INSERT INTO zhihu_content (content_id, response_id) VALUES (?, ?)',
                ('x', 1),
            )
    finally:
        connection.close()
    assert get_db_path().is_file()


def test_health_returns_503_when_database_is_missing(tmp_path, monkeypatch):
    monkeypatch.setenv('ETO_DB', str(tmp_path / 'missing.db'))
    from app.main import app

    with TestClient(app) as test_client:
        response = test_client.get('/api/health')
    assert response.status_code == 503
    assert 'database not found' in response.json()['detail']
