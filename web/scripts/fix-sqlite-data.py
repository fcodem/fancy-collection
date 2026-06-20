"""Normalize SQLite datetime/boolean values for Prisma compatibility."""
import sqlite3
from pathlib import Path

db = Path(__file__).resolve().parents[1] / "prisma" / "cloth_rental.db"
conn = sqlite3.connect(db)

datetime_tables = {
    "bookings": ["delivery_date", "return_date", "created_at", "delivered_at", "returned_at", "refunded_at"],
    "staff": ["created_at"],
    "staff_attendance": ["date"],
    "clothing_items": ["created_at"],
    "users": ["created_at"],
    "customers": ["created_at"],
    "rentals": ["start_date", "end_date", "actual_return_date", "created_at"],
    "invoices": ["issue_date", "due_date", "created_at"],
    "payments": ["paid_at"],
    "supplier_purchases": ["date"],
    "prospect_leads": ["delivery_date", "return_date", "last_reminder_at", "created_at"],
    "shop_enquiries": ["visit_date", "created_at"],
    "user_sessions": ["login_at", "last_seen", "ended_at"],
    "staff_login_requests": ["requested_at", "resolved_at"],
    "custom_categories": ["created_at"],
    "suppliers": ["created_at"],
}

def norm_dt(val):
    if val is None:
        return None
    s = str(val).strip()
    if not s:
        return None
    if len(s) == 10 and s[4] == "-" and s[7] == "-":
        return s + "T00:00:00.000Z"
    if " " in s and "T" not in s:
        return s.replace(" ", "T", 1) + ("Z" if not s.endswith("Z") else "")
    return s

for table, cols in datetime_tables.items():
    try:
        exists = conn.execute(
            "SELECT name FROM sqlite_master WHERE type='table' AND name=?", (table,)
        ).fetchone()
        if not exists:
            continue
        table_cols = {r[1] for r in conn.execute(f"PRAGMA table_info({table})").fetchall()}
        for col in cols:
            if col not in table_cols:
                continue
            rows = conn.execute(f"SELECT id, {col} FROM {table} WHERE {col} IS NOT NULL").fetchall()
            updated = 0
            for row_id, val in rows:
                new_val = norm_dt(val)
                if new_val and new_val != val:
                    conn.execute(f"UPDATE {table} SET {col}=? WHERE id=?", (new_val, row_id))
                    updated += 1
            if updated:
                print(f"Updated {table}.{col}: {updated} rows")
    except Exception as e:
        print(f"Skip {table}: {e}")

# Normalize boolean columns stored as text
for table, col in [("users", "active"), ("staff", "active"), ("booking_items", "is_packed_ready")]:
    try:
        rows = conn.execute(f"SELECT id, {col} FROM {table}").fetchall()
        for row_id, val in rows:
            if val in ("true", "false", True, False):
                new_val = 1 if str(val).lower() == "true" or val is True else 0
                conn.execute(f"UPDATE {table} SET {col}=? WHERE id=?", (new_val, row_id))
        print(f"Normalized booleans in {table}.{col}")
    except Exception as e:
        print(f"Skip bool {table}.{col}: {e}")

conn.commit()
conn.close()
print("Done.")
