"""Migration: add photo column to clothing_items table."""
import sqlite3
import os

db_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), "cloth_rental.db")
conn = sqlite3.connect(db_path)
cur = conn.cursor()

try:
    cur.execute("ALTER TABLE clothing_items ADD COLUMN photo VARCHAR(255) DEFAULT ''")
    conn.commit()
    print("SUCCESS: photo column added to clothing_items table.")
except Exception as e:
    if "duplicate column" in str(e).lower():
        print("Column already exists – no changes needed.")
    else:
        print("Error:", e)

conn.close()
