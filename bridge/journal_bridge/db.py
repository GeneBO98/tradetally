from __future__ import annotations

from psycopg.rows import dict_row
from psycopg_pool import ConnectionPool

from journal_bridge.config import settings

_pool: ConnectionPool | None = None


def get_pool() -> ConnectionPool:
    global _pool
    if _pool is None:
        _pool = ConnectionPool(
            settings.database_url,
            min_size=settings.db_pool_min,
            max_size=settings.db_pool_max,
            timeout=settings.db_pool_timeout,
            kwargs={
                "row_factory": dict_row,
                "connect_timeout": settings.db_connection_timeout,
            },
        )
    return _pool


def close_pool() -> None:
    global _pool
    if _pool is not None:
        _pool.close()
        _pool = None
