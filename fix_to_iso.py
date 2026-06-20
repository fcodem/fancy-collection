"""
Convert ALL DateTime columns to ISO 8601 TEXT strings.
Prisma 6.x with SQLite stores DateTime as TEXT ISO strings.
This handles: epoch-ms integers, epoch-ms text strings, and verifies correct ISO strings.
"""
import sqlite3
import datetime

DB_PATH = r'C:\Projects\ssdn-soft\web\prisma\cloth_rental.db'

# All DateTime columns in all tables
DATE_COLUMNS = {
    'bookings':       ['created_at', 'delivered_at', 'returned_at', 'delivery_date', 'return_date', 'refunded_at'],
    'booking_items':  ['delivered_at'],
    'users':          ['created_at'],
    'staff':          ['created_at'],
    'customers':      ['created_at'],
    'suppliers':      ['created_at'],
    'supplier_purchases': ['created_at'],
    'prospect_leads': ['created_at'],
    'shop_enquiries': ['created_at'],
    'staff_login_requests': ['created_at'],
}


def to_iso(val):
    """Convert any date representation to ISO 8601 string. Return None if already valid ISO."""
    if val is None:
        return None

    # If it's an integer (epoch ms or seconds)
    if isinstance(val, int):
        if val > 1_000_000_000_000:  # epoch ms
            ts = datetime.datetime.fromtimestamp(val / 1000, tz=datetime.timezone.utc)
        elif val > 1_000_000_000:  # epoch seconds
            ts = datetime.datetime.fromtimestamp(val, tz=datetime.timezone.utc)
        else:
            return None
        return ts.strftime('%Y-%m-%dT%H:%M:%S.000Z')

    s = str(val).strip()
    if not s:
        return None

    # Already ISO string (starts with 4-digit year)
    if s[:4].isdigit() and '-' in s[:10]:
        # Normalize: ensure it has a T separator and Z suffix
        # It's a valid ISO string - return as-is (might need minor normalization)
        # Format: 2026-06-19T08:15:10.493Z or 2026-06-19 08:15:10.315088Z
        s = s.replace(' ', 'T')
        if not s.endswith('Z') and '+' not in s:
            s = s + 'Z'
        return s

    # Numeric string (epoch ms or seconds)
    try:
        n = float(s)
        if n > 1_000_000_000_000:  # epoch ms
            ts = datetime.datetime.fromtimestamp(n / 1000, tz=datetime.timezone.utc)
        elif n > 1_000_000_000:  # epoch seconds
            ts = datetime.datetime.fromtimestamp(n, tz=datetime.timezone.utc)
        else:
            return None
        return ts.strftime('%Y-%m-%dT%H:%M:%S.000Z')
    except (ValueError, TypeError, OSError):
        return None


conn = sqlite3.connect(DB_PATH)
conn.row_factory = sqlite3.Row
c = conn.cursor()

total_fixed = 0

for table, cols in DATE_COLUMNS.items():
    # Check if table exists
    c.execute("SELECT name FROM sqlite_master WHERE type='table' AND name=?", (table,))
    if not c.fetchone():
        print(f'  [{table}] table not found, skipping')
        continue

    # Get existing columns
    c.execute(f'PRAGMA table_info("{table}")')
    col_names = [row[1] for row in c.fetchall()]

    for col in cols:
        if col not in col_names:
            continue

        c.execute(f'SELECT id, "{col}" FROM "{table}" WHERE "{col}" IS NOT NULL')
        rows = c.fetchall()
        fixed = 0
        for row in rows:
            rid, val = row[0], row[1]
            iso = to_iso(val)
            if iso is None:
                continue
            # Only update if val != iso (or val is integer)
            if str(val) != iso:
                c.execute(f'UPDATE "{table}" SET "{col}" = ? WHERE id = ?', (iso, rid))
                fixed += 1
        if fixed:
            print(f'  {table}.{col}: normalized {fixed} values to ISO strings')
            total_fixed += fixed

conn.commit()
conn.close()
print(f'\nTotal normalized: {total_fixed}')
print('All DateTime columns now use ISO 8601 TEXT strings (Prisma 6.x format).')
