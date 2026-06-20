import sqlite3, datetime
conn = sqlite3.connect(r'C:\Projects\ssdn-soft\web\prisma\cloth_rental.db')
c = conn.cursor()

def fix_all_dates_in_table(table, date_cols):
    for col in date_cols:
        try:
            c.execute(f'SELECT id, "{col}" FROM "{table}" WHERE "{col}" IS NOT NULL')
            rows = c.fetchall()
            fixed = 0
            for rid, val in rows:
                if val is None: continue
                s = str(val).strip()
                if not s: continue
                try:
                    f = float(s)
                    if f > 1e10:  # epoch ms
                        ts = datetime.datetime.fromtimestamp(f/1000, tz=datetime.timezone.utc)
                    else:  # epoch seconds
                        ts = datetime.datetime.fromtimestamp(f, tz=datetime.timezone.utc)
                    iso = ts.strftime('%Y-%m-%dT%H:%M:%S.000Z')
                    c.execute(f'UPDATE "{table}" SET "{col}" = ? WHERE id = ?', (iso, rid))
                    fixed += 1
                    print(f'  Fixed {table}.{col} id={rid}: {val} -> {iso}')
                except (ValueError, TypeError):
                    pass
            if fixed:
                print(f'  Total {table}.{col}: fixed {fixed}')
        except Exception as e:
            print(f'  {table}.{col}: {e}')

fix_all_dates_in_table('bookings', ['delivered_at', 'returned_at', 'created_at'])
fix_all_dates_in_table('booking_items', ['delivered_at'])

conn.commit()
conn.close()
print('Done')
