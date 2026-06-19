"""Migration: create bookings table."""
import sqlite3
import os

db_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), "cloth_rental.db")
conn = sqlite3.connect(db_path)
cur = conn.cursor()

cur.execute("""
CREATE TABLE IF NOT EXISTS bookings (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    booking_number VARCHAR(30) UNIQUE NOT NULL,
    customer_name VARCHAR(150) NOT NULL,
    customer_address TEXT NOT NULL,
    contact_1 VARCHAR(20) NOT NULL,
    contact_2 VARCHAR(20),
    delivery_date DATE NOT NULL,
    delivery_time VARCHAR(10) NOT NULL,
    return_date DATE NOT NULL,
    return_time VARCHAR(10) NOT NULL,
    item_id INTEGER NOT NULL REFERENCES clothing_items(id),
    dress_name VARCHAR(150) NOT NULL,
    price FLOAT NOT NULL DEFAULT 0,
    advance FLOAT NOT NULL DEFAULT 0,
    remaining FLOAT NOT NULL DEFAULT 0,
    status VARCHAR(20) DEFAULT 'booked',
    notes TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
)
""")

conn.commit()
print("SUCCESS: bookings table created.")
conn.close()
