#!/usr/bin/env python3
"""Print SQLite table row counts and columns."""
import sqlite3
from pathlib import Path

DB = Path(__file__).resolve().parent.parent.parent / "fancynew" / "cloth_rental.db"
conn = sqlite3.connect(DB)
tables = conn.execute("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name").fetchall()
total = 0
for (t,) in tables:
    if t.startswith("sqlite_"):
        continue
    n = conn.execute(f'SELECT COUNT(*) FROM "{t}"').fetchone()[0]
    cols = [r[1] for r in conn.execute(f'PRAGMA table_info("{t}")')]
    print(f"{t}: {n} rows ({len(cols)} columns)")
    total += n
print(f"\nTotal rows: {total}")
conn.close()
