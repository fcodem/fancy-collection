#!/usr/bin/env python3
"""
Migrate data from Flask SQLite (fancynew/cloth_rental.db) to PostgreSQL (DATABASE_URL).

Usage (from web/ directory):
  pip install psycopg2-binary python-dotenv
  python scripts/migrate_sqlite_to_postgres.py

Options:
  --sqlite PATH   Path to SQLite file (default: ../fancynew/cloth_rental.db)
  --clear         Truncate PostgreSQL tables before import (destructive)
  --dry-run       Print row counts only, do not write
"""

from __future__ import annotations

import argparse
import os
import sqlite3
import sys
from pathlib import Path
from typing import Any

try:
    import psycopg2
except ImportError:
    print("Install dependencies: pip install psycopg2-binary python-dotenv", file=sys.stderr)
    sys.exit(1)

try:
    from dotenv import load_dotenv
except ImportError:
    load_dotenv = None  # type: ignore

WEB_ROOT = Path(__file__).resolve().parent.parent
DEFAULT_SQLITE = WEB_ROOT.parent / "fancynew" / "cloth_rental.db"

# Table order respects foreign keys. Each entry: (sqlite_table, postgres_table, columns)
TABLES: list[tuple[str, str, list[str]]] = [
    ("staff", "staff", ["id", "name", "phone", "active", "created_at"]),
    ("users", "users", ["id", "username", "password_hash", "role", "staff_id", "active", "created_at"]),
    ("customers", "customers", ["id", "name", "phone", "email", "address", "id_proof", "notes", "created_at"]),
    ("clothing_items", "clothing_items", [
        "id", "name", "sku", "category", "size", "color", "daily_rate", "deposit",
        "status", "item_type", "photo", "condition_notes", "created_at", "sub_category",
    ]),
    ("custom_categories", "custom_categories", ["id", "name", "group", "active", "created_at"]),
    ("suppliers", "suppliers", ["id", "name", "phone", "address", "created_at"]),
    ("bookings", "bookings", [
        "id", "booking_number", "monthly_serial", "customer_name", "customer_address",
        "contact_1", "whatsapp_no", "delivery_date", "delivery_time", "return_date", "return_time",
        "venue", "security_deposit", "total_price", "total_advance", "total_remaining",
        "common_notes", "staff_names", "status", "created_at", "delivery_notes",
        "remaining_collected", "security_collected", "delivered_at", "returned_at",
        "incomplete_notes", "security_held", "item_id", "dress_name", "price", "advance",
        "remaining", "notes", "contact_2",
    ]),
    ("booking_items", "booking_items", [
        "id", "booking_id", "item_id", "dress_name", "category", "price", "advance",
        "remaining", "size", "notes", "prepared_by", "checked_by", "is_packed_ready", "packing_note",
    ]),
    ("rentals", "rentals", [
        "id", "rental_number", "customer_id", "start_date", "end_date", "actual_return_date",
        "status", "subtotal", "deposit_total", "late_fee", "damage_fee", "discount",
        "total_amount", "notes", "created_at",
    ]),
    ("rental_items", "rental_items", ["id", "rental_id", "item_id", "daily_rate", "deposit"]),
    ("invoices", "invoices", [
        "id", "invoice_number", "rental_id", "issue_date", "due_date", "subtotal",
        "tax_rate", "tax_amount", "total", "amount_paid", "status", "notes", "created_at",
    ]),
    ("payments", "payments", ["id", "invoice_id", "amount", "method", "reference", "notes", "paid_at"]),
    ("supplier_purchases", "supplier_purchases", [
        "id", "supplier_id", "item_description", "category", "amount", "gst_amount",
        "transaction_type", "date", "notes",
    ]),
    ("staff_login_requests", "staff_login_requests", [
        "id", "user_id", "token", "status", "requested_at", "resolved_at", "resolved_by_id",
    ]),
    ("user_sessions", "user_sessions", [
        "id", "user_id", "session_id", "active", "login_at", "last_seen", "ended_at", "ended_by_id",
    ]),
    ("staff_attendance", "staff_attendance", ["id", "staff_id", "date", "status"]),
]

TRUNCATE_ORDER = [t[1] for t in reversed(TABLES)]


def load_env() -> None:
    env_path = WEB_ROOT / ".env"
    if load_dotenv and env_path.exists():
        load_dotenv(env_path)


def sqlite_tables(conn: sqlite3.Connection) -> set[str]:
    rows = conn.execute("SELECT name FROM sqlite_master WHERE type='table'").fetchall()
    return {r[0] for r in rows}


def fetch_sqlite_rows(conn: sqlite3.Connection, table: str, columns: list[str]) -> list[tuple[Any, ...]]:
    existing = {row[1] for row in conn.execute(f"PRAGMA table_info({table})").fetchall()}
    cols = [c for c in columns if c in existing]
    if not cols:
        return []
    col_sql = ", ".join(f'"{c}"' for c in cols)
    cur = conn.execute(f'SELECT {col_sql} FROM "{table}" ORDER BY id')
    rows = cur.fetchall()
    # Pad missing trailing columns with None if sqlite schema is older
    if len(cols) < len(columns):
        idx_map = {c: columns.index(c) for c in cols}
        padded = []
        for row in rows:
            full = [None] * len(columns)
            for i, c in enumerate(cols):
                full[idx_map[c]] = row[i]
            padded.append(tuple(full))
        return padded
    return rows


def bool_val(v: Any) -> bool | None:
    if v is None:
        return None
    return bool(v)


def migrate(sqlite_path: Path, database_url: str, clear: bool, dry_run: bool) -> None:
    if not sqlite_path.exists():
        print(f"SQLite database not found: {sqlite_path}", file=sys.stderr)
        sys.exit(1)
    if not database_url:
        print("DATABASE_URL is not set. Add it to web/.env", file=sys.stderr)
        sys.exit(1)

    sq = sqlite3.connect(str(sqlite_path))
    sq.row_factory = sqlite3.Row
    available = sqlite_tables(sq)

    pg = psycopg2.connect(database_url)
    pg.autocommit = False
    cur = pg.cursor()

    try:
        if clear and not dry_run:
            print("Truncating PostgreSQL tables…")
            cur.execute("SET session_replication_role = replica")
            for table in TRUNCATE_ORDER:
                cur.execute(f'TRUNCATE TABLE "{table}" RESTART IDENTITY CASCADE')
            cur.execute("SET session_replication_role = DEFAULT")

        total_rows = 0
        for sqlite_table, pg_table, columns in TABLES:
            if sqlite_table not in available:
                print(f"  skip {sqlite_table} (not in SQLite)")
                continue
            rows = fetch_sqlite_rows(sq, sqlite_table, columns)
            print(f"  {sqlite_table}: {len(rows)} rows")
            total_rows += len(rows)
            if dry_run or not rows:
                continue

            placeholders = ", ".join(["%s"] * len(columns))
            col_list = ", ".join(f'"{c}"' for c in columns)
            sql = f'INSERT INTO "{pg_table}" ({col_list}) VALUES ({placeholders}) ON CONFLICT (id) DO NOTHING'

            # Normalize booleans for known columns
            normalized = []
            for row in rows:
                vals = list(row)
                for i, col in enumerate(columns):
                    if col in ("active", "is_packed_ready") and vals[i] is not None:
                        vals[i] = bool_val(vals[i])
                normalized.append(tuple(vals))

            cur.executemany(sql, normalized)

        if not dry_run:
            # Reset sequences to max(id)
            for _, pg_table, _ in TABLES:
                cur.execute(
                    f"""
                    SELECT setval(
                      pg_get_serial_sequence('"{pg_table}"', 'id'),
                      COALESCE((SELECT MAX(id) FROM "{pg_table}"), 1)
                    )
                    """
                )
            pg.commit()
            print(f"\nDone. Imported {total_rows} rows total.")
        else:
            print(f"\nDry run complete. Would import {total_rows} rows.")
    except Exception as e:
        pg.rollback()
        print(f"Migration failed: {e}", file=sys.stderr)
        raise
    finally:
        sq.close()
        cur.close()
        pg.close()


def main() -> None:
    load_env()
    parser = argparse.ArgumentParser(description="Migrate SQLite cloth_rental.db to PostgreSQL")
    parser.add_argument("--sqlite", type=Path, default=DEFAULT_SQLITE, help="Path to SQLite database")
    parser.add_argument("--database-url", dest="database_url", default="", help="PostgreSQL connection URL")
    parser.add_argument("--clear", action="store_true", help="Truncate target tables before import")
    parser.add_argument("--dry-run", action="store_true", help="Count rows only")
    args = parser.parse_args()

    database_url = args.database_url or os.environ.get("DATABASE_URL", "")
    print(f"Source: {args.sqlite}")
    print(f"Target: {database_url[:40]}…" if database_url else "Target: (missing DATABASE_URL)")
    migrate(args.sqlite, database_url, args.clear, args.dry_run)


if __name__ == "__main__":
    main()
