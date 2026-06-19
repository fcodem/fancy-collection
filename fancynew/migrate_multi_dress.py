"""Migration: Add booking_items table and new columns to bookings for multi-dress support."""
import sqlite3
import os

DB_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), "cloth_rental.db")

conn = sqlite3.connect(DB_PATH)
cursor = conn.cursor()

# Add new columns to bookings table
new_columns = [
    ("whatsapp_no", "VARCHAR(20)"),
    ("security_deposit", "FLOAT DEFAULT 0"),
    ("total_price", "FLOAT DEFAULT 0"),
    ("total_advance", "FLOAT DEFAULT 0"),
    ("total_remaining", "FLOAT DEFAULT 0"),
    ("common_notes", "TEXT"),
]

for col_name, col_type in new_columns:
    try:
        cursor.execute(f"ALTER TABLE bookings ADD COLUMN {col_name} {col_type}")
        print(f"Added column: bookings.{col_name}")
    except sqlite3.OperationalError as e:
        if "duplicate column" in str(e).lower():
            print(f"Column bookings.{col_name} already exists, skipping.")
        else:
            raise

# Make item_id nullable (SQLite doesn't support ALTER COLUMN, but new inserts can leave it null)
# No action needed for SQLite - it doesn't enforce NOT NULL on existing columns after ALTER

# Create booking_items table
cursor.execute("""
CREATE TABLE IF NOT EXISTS booking_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    booking_id INTEGER NOT NULL,
    item_id INTEGER NOT NULL,
    dress_name VARCHAR(150) NOT NULL,
    category VARCHAR(50),
    price FLOAT NOT NULL DEFAULT 0,
    advance FLOAT NOT NULL DEFAULT 0,
    remaining FLOAT NOT NULL DEFAULT 0,
    notes TEXT,
    FOREIGN KEY (booking_id) REFERENCES bookings(id),
    FOREIGN KEY (item_id) REFERENCES clothing_items(id)
)
""")
print("Created table: booking_items")

conn.commit()
conn.close()
print("\nMigration complete!")
