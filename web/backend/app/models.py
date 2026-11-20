"""Request models for the generic table API.

Pydantic validates shape only (types, list containers, direction literals); table
and column allowlisting stays in `query.py` because it needs live schema data.
"""

from __future__ import annotations

from typing import Any

from pydantic import BaseModel, Field


class Filter(BaseModel):
    # Kept as plain strings; query.py returns 400 for values outside the
    # documented allowlist instead of Pydantic's default 422.
    column: str
    op: str
    value: Any = None


class SortSpec(BaseModel):
    column: str
    dir: str = 'asc'


class QueryRequest(BaseModel):
    columns: list[str] | None = None
    filters: list[Filter] = Field(default_factory=list, max_length=50)
    search: str | None = None
    sort: list[SortSpec] = Field(default_factory=list, max_length=10)
    # The builder clamps to 200; accepting larger values keeps clients simple.
    limit: int = Field(default=50, ge=1)
    offset: int = Field(default=0, ge=0)


class RowRequest(BaseModel):
    pk: dict[str, Any]


class QueryResponse(BaseModel):
    table: str
    columns: list[dict]
    rows: list[dict]
    total: int
    limit: int
    offset: int
