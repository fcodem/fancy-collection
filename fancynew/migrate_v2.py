"""Migration script to add new columns and tables for v2 features."""
import sqlite3
import os

DB_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), "cloth_rental.db")

conn = sqlite3.connect(DB_PATH)
cursor = conn.cursor()

migrations = [
    # Add sub_category to clothing_items
    "ALTER TABLE clothing_items ADD COLUMN sub_category VARCHAR(20) DEFAULT 'Normal'",
    # Add staff_names to bookings
    "ALTER TABLE bookings ADD COLUMN staff_names VARCHAR(500)",
    # Add size to booking_items
    "ALTER TABLE booking_items ADD COLUMN size VARCHAR(20)",
    # Create staff table
    """CREATE TABLE IF NOT EXISTS staff (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name VARCHAR(120) NOT NULL,
        phone VARCHAR(20),
        active BOOLEAN DEFAULT 1,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )""",
    # Create staff_attendance table
    """CREATE TABLE IF NOT EXISTS staff_attendance (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        staff_id INTEGER NOT NULL,
        date DATE NOT NULL,
        status VARCHAR(20) DEFAULT 'present',
        FOREIGN KEY (staff_id) REFERENCES staff(id)
    )""",
    # Create suppliers table
    """CREATE TABLE IF NOT EXISTS suppliers (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name VARCHAR(150) NOT NULL,
        phone VARCHAR(20),
        address TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )""",
    # Create supplier_purchases table
    """CREATE TABLE IF NOT EXISTS supplier_purchases (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        supplier_id INTEGER NOT NULL,
        item_description VARCHAR(250) NOT NULL,
        category VARCHAR(50),
        amount FLOAT NOT NULL DEFAULT 0,
        date DATE DEFAULT CURRENT_DATE,
        notes TEXT,
        FOREIGN KEY (supplier_id) REFERENCES suppliers(id)
    )""",
]

for sql in migrations:
    try:
        cursor.execute(sql)
        print(f"OK: {sql[:60]}...")
    except Exception as e:
        if "duplicate column" in str(e).lower() or "already exists" in str(e).lower():
            print(f"SKIP (already exists): {sql[:60]}...")
        else:
            print(f"ERROR: {e} | {sql[:60]}...")

conn.commit()
conn.close()
print("\nMigration complete!")
