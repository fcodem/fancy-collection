"""Migration: add monthly_serial column to bookings table."""
import sqlite3
import os

db_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), "cloth_rental.db")
conn = sqlite3.connect(db_path)
cur = conn.cursor()

try:
    cur.execute("ALTER TABLE bookings ADD COLUMN monthly_serial INTEGER DEFAULT 0")
    conn.commit()
    print("SUCCESS: monthly_serial column added to bookings table.")
except Exception as e:
    if "duplicate column" in str(e).lower():
        print("Column already exists – no changes needed.")
    else:
        print("Error:", e)

conn.close()
