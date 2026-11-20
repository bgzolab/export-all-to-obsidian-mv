"""Schema endpoint contract: grouping, primary keys, JSON and hidden columns."""

from __future__ import annotations

import sqlite3


def test_schema_groups_platforms_and_raw(client):
    response = client.get('/api/schema')
    assert response.status_code == 200
    body = response.json()
    tables = {table['name']: table for table in body['tables']}
    assert {'zhihu_content', 'bilibili_fav_item', 'sync_run', 'sync_response'} <= set(tables)
    assert tables['zhihu_content']['platform'] == 'zhihu'
    assert tables['zhihu_content']['kind'] == 'projection'
    assert tables['bilibili_fav_item']['platform'] == 'bilibili'
    assert tables['sync_run']['platform'] == 'raw'
    assert tables['sync_run']['kind'] == 'raw'
    assert body['platforms']['raw'] == 2


def test_schema_reports_primary_key_order(client):
    tables = {table['name']: table for table in client.get('/api/schema').json()['tables']}
    assert tables['zhihu_content']['primary_key'] == ['content_id']
    assert tables['bilibili_fav_item']['primary_key'] == ['fav_id', 'media_id']


def test_schema_marks_json_and_hidden_columns(client):
    tables = {table['name']: table for table in client.get('/api/schema').json()['tables']}
    columns = {column['name']: column for column in tables['zhihu_content']['columns']}
    assert columns['author_json']['json'] is True
    assert columns['title']['json'] is False
    raw_columns = {column['name']: column for column in tables['sync_response']['columns']}
    assert raw_columns['body']['hidden'] is True
    assert raw_columns['request']['json'] is True


def test_schema_reports_row_counts(client, db_path):
    connection = sqlite3.connect(db_path)
    connection.execute(
        "INSERT INTO zhihu_content (content_id, title, response_id) VALUES ('a', 'A', 1)"
    )
    connection.commit()
    connection.close()

    tables = {table['name']: table for table in client.get('/api/schema').json()['tables']}
    assert tables['zhihu_content']['row_count'] == 1
    assert tables['bilibili_fav_item']['row_count'] == 0
