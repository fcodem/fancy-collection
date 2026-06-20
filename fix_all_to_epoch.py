import sqlite3
from datetime import datetime, timezone

conn = sqlite3.connect(r'C:\Projects\ssdn-soft\web\prisma\cloth_rental.db')
c = conn.cursor()

tables_cols = {
    'bookings': ['created_at', 'delivered_at', 'returned_at', 'refunded_at', 'delivery_date', 'return_date'],
    'booking_items': ['delivered_at'],
    'clothing_items': ['created_at', 'updated_at'],
    'customers': ['created_at'],
    'suppliers': ['created_at'],
    'supplier_purchases': ['date'],
    'sessions': ['created_at', 'last_seen', 'ended_at'],
    'users': ['created_at'],
    'staff': ['created_at'],
    'staff_attendance': ['check_in', 'check_out'],
    'shop_enquiries': ['visit_date', 'created_at'],
    'prospect_leads': ['created_at', 'follow_up_date', 'last_reminder_at'],
    'login_requests': ['created_at', 'resolved_at'],
}

total = 0
for table, cols in tables_cols.items():
    try:
        c.execute(f'SELECT COUNT(*) FROM {table}')
    except:
        continue
    for col in cols:
        try:
            c.execute(f'SELECT id, {col}, typeof({col}) FROM {table} WHERE {col} IS NOT NULL')
        except:
            continue
        for row in c.fetchall():
            val = row[1]
            dtype = row[2]
            sval = str(val)
            
            if dtype == 'text':
                if sval.replace('.','').isdigit() and len(sval) >= 10:
                    epoch = int(float(sval))
                    c.execute(f'UPDATE {table} SET {col} = ? WHERE id = ?', (epoch, row[0]))
                    print(f'Text->Int {table}.{col} id={row[0]}: "{sval}" -> {epoch}')
                    total += 1
                elif 'T' in sval:
                    try:
                        dt = datetime.fromisoformat(sval.replace('Z', '+00:00'))
                        epoch = int(dt.timestamp() * 1000)
                        c.execute(f'UPDATE {table} SET {col} = ? WHERE id = ?', (epoch, row[0]))
                        print(f'ISO->Int {table}.{col} id={row[0]}: "{sval}" -> {epoch}')
                        total += 1
                    except:
                        print(f'SKIP {table}.{col} id={row[0]}: "{sval}"')

conn.commit()
print(f'\nTotal fixed: {total}')

c.execute('SELECT id, delivered_at, typeof(delivered_at), delivery_date, typeof(delivery_date) FROM bookings')
print('Bookings:', c.fetchall())
c.execute('SELECT id, delivered_at, typeof(delivered_at) FROM booking_items WHERE delivered_at IS NOT NULL')
print('Booking items with delivered_at:', c.fetchall())
conn.close()
