"""Home timeline and collection heatmap.

The export database deliberately has no normalized cross-platform item table.
This module maps the six platforms that store a real save/collection time onto a
common shape with static SQL. Platforms whose only timestamp is the sync time
(Twitter, V2EX, Weibo, NetEase) are left out for now: mixing them in would turn
one sync run into a fake collection spike.

Every source is skipped when one of its tables is missing, so a partially
populated database still renders instead of failing the whole page.
"""

from __future__ import annotations

import json
import re
import sqlite3
from dataclasses import dataclass
from datetime import date, timedelta
from typing import Any

from fastapi import HTTPException

MAX_LIMIT = 100
DEFAULT_LIMIT = 30
DAY_PATTERN = re.compile(r'^\d{4}-\d{2}-\d{2}$')


@dataclass(frozen=True)
class TimelineSource:
    tables: tuple[str, ...]
    sql: str


SOURCES: tuple[TimelineSource, ...] = (
    TimelineSource(
        tables=('bangumi_collection',),
        sql="""
SELECT 'bangumi' AS platform, 'bangumi_collection' AS table_name,
       json_object('subject_id', subject_id) AS pk_json,
       COALESCE(NULLIF(json_extract(subject_json, '$.name_cn'), ''),
                json_extract(subject_json, '$.name'), '') AS title,
       COALESCE(json_extract(subject_json, '$.name'), '') AS subtitle,
       COALESCE(NULLIF(json_extract(subject_json, '$.images.large'), ''),
                json_extract(subject_json, '$.images.common'), '') AS cover,
       CAST(strftime('%s', updated_at) AS INTEGER) AS occurred_at,
       '收藏更新' AS time_label
FROM bangumi_collection
WHERE updated_at IS NOT NULL AND updated_at <> ''
  AND strftime('%s', updated_at) IS NOT NULL
""",
    ),
    TimelineSource(
        tables=('bilibili_media', 'bilibili_fav_item'),
        sql="""
SELECT 'bilibili', 'bilibili_media', json_object('media_id', m.media_id), m.title,
       COALESCE(NULLIF(json_extract(m.upper_json, '$.name'), ''), ''),
       m.cover, CAST(MAX(f.fav_time) AS INTEGER), '收藏'
FROM bilibili_media m
JOIN bilibili_fav_item f ON f.media_id = m.media_id
WHERE f.fav_time > 0
GROUP BY m.media_id
""",
    ),
    TimelineSource(
        tables=('cnblog_bookmark',),
        sql="""
SELECT 'cnblog', 'cnblog_bookmark', json_object('wz_link_id', wz_link_id), title,
       '', '', CAST(strftime('%s', date_added, 'utc') AS INTEGER), '收藏'
FROM cnblog_bookmark
WHERE date_added IS NOT NULL AND date_added <> ''
  AND strftime('%s', date_added, 'utc') IS NOT NULL
""",
    ),
    TimelineSource(
        tables=('github_star',),
        sql="""
SELECT 'github', 'github_star', json_object('repo_id', repo_id), full_name,
       COALESCE(NULLIF(substr(description, 1, 120), ''), language, ''),
       '',
       CAST(strftime('%s', starred_at) AS INTEGER), 'Star'
FROM github_star
WHERE starred_at IS NOT NULL AND starred_at <> ''
  AND strftime('%s', starred_at) IS NOT NULL
""",
    ),
    TimelineSource(
        tables=('qireader_entry',),
        sql="""
SELECT 'qireader', 'qireader_entry', json_object('entry_id', entry_id), title,
       '', '', CAST(CAST(timestamp AS INTEGER) / 1000000000 AS INTEGER), '稍后读'
FROM qireader_entry
WHERE timestamp <> '' AND CAST(timestamp AS INTEGER) > 0
""",
    ),
    TimelineSource(
        tables=('zhihu_content', 'zhihu_collection_item'),
        sql="""
SELECT 'zhihu', 'zhihu_content', json_object('content_id', c.content_id), c.title,
       COALESCE(json_extract(c.author_json, '$.name'), c.type, ''), '',
       CAST(strftime('%s', ci.saved_at) AS INTEGER), '收藏'
FROM zhihu_content c
JOIN (
  SELECT content_id, MAX(created) AS saved_at
  FROM zhihu_collection_item
  WHERE created <> ''
  GROUP BY content_id
) ci ON ci.content_id = c.content_id
WHERE strftime('%s', ci.saved_at) IS NOT NULL
""",
    ),
)


def _available_sources(connection: sqlite3.Connection) -> list[TimelineSource]:
    names = {
        row[0]
        for row in connection.execute(
            "SELECT name FROM sqlite_master WHERE type = 'table'"
        )
    }
    return [source for source in SOURCES if all(table in names for table in source.tables)]


def _cte(connection: sqlite3.Connection) -> str | None:
    sources = _available_sources(connection)
    if not sources:
        return None
    union = ' UNION ALL '.join(source.sql.strip() for source in sources)
    return (
        f'WITH activity AS ({union}), '
        'timeline AS ('
        "SELECT *, date(occurred_at, 'unixepoch', 'localtime') AS day "
        'FROM activity WHERE occurred_at > 0'
        ')'
    )


def _valid_day(day: str | None) -> str | None:
    if day is None:
        return None
    if not DAY_PATTERN.match(day):
        raise HTTPException(status_code=400, detail='day must be YYYY-MM-DD')
    try:
        parsed = date.fromisoformat(day)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail='day must be a real date') from exc
    if parsed.isoformat() != day:
        raise HTTPException(status_code=400, detail='day must be YYYY-MM-DD')
    return day


def _valid_year(year: int | None) -> int | None:
    if year is None:
        return None
    if not 1900 <= year <= 2100:
        raise HTTPException(status_code=400, detail='year must be between 1900 and 2100')
    return year


def list_timeline(
    connection: sqlite3.Connection,
    *,
    day: str | None = None,
    year: int | None = None,
    limit: int = DEFAULT_LIMIT,
    offset: int = 0,
) -> dict[str, Any]:
    """Return one newest-first page of collected items."""
    selected_day = _valid_day(day)
    selected_year = _valid_year(year)
    limit = max(1, min(limit, MAX_LIMIT))
    offset = max(offset, 0)
    cte = _cte(connection)
    empty = {
        'items': [],
        'total': 0,
        'limit': limit,
        'offset': offset,
        'has_more': False,
    }
    if cte is None:
        return empty

    clauses: list[str] = []
    params: list[Any] = []
    if selected_year is not None:
        clauses.append('substr(day, 1, 4) = ?')
        params.append(str(selected_year))
    if selected_day:
        clauses.append('day = ?')
        params.append(selected_day)
    where = f"WHERE {' AND '.join(clauses)}" if clauses else ''
    total = connection.execute(
        f'{cte} SELECT COUNT(*) FROM timeline {where}', params
    ).fetchone()[0]
    rows = connection.execute(
        f"""
{cte}
SELECT platform, table_name, pk_json, title, subtitle, cover,
       occurred_at, time_label, day
FROM timeline {where}
ORDER BY occurred_at DESC, platform ASC, pk_json ASC
LIMIT ? OFFSET ?
""",
        [*params, limit, offset],
    ).fetchall()

    items = []
    for row in rows:
        try:
            pk = json.loads(row['pk_json']) if row['pk_json'] else {}
        except (TypeError, ValueError):
            pk = {}
        if not isinstance(pk, dict) or not pk:
            continue
        items.append(
            {
                'key': f"{row['platform']}:{row['pk_json']}",
                'platform': row['platform'],
                'table': row['table_name'],
                'pk': pk,
                'title': row['title'] or '',
                'subtitle': row['subtitle'] or '',
                'cover': row['cover'] or '',
                'occurred_at': row['occurred_at'],
                'time_label': row['time_label'],
                'day': row['day'],
            }
        )
    return {
        'items': items,
        'total': total,
        'limit': limit,
        'offset': offset,
        'has_more': offset + len(rows) < total,
    }


def _available_years(
    connection: sqlite3.Connection, cte: str | None
) -> list[int]:
    if cte is None:
        return []
    rows = connection.execute(
        f"""
{cte}
SELECT DISTINCT CAST(strftime('%Y', occurred_at, 'unixepoch', 'localtime') AS INTEGER) AS year
FROM timeline
WHERE occurred_at > 0
ORDER BY year DESC
"""
    ).fetchall()
    return [int(row['year']) for row in rows if row['year']]


def heatmap(
    connection: sqlite3.Connection,
    *,
    year: int | None = None,
    today: date | None = None,
) -> dict[str, Any]:
    """Return one count per local day for the requested calendar year.

    The grid starts on the Sunday before Jan 1 and ends on the Saturday after
    Dec 31 so the frontend can fill seven rows without special-casing the first
    column. Adjacent-year days stay at zero; the year total only counts the
    selected year.
    """
    year = _valid_year(year)
    current = today or date.today()
    cte = _cte(connection)
    years = _available_years(connection, cte)
    if year is None:
        year = current.year if current.year in years else (years[0] if years else current.year)
    if years and year not in years:
        years = sorted({year, *years}, reverse=True)

    year_start = date(year, 1, 1)
    year_end = date(year, 12, 31)
    start = year_start - timedelta(days=(year_start.weekday() + 1) % 7)
    end = year_end + timedelta(days=6 - (year_end.weekday() + 1) % 7)

    counts: dict[str, int] = {}
    if cte is not None:
        rows = connection.execute(
            f"""
{cte}
SELECT day, COUNT(*) AS count
FROM timeline
WHERE day BETWEEN ? AND ?
GROUP BY day
""",
            [year_start.isoformat(), year_end.isoformat()],
        ).fetchall()
        counts = {row['day']: row['count'] for row in rows}

    days = []
    cursor = start
    while cursor <= end:
        key = cursor.isoformat()
        days.append({'date': key, 'count': counts.get(key, 0)})
        cursor += timedelta(days=1)
    total = sum(day['count'] for day in days)
    return {
        'year': year,
        'years': years,
        'start': start.isoformat(),
        'end': end.isoformat(),
        'days': days,
        'total': total,
        'max': max((day['count'] for day in days), default=0),
    }
