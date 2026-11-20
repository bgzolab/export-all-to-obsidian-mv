"""Shared fixtures: a tiny SQLite database and a TestClient bound to it.

The real export is 297MB and lives outside the repo checkout, so tests build a
minimal in-memory schema on disk and point ETO_DB at it. Each fixture run gets a
fresh file to keep tests independent.
"""

from __future__ import annotations

import sqlite3

import pytest
from fastapi.testclient import TestClient

SCHEMA = """
CREATE TABLE zhihu_content (
    content_id TEXT PRIMARY KEY,
    type TEXT NOT NULL DEFAULT '',
    url TEXT NOT NULL DEFAULT '',
    title TEXT NOT NULL DEFAULT '',
    body_html TEXT NOT NULL DEFAULT '',
    content_json TEXT,
    voteup_count INTEGER NOT NULL DEFAULT 0,
    created_time INTEGER NOT NULL DEFAULT 0,
    updated_time INTEGER NOT NULL DEFAULT 0,
    author_json TEXT,
    response_id INTEGER NOT NULL
);
CREATE TABLE sync_run (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    platform TEXT NOT NULL,
    operation TEXT NOT NULL,
    status TEXT NOT NULL,
    started_at TEXT NOT NULL
);
CREATE TABLE sync_response (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    run_id INTEGER NOT NULL,
    endpoint TEXT NOT NULL,
    request TEXT,
    status_code INTEGER,
    fetched_at TEXT NOT NULL,
    body BLOB,
    sha256 TEXT,
    error TEXT
);
"""


@pytest.fixture()
def db_path(tmp_path, monkeypatch):
    path = tmp_path / 'eto.db'
    connection = sqlite3.connect(path)
    connection.executescript(SCHEMA)
    connection.execute('PRAGMA user_version=7')
    connection.commit()
    connection.close()
    monkeypatch.setenv('ETO_DB', str(path))
    return path


@pytest.fixture()
def client(db_path):
    from app.main import app

    with TestClient(app) as test_client:
        yield test_client
