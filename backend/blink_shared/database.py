"""Database connection and engine setup.

Two engines are exposed:

- ``engine`` (sync, psycopg2) — used by Alembic migrations.
- ``async_engine`` (asyncpg) — used by the FastAPI application at request time
  and by the SSE handler when issuing ``LISTEN``/``NOTIFY``.

Both build their connection from ``settings.database_url`` via a creator
function so we can pass extra kwargs (sslmode, etc.) without re-encoding the
URL.
"""
import asyncpg
import psycopg2
from sqlalchemy import Engine, create_engine
from sqlalchemy.engine.url import make_url
from sqlalchemy.ext.asyncio import (
    AsyncEngine,
    AsyncSession,
    async_sessionmaker,
    create_async_engine,
)

from blink_shared.config import settings


def _get_raw_connection():
    url = make_url(str(settings.database_url))
    return psycopg2.connect(
        host=url.host,
        port=url.port or 5432,
        database=url.database,
        user=url.username,
        password=url.password,
        sslmode=settings.db_sslmode,
    )


async def _get_async_raw_connection():
    url = make_url(str(settings.database_url))
    # asyncpg accepts the same sslmode strings as libpq, except "disable"
    # which it represents as ssl=False.
    ssl = False if settings.db_sslmode == "disable" else settings.db_sslmode
    return await asyncpg.connect(
        host=url.host,
        port=url.port or 5432,
        database=url.database,
        user=url.username,
        password=url.password,
        ssl=ssl,
    )


# Sync engine — Alembic migrations.
engine: Engine = create_engine(
    "postgresql://",
    creator=_get_raw_connection,
    pool_size=settings.db_pool_size,
    max_overflow=settings.db_max_overflow,
    pool_timeout=settings.db_pool_timeout,
    pool_recycle=settings.db_pool_recycle,
    pool_pre_ping=settings.db_pool_pre_ping,
    echo=settings.debug,
)

# Async engine — FastAPI application + SSE pg_notify listener.
async_engine: AsyncEngine = create_async_engine(
    "postgresql+asyncpg://",
    async_creator=_get_async_raw_connection,
    pool_size=settings.db_pool_size,
    max_overflow=settings.db_max_overflow,
    pool_timeout=settings.db_pool_timeout,
    pool_recycle=settings.db_pool_recycle,
    pool_pre_ping=settings.db_pool_pre_ping,
    echo=settings.debug,
)

AsyncSessionLocal = async_sessionmaker(
    bind=async_engine,
    class_=AsyncSession,
    expire_on_commit=False,
)
