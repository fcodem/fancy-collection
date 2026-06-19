#!/usr/bin/env python3
"""
Migrate SQLite data from fancynew/cloth_rental.db to PostgreSQL.

Usage (from web/ directory):
  pip install psycopg2-binary python-dotenv
  python ../scripts/migrate_sqlite_to_postgres.py

Or set SQLITE_PATH and DATABASE_URL environment variables.
"""
from __future__ import annotations

import os
import sqlite3
import sys
from datetime import datetime
from pathlib import Path

try:
    import psycopg2
    from psycopg2.extras import execute_values
except ImportError:
    print("Install: pip install psycopg2-binary")
    sys.exit(1)

ROOT = Path(__file__).resolve().parent.parent
SQLITE_PATH = os.environ.get("SQLITE_PATH", str(ROOT / "fancynew" / "cloth_rental.db"))
DATABASE_URL = os.environ.get("DATABASE_URL", "")

if not DATABASE_URL:
    env_file = ROOT / "web" / ".env"
    if env_file.exists():
        for line in env_file.read_text(encoding="utf-8").splitlines():
            if line.startswith("DATABASE_URL="):
                DATABASE_URL = line.split("=", 1)[1].strip().strip('"').strip("'")
                break

if not DATABASE_URL:
    print("Set DATABASE_URL in web/.env or environment")
    sys.exit(1)

if not Path(SQLITE_PATH).exists():
    print(f"SQLite not found: {SQLITE_PATH}")
    sys.exit(1)


def parse_dt(v):
    if not v:
        return None
    if isinstance(v, datetime):
        return v
    for fmt in ("%Y-%m-%d %H:%M:%S.%f", "%Y-%m-%d %H:%M:%S", "%Y-%m-%d"):
        try:
            return datetime.strptime(str(v), fmt)
        except ValueError:
            continue
    return str(v)


TABLES_ORDER = [
    ("staff", []),
    ("users", ["staff_id"]),
    ("customers", []),
    ("clothing_items", []),
    ("custom_categories", []),
    ("suppliers", []),
    ("bookings", ["item_id"]),
    ("booking_items", ["booking_id", "item_id"]),
    ("rentals", ["customer_id"]),
    ("rental_items", ["rental_id", "item_id"]),
    ("invoices", ["rental_id"]),
    ("payments", ["invoice_id"]),
    ("staff_attendance", ["staff_id"]),
    ("supplier_purchases", ["supplier_id"]),
    ("staff_login_requests", ["user_id", "resolved_by_id"]),
    ("user_sessions", ["user_id", "ended_by_id"]),
]

COLUMN_MAP = {
    "users": {
        "password_hash": "password_hash",
        "staff_id": "staff_id",
        "created_at": "created_at",
    },
}

DELETE_ORDER = [t[0] for t in reversed(TABLES_ORDER)]


def main():
    print("SQLite:", SQLITE_PATH)
    print("Postgres:", DATABASE_URL[:40] + "...")

    sqlite = sqlite3.connect(SQLITE_PATH)
    sqlite.row_factory = sqlite3.Row
    pg = psycopg2.connect(DATABASE_URL)
    pg.autocommit = False
    cur = pg.cursor()

    print("Clearing existing Postgres data...")
    for table in DELETE_ORDER:
        cur.execute(f"DELETE FROM {table}")
    pg.commit()

    for table, _fks in TABLES_ORDER:
        rows = sqlite.execute(f"SELECT * FROM {table}").fetchall()
        if not rows:
            print(f"  {table}: 0 rows (skip)")
            continue
        cols = rows[0].keys()
        col_list = ", ".join(cols)
        placeholders = ", ".join(["%s"] * len(cols))
        values = []
        for row in rows:
            vals = []
            for c in cols:
                v = row[c]
                if isinstance(v, str) and ("_at" in c or c in ("delivery_date", "return_date", "start_date", "end_date", "date", "issue_date", "due_date", "actual_return_date")):
                    vals.append(parse_dt(v))
                elif c in ("active", "is_packed_ready") and v is not None:
                    vals.append(bool(v))
                else:
                    vals.append(v)
            values.append(tuple(vals))
        sql = f"INSERT INTO {table} ({col_list}) VALUES ({placeholders})"
        cur.executemany(sql, values)
        # Reset sequence
        cur.execute(f"SELECT setval(pg_get_serial_sequence('{table}', 'id'), COALESCE((SELECT MAX(id) FROM {table}), 1))")
        print(f"  {table}: {len(rows)} rows")
        pg.commit()

    sqlite.close()
    pg.commit()
    cur.close()
    pg.close()
    print("\nMigration complete!")
    print("Run: cd web && npx prisma generate")


if __name__ == "__main__":
    main()
