"""Migration: Add venue column to bookings, create booking_items table."""
import sqlite3
import os

DB_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), "cloth_rental.db")

conn = sqlite3.connect(DB_PATH)
cursor = conn.cursor()

# Add venue column to bookings
try:
    cursor.execute("ALTER TABLE bookings ADD COLUMN venue VARCHAR(250)")
    print("Added 'venue' column to bookings table.")
except sqlite3.OperationalError as e:
    if "duplicate column" in str(e).lower():
        print("'venue' column already exists.")
    else:
        raise

# Add whatsapp_no column if not exists
try:
    cursor.execute("ALTER TABLE bookings ADD COLUMN whatsapp_no VARCHAR(20)")
    print("Added 'whatsapp_no' column to bookings table.")
except sqlite3.OperationalError as e:
    if "duplicate column" in str(e).lower():
        print("'whatsapp_no' column already exists.")
    else:
        raise

# Add security_deposit column if not exists
try:
    cursor.execute("ALTER TABLE bookings ADD COLUMN security_deposit FLOAT DEFAULT 0")
    print("Added 'security_deposit' column to bookings table.")
except sqlite3.OperationalError as e:
    if "duplicate column" in str(e).lower():
        print("'security_deposit' column already exists.")
    else:
        raise

# Add total_price, total_advance, total_remaining columns
for col in ['total_price', 'total_advance', 'total_remaining']:
    try:
        cursor.execute(f"ALTER TABLE bookings ADD COLUMN {col} FLOAT DEFAULT 0")
        print(f"Added '{col}' column to bookings table.")
    except sqlite3.OperationalError as e:
        if "duplicate column" in str(e).lower():
            print(f"'{col}' column already exists.")
        else:
            raise

# Add common_notes column
try:
    cursor.execute("ALTER TABLE bookings ADD COLUMN common_notes TEXT")
    print("Added 'common_notes' column to bookings table.")
except sqlite3.OperationalError as e:
    if "duplicate column" in str(e).lower():
        print("'common_notes' column already exists.")
    else:
        raise

# Create booking_items table
try:
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
    print("Created 'booking_items' table.")
except sqlite3.OperationalError as e:
    print(f"booking_items table: {e}")

conn.commit()
conn.close()
print("\nMigration complete!")
