# Alembic Migration Environment
# https://alembic.sqlalchemy.org/

from __future__ import annotations

from logging.config import fileConfig

from alembic import context
from sqlalchemy import engine_from_config, pool

# ── Load application settings ─────────────────────────────────────────────────
# We need to import our models so Alembic can auto-detect changes.
import sys
import os

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from app.core.config import get_settings
from app.core.database import Base

# Import all models so their metadata is registered on Base
from app.models import User, Meeting, MeetingParticipant, Recording, ChatMessage  # noqa: F401

settings = get_settings()

# ── Alembic Config ────────────────────────────────────────────────────────────
config = context.config

# Inject the database URL from our settings (overrides alembic.ini placeholder)
# Note: Alembic uses sync drivers; we strip the +asyncpg suffix.
sync_db_url = settings.database_url.replace("+asyncpg", "")
config.set_main_option("sqlalchemy.url", sync_db_url)

if config.config_file_name is not None:
    fileConfig(config.config_file_name)

import asyncio
from sqlalchemy.ext.asyncio import create_async_engine

target_metadata = Base.metadata


def run_migrations_offline() -> None:
    url = settings.database_url
    context.configure(
        url=url,
        target_metadata=target_metadata,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
    )
    with context.begin_transaction():
        context.run_migrations()


def do_run_migrations(connection):
    context.configure(connection=connection, target_metadata=target_metadata)
    with context.begin_transaction():
        context.run_migrations()


async def run_async_migrations():
    connectable = create_async_engine(settings.database_url, poolclass=pool.NullPool)
    async with connectable.connect() as connection:
        await connection.run_sync(do_run_migrations)
    await connectable.dispose()


def run_migrations_online() -> None:
    asyncio.run(run_async_migrations())


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
