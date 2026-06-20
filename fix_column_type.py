import sqlite3

conn = sqlite3.connect(r'C:\Projects\ssdn-soft\web\prisma\cloth_rental.db')
c = conn.cursor()

# Check current schema
c.execute("SELECT sql FROM sqlite_master WHERE name='booking_items'")
schema = c.fetchone()[0]
print('Current schema:')
print(schema)

# The delivered_at column has TEXT type. We need DATETIME for Prisma.
# SQLite approach: rename old, create new with correct type, copy, drop old

# Step 1: Add new column with correct type
try:
    c.execute("ALTER TABLE booking_items ADD COLUMN delivered_at_new DATETIME DEFAULT NULL")
    print("Added new column")
except:
    print("Column already exists, proceeding")

# Step 2: Copy data
c.execute("UPDATE booking_items SET delivered_at_new = CAST(delivered_at AS INTEGER) WHERE delivered_at IS NOT NULL")
print("Copied data")

# Verify
c.execute("SELECT id, delivered_at, typeof(delivered_at), delivered_at_new, typeof(delivered_at_new) FROM booking_items WHERE delivered_at IS NOT NULL")
for row in c.fetchall():
    print(f"  id={row[0]}: old={row[1]} ({row[2]}), new={row[3]} ({row[4]})")

conn.commit()
conn.close()
print("Done")
