"""Migration v3: Add delivery/return panel fields to bookings table."""
import sqlite3
import os

DB_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), "cloth_rental.db")

def migrate():
    if not os.path.exists(DB_PATH):
        print("Database not found. Will be created on first run.")
        return

    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()

    columns_to_add = [
        ("delivery_notes", "TEXT"),
        ("remaining_collected", "REAL DEFAULT 0"),
        ("security_collected", "REAL DEFAULT 0"),
        ("delivered_at", "DATETIME"),
        ("returned_at", "DATETIME"),
        ("incomplete_notes", "TEXT"),
        ("security_held", "REAL DEFAULT 0"),
    ]

    for col_name, col_type in columns_to_add:
        try:
            cursor.execute(f"ALTER TABLE bookings ADD COLUMN {col_name} {col_type}")
            print(f"Added column: bookings.{col_name}")
        except sqlite3.OperationalError as e:
            if "duplicate column" in str(e).lower():
                print(f"Column bookings.{col_name} already exists")
            else:
                print(f"Error adding {col_name}: {e}")

    conn.commit()
    conn.close()
    print("Migration v3 complete!")

if __name__ == "__main__":
    migrate()
