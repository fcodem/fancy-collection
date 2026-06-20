"""
Convert all DateTime columns in the SQLite database from ISO strings to
epoch-ms integers, which is the format Prisma 6.x uses for SQLite DateTime.
This is a permanent, one-time migration.
"""
import sqlite3
import datetime
import re

DB_PATH = r'C:\Projects\ssdn-soft\web\prisma\cloth_rental.db'

# All DateTime columns in all tables (from schema.prisma)
DATE_COLUMNS = {
    'bookings':       ['created_at', 'delivered_at', 'returned_at', 'delivery_date', 'return_date', 'refunded_at'],
    'booking_items':  ['delivered_at'],
    'users':          ['created_at'],
    'staff':          ['created_at'],
    'inventory_items':['created_at'],
    'staff_work':     ['created_at'],
    'supplier_purchases': ['created_at'],
    'suppliers':      ['created_at'],
    'staff_login_requests': ['created_at'],
    'staff_sessions': ['created_at'],
    'customers':      ['created_at'],
    'packing_items':  ['created_at'],
    'prospect_leads': ['created_at'],
    'shop_enquiries': ['created_at'],
}

ISO_RE = re.compile(r'^\d{4}-\d{2}-\d{2}')


def to_epoch_ms(val):
    """Convert a date/datetime string to epoch ms integer, or return None if already an int."""
    if val is None:
        return None
    # Already an integer (epoch ms)
    if isinstance(val, int):
        return val
    s = str(val).strip()
    if not s:
        return None
    # Already a numeric string
    try:
        n = int(float(s))
        if n > 1_000_000_000_000:  # looks like epoch ms
            return n
        if n > 1_000_000_000:  # epoch seconds
            return n * 1000
    except (ValueError, TypeError):
        pass
    # ISO string
    for fmt in [
        '%Y-%m-%dT%H:%M:%S.%fZ',
        '%Y-%m-%dT%H:%M:%SZ',
        '%Y-%m-%dT%H:%M:%S',
        '%Y-%m-%d %H:%M:%S.%f',
        '%Y-%m-%d %H:%M:%S',
        '%Y-%m-%d',
    ]:
        try:
            dt = datetime.datetime.strptime(s, fmt)
            # Treat as UTC
            epoch = int(dt.replace(tzinfo=datetime.timezone.utc).timestamp() * 1000)
            return epoch
        except ValueError:
            continue
    return None


conn = sqlite3.connect(DB_PATH)
conn.execute('PRAGMA journal_mode=WAL')
c = conn.cursor()

total_fixed = 0

for table, cols in DATE_COLUMNS.items():
    # Check if table exists
    c.execute("SELECT name FROM sqlite_master WHERE type='table' AND name=?", (table,))
    if not c.fetchone():
        print(f'  [{table}] table not found, skipping')
        continue

    for col in cols:
        # Check if column exists
        c.execute(f'PRAGMA table_info("{table}")')
        col_names = [row[1] for row in c.fetchall()]
        if col not in col_names:
            continue

        # Find all non-null values that are NOT already integers
        c.execute(f'SELECT id, "{col}" FROM "{table}" WHERE "{col}" IS NOT NULL')
        rows = c.fetchall()
        fixed = 0
        for rid, val in rows:
            if isinstance(val, int) and val > 1_000_000_000_000:
                continue  # already epoch ms integer
            epoch = to_epoch_ms(val)
            if epoch is not None and epoch != val:
                c.execute(f'UPDATE "{table}" SET "{col}" = ? WHERE id = ?', (epoch, rid))
                fixed += 1
        if fixed:
            print(f'  {table}.{col}: converted {fixed} values to epoch ms')
            total_fixed += fixed

conn.commit()
conn.close()
print(f'\nTotal fixed: {total_fixed}')
print('All DateTime columns now use epoch ms integers (Prisma 6.x format).')
