#!/usr/bin/env python3
"""
Full SQLite -> PostgreSQL port for Fancy Collection.

Creates database + schema (no npm/prisma required), then imports all rows
from fancynew/cloth_rental.db preserving IDs.

Usage (from web/):
  pip install psycopg2-binary python-dotenv
  python scripts/port_sqlite_to_postgres.py --password YOUR_POSTGRES_PASSWORD

Options:
  --password PASS   postgres user password (or set PGPASSWORD / DATABASE_URL)
  --host HOST       default localhost
  --port PORT       default 5432
  --user USER       default postgres
  --database NAME   default cloth_rental
  --dry-run         count rows only
  --skip-bootstrap  skip CREATE TABLE (tables must already exist)
"""

from __future__ import annotations

import argparse
import os
import sys
from pathlib import Path
from urllib.parse import quote_plus

WEB_ROOT = Path(__file__).resolve().parent.parent
DEFAULT_SQLITE = WEB_ROOT.parent / "fancynew" / "cloth_rental.db"
BOOTSTRAP_SQL = Path(__file__).resolve().parent / "bootstrap_postgres.sql"


def build_url(user: str, password: str, host: str, port: int, database: str) -> str:
    return f"postgresql://{quote_plus(user)}:{quote_plus(password)}@{host}:{port}/{database}"


def ensure_database(admin_url: str, database: str) -> None:
    import psycopg2
    from psycopg2.extensions import ISOLATION_LEVEL_AUTOCOMMIT

    conn = psycopg2.connect(admin_url)
    conn.set_isolation_level(ISOLATION_LEVEL_AUTOCOMMIT)
    cur = conn.cursor()
    cur.execute("SELECT 1 FROM pg_database WHERE datname = %s", (database,))
    if not cur.fetchone():
        print(f"Creating database '{database}'…")
        cur.execute(f'CREATE DATABASE "{database}"')
    else:
        print(f"Database '{database}' already exists.")
    cur.close()
    conn.close()


def run_bootstrap(database_url: str) -> None:
    import psycopg2

    sql = BOOTSTRAP_SQL.read_text(encoding="utf-8")
    conn = psycopg2.connect(database_url)
    cur = conn.cursor()
    print("Applying schema (bootstrap_postgres.sql)…")
    cur.execute(sql)
    conn.commit()
    cur.close()
    conn.close()
    print("Schema ready.")


def run_migration(sqlite_path: Path, database_url: str, clear: bool, dry_run: bool) -> None:
    # Reuse the existing migration module
    sys.path.insert(0, str(WEB_ROOT / "scripts"))
    from migrate_sqlite_to_postgres import migrate

    migrate(sqlite_path, database_url, clear=clear, dry_run=dry_run)


def write_env(database_url: str) -> None:
    env_path = WEB_ROOT / ".env"
    lines: list[str] = []
    if env_path.exists():
        for line in env_path.read_text(encoding="utf-8").splitlines():
            if not line.startswith("DATABASE_URL="):
                lines.append(line)
    lines.insert(0, f'DATABASE_URL="{database_url}"')
    if not any(l.startswith("SESSION_SECRET=") for l in lines):
        lines.append('SESSION_SECRET="change-this-to-a-long-random-string-at-least-32-chars"')
    env_path.write_text("\n".join(lines) + "\n", encoding="utf-8")
    print(f"Updated {env_path}")


def main() -> None:
    parser = argparse.ArgumentParser(description="Port SQLite cloth_rental.db to PostgreSQL")
    parser.add_argument("--password", help="PostgreSQL password (or use DATABASE_URL / PGPASSWORD)")
    parser.add_argument("--password-file", type=Path, help="Read password from file (deleted after use if --password-file-delete)")
    parser.add_argument("--password-file-delete", action="store_true", help="Delete password file after reading")
    parser.add_argument("--host", default="localhost")
    parser.add_argument("--port", type=int, default=5432)
    parser.add_argument("--user", default="postgres")
    parser.add_argument("--database", default="cloth_rental")
    parser.add_argument("--sqlite", type=Path, default=DEFAULT_SQLITE)
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument("--skip-bootstrap", action="store_true")
    parser.add_argument("--no-env", action="store_true", help="Do not write web/.env")
    args = parser.parse_args()

    password = args.password or os.environ.get("PGPASSWORD", "")
    if args.password_file:
        password = args.password_file.read_text(encoding="utf-8").strip()
        if args.password_file_delete:
            args.password_file.unlink(missing_ok=True)
    database_url = os.environ.get("DATABASE_URL", "")

    if not database_url and password:
        admin_url = build_url(args.user, password, args.host, args.port, "postgres")
        database_url = build_url(args.user, password, args.host, args.port, args.database)
    elif database_url and not password:
        password = ""  # URL already complete
        admin_url = database_url.rsplit("/", 1)[0] + "/postgres"
    else:
        print("Provide --password or set DATABASE_URL", file=sys.stderr)
        sys.exit(1)

    if not args.sqlite.exists():
        print(f"SQLite not found: {args.sqlite}", file=sys.stderr)
        sys.exit(1)

    print(f"Source: {args.sqlite}")
    print(f"Target: postgresql://{args.user}@{args.host}:{args.port}/{args.database}")

    try:
        import psycopg2  # noqa: F401
    except ImportError:
        print("Install: pip install psycopg2-binary", file=sys.stderr)
        sys.exit(1)

    if not args.dry_run and not args.skip_bootstrap:
        ensure_database(admin_url, args.database)
        run_bootstrap(database_url)

    run_migration(args.sqlite, database_url, clear=True, dry_run=args.dry_run)

    if not args.dry_run and not args.no_env:
        write_env(database_url)


if __name__ == "__main__":
    main()
