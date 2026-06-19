"""One-time migration: add item_type column to clothing_items table."""
import sqlite3
import os

db_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), "cloth_rental.db")
conn = sqlite3.connect(db_path)
cur = conn.cursor()

try:
    cur.execute("ALTER TABLE clothing_items ADD COLUMN item_type VARCHAR(20) DEFAULT 'clothing'")
    conn.commit()
    print("SUCCESS: item_type column added.")
except Exception as e:
    if "duplicate column" in str(e).lower():
        print("Column already exists – no changes needed.")
    else:
        print("Error:", e)

# Update existing jewellery-like categories
cur.execute("""
    UPDATE clothing_items
    SET item_type = 'jewellery'
    WHERE category IN ('Jewellery','Necklace','Bangles','Earrings','Maang Tikka',
                       'Haath Phool','Anklet','Nose Ring','Matha Patti')
""")
cur.execute("""
    UPDATE clothing_items
    SET item_type = 'accessory'
    WHERE category IN ('Accessory','Dupatta','Belt','Clutch','Crown/Tiara')
""")
conn.commit()
print("Updated item_type for jewellery and accessory categories.")

conn.close()
print("Migration complete.")
