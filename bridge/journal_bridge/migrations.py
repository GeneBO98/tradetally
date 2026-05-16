"""Minimal SQL migration runner for the bridge-owned journal_ext schema."""

from __future__ import annotations

import hashlib
import logging
from pathlib import Path

from journal_bridge.db import get_pool

log = logging.getLogger(__name__)

MIGRATIONS_DIR = Path(__file__).resolve().parents[1] / "migrations"


def _checksum(sql: str) -> str:
    return hashlib.sha256(sql.encode("utf-8")).hexdigest()


def run_migrations() -> int:
    """Apply pending bridge migrations. Returns the number applied."""
    if not MIGRATIONS_DIR.exists():
        log.warning("Bridge migrations directory not found: %s", MIGRATIONS_DIR)
        return 0

    migration_files = sorted(MIGRATIONS_DIR.glob("*.sql"))
    if not migration_files:
        return 0

    pool = get_pool()
    applied_count = 0

    with pool.connection() as conn:
        with conn.transaction():
            conn.execute("CREATE SCHEMA IF NOT EXISTS journal_ext")
            conn.execute(
                """
                CREATE TABLE IF NOT EXISTS journal_ext.schema_migrations (
                    filename TEXT PRIMARY KEY,
                    checksum TEXT NOT NULL,
                    applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
                )
                """
            )

        for migration_file in migration_files:
            sql = migration_file.read_text(encoding="utf-8")
            checksum = _checksum(sql)

            with conn.transaction():
                row = conn.execute(
                    "SELECT checksum FROM journal_ext.schema_migrations WHERE filename = %s",
                    (migration_file.name,),
                ).fetchone()

                if row:
                    if row["checksum"] != checksum:
                        raise RuntimeError(f"Bridge migration checksum changed: {migration_file.name}")
                    continue

                log.info("Running bridge migration %s", migration_file.name)
                conn.execute(sql)
                conn.execute(
                    """
                    INSERT INTO journal_ext.schema_migrations (filename, checksum)
                    VALUES (%s, %s)
                    """,
                    (migration_file.name, checksum),
                )
                applied_count += 1

    if applied_count:
        log.info("Applied %d bridge migration(s)", applied_count)

    return applied_count
