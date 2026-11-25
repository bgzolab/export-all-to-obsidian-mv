"""Timeline and heatmap contract: ordering, paging, day filter and missing tables."""

from __future__ import annotations

import sqlite3
from datetime import date, datetime, time, timedelta

import pytest


def _local_iso(day: date, hour: int = 12) -> str:
    return datetime.combine(day, time(hour)).astimezone().isoformat()


def _local_naive(day: date, hour: int = 12) -> str:
    return datetime.combine(day, time(hour)).isoformat(timespec='milliseconds')


def _local_epoch(day: date, hour: int = 12) -> int:
    return int(datetime.combine(day, time(hour)).timestamp())


@pytest.fixture()
def timeline_db(db_path):
    """Add the five timeline sources and five rows spread over consecutive days."""
    today = date(2026, 11, 20)
    days = [today - timedelta(days=offset) for offset in range(6)]
    connection = sqlite3.connect(db_path)
    connection.executescript(
        """
        CREATE TABLE bangumi_collection (
            subject_id INTEGER PRIMARY KEY,
            updated_at TEXT,
            subject_json TEXT NOT NULL
        );
        CREATE TABLE bilibili_media (
            media_id INTEGER PRIMARY KEY,
            title TEXT NOT NULL,
            cover TEXT,
            upper_json TEXT
        );
        DROP TABLE bilibili_fav_item;
        CREATE TABLE bilibili_fav_item (
            fav_id INTEGER NOT NULL,
            media_id INTEGER NOT NULL,
            fav_time INTEGER NOT NULL,
            PRIMARY KEY (fav_id, media_id)
        );
        CREATE TABLE cnblog_bookmark (
            wz_link_id INTEGER PRIMARY KEY,
            title TEXT NOT NULL,
            date_added TEXT
        );
        CREATE TABLE github_star (
            repo_id INTEGER PRIMARY KEY,
            full_name TEXT NOT NULL,
            description TEXT,
            language TEXT,
            owner_login TEXT,
            starred_at TEXT
        );
        CREATE TABLE qireader_entry (
            entry_id TEXT PRIMARY KEY,
            title TEXT NOT NULL,
            crawled_at INTEGER NOT NULL,
            timestamp TEXT NOT NULL
        );
        """
    )
    connection.execute(
        'INSERT INTO bangumi_collection VALUES (?, ?, ?)',
        (
            1,
            _local_iso(days[0]),
            '{"name_cn":"中文标题","name":"Original","images":{"large":"https://img.test/b.jpg"}}',
        ),
    )
    connection.execute(
        'INSERT INTO bilibili_media VALUES (?, ?, ?, ?)',
        (10, '视频标题', 'https://img.test/v.jpg', '{"name":"UP主"}'),
    )
    connection.executemany(
        'INSERT INTO bilibili_fav_item VALUES (?, ?, ?)',
        [(1, 10, _local_epoch(days[1], 10)), (2, 10, _local_epoch(days[1], 18))],
    )
    connection.execute(
        'INSERT INTO cnblog_bookmark VALUES (?, ?, ?)',
        (2, '博客标题', _local_naive(days[2])),
    )
    connection.execute(
        'INSERT INTO github_star VALUES (?, ?, ?, ?, ?, ?)',
        (
            3,
            'owner/repo',
            '仓库描述',
            'Python',
            'owner',
            _local_iso(days[3]),
        ),
    )
    connection.execute(
        'INSERT INTO qireader_entry VALUES (?, ?, ?, ?)',
        ('entry-1', '稍后读标题', _local_epoch(days[4]) * 1000, str(_local_epoch(days[4]) * 1_000_000_000)),
    )
    connection.commit()
    connection.close()
    return days


def test_timeline_orders_and_pages(client, timeline_db):
    first = client.get('/api/timeline?limit=2&offset=0')
    assert first.status_code == 200
    body = first.json()
    assert body['total'] == 5
    assert body['has_more'] is True
    assert [item['platform'] for item in body['items']] == ['bangumi', 'bilibili']
    assert body['items'][0]['pk'] == {'subject_id': 1}
    assert body['items'][0]['title'] == '中文标题'
    assert body['items'][0]['cover'] == 'https://img.test/b.jpg'
    assert body['items'][0]['day'] == timeline_db[0].isoformat()
    assert body['items'][0]['time_label'] == '收藏更新'

    second = client.get('/api/timeline?limit=2&offset=2').json()
    assert second['total'] == 5
    assert second['has_more'] is True
    assert [item['platform'] for item in second['items']] == ['cnblog', 'github']

    last = client.get('/api/timeline?limit=2&offset=4').json()
    assert last['has_more'] is False
    assert [item['platform'] for item in last['items']] == ['qireader']


def test_timeline_deduplicates_relations(client, timeline_db):
    body = client.get('/api/timeline?day=' + timeline_db[1].isoformat()).json()
    # Two fav rows for one media contribute one timeline item at its latest
    # save time.
    assert [item['platform'] for item in body['items']] == ['bilibili']
    assert body['items'][0]['pk'] == {'media_id': 10}


def test_timeline_day_filter_and_validation(client, timeline_db):
    target = timeline_db[3].isoformat()
    body = client.get(f'/api/timeline?day={target}').json()
    assert body['total'] == 1
    assert body['items'][0]['platform'] == 'github'

    assert client.get('/api/timeline?day=2026-13-99').status_code == 400
    assert client.get('/api/timeline?day=not-a-day').status_code == 400


def test_timeline_year_filter(client, timeline_db):
    body = client.get('/api/timeline?year=2026').json()
    assert body['total'] == 5
    assert client.get('/api/timeline?year=2025').json()['total'] == 0
    assert client.get('/api/timeline?year=1800').status_code == 400


def test_heatmap_returns_sunday_aligned_zero_filled_days(client, timeline_db):
    body = client.get('/api/timeline/heatmap?year=2026').json()
    start = date.fromisoformat(body['start'])
    end = date.fromisoformat(body['end'])
    assert body['year'] == 2026
    assert body['years'] == [2026]
    assert start.weekday() == 6
    assert end.weekday() == 5
    assert start <= date(2026, 1, 1)
    assert end >= date(2026, 12, 31)
    assert len(body['days']) == (end - start).days + 1
    assert all('date' in day and 'count' in day for day in body['days'])
    assert body['total'] == 5
    counts = {day['date']: day['count'] for day in body['days']}
    for item_day in timeline_db[:-1]:
        assert counts[item_day.isoformat()] == 1
    assert client.get('/api/timeline/heatmap?year=1800').status_code == 400


def test_zhihu_collection_created_is_not_used(client, db_path):
    connection = sqlite3.connect(db_path)
    connection.executescript(
        """
        CREATE TABLE zhihu_collection_item (
            collection_id TEXT NOT NULL,
            content_id TEXT NOT NULL,
            created TEXT NOT NULL,
            PRIMARY KEY (collection_id, content_id)
        );
        """
    )
    connection.execute(
        "INSERT INTO zhihu_content (content_id, title, response_id) VALUES ('z1', 'old answer', 1)"
    )
    connection.execute(
        "INSERT INTO zhihu_collection_item VALUES ('c1', 'z1', '2011-05-08T09:45:31+08:00')"
    )
    connection.commit()
    connection.close()

    # The Zhihu item `created` is the content publication time, not the time it
    # was added to the collection; the timeline must ignore the whole platform.
    assert client.get('/api/timeline?year=2011').json()['total'] == 0
    assert client.get('/api/timeline/heatmap?year=2011').json()['total'] == 0


def test_timeline_is_empty_without_platform_tables(client):
    body = client.get('/api/timeline').json()
    assert body == {'items': [], 'total': 0, 'limit': 30, 'offset': 0, 'has_more': False}

    heatmap = client.get('/api/timeline/heatmap').json()
    assert heatmap['total'] == 0
    assert heatmap['max'] == 0
    assert heatmap['years'] == []
    assert all(day['count'] == 0 for day in heatmap['days'])
