"""Ensure SQLite has columns required by the current Prisma schema."""
import sqlite3
import os

DB = os.path.join(os.path.dirname(__file__), "..", "prisma", "cloth_rental.db")

ALTERS = [
    "ALTER TABLE booking_items ADD COLUMN is_delivered INTEGER NOT NULL DEFAULT 0",
    "ALTER TABLE booking_items ADD COLUMN delivered_at TEXT",
    "ALTER TABLE booking_items ADD COLUMN item_remaining_collected REAL NOT NULL DEFAULT 0",
    "ALTER TABLE booking_items ADD COLUMN item_security_collected REAL NOT NULL DEFAULT 0",
    "ALTER TABLE booking_items ADD COLUMN item_delivery_notes TEXT",
    "ALTER TABLE booking_items ADD COLUMN is_returned INTEGER NOT NULL DEFAULT 0",
    "ALTER TABLE suppliers ADD COLUMN gst_no TEXT",
    "ALTER TABLE suppliers ADD COLUMN account_details TEXT",
    "ALTER TABLE supplier_purchases ADD COLUMN gst_percent REAL NOT NULL DEFAULT 0",
]

def main():
    if not os.path.exists(DB):
        print(f"DB not found: {DB}")
        return
    conn = sqlite3.connect(DB)
    for sql in ALTERS:
        try:
            conn.execute(sql)
            print(f"Added: {sql[:50]}...")
        except sqlite3.OperationalError as e:
            if "duplicate column" in str(e).lower():
                pass
            else:
                print(f"Skip/error: {e}")
    conn.commit()
    conn.close()
    print("Done.")

if __name__ == "__main__":
    main()
