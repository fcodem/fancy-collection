import sqlite3
from pathlib import Path

db = Path(__file__).resolve().parents[1] / "prisma" / "cloth_rental.db"
conn = sqlite3.connect(db)

date_cols = {
    "bookings": ["delivery_date", "return_date", "created_at", "delivered_at", "returned_at", "refunded_at"],
    "staff": ["created_at"],
    "staff_attendance": ["date"],
    "clothing_items": ["created_at"],
    "users": ["created_at"],
}

for table, cols in date_cols.items():
    for col in cols:
        try:
            rows = conn.execute(
                f"SELECT id, {col} FROM {table} WHERE {col} IS NOT NULL AND TRIM({col}) != ''"
            ).fetchall()
            bad = []
            for row_id, val in rows:
                s = str(val)
                if len(s) < 8 or any(ch not in "0123456789-: .TZ" for ch in s):
                    bad.append((row_id, s[:40]))
            print(f"{table}.{col}: {len(rows)} rows, {len(bad)} bad")
            if bad:
                print("  bad samples:", bad[:5])
        except Exception as e:
            print(f"{table}.{col}: ERROR {e}")

conn.close()
