-- Bootstrap PostgreSQL schema for Fancy Collection (matches prisma/schema.prisma)
-- Safe to re-run: uses IF NOT EXISTS

CREATE TABLE IF NOT EXISTS staff (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  phone TEXT,
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS users (
  id SERIAL PRIMARY KEY,
  username TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'staff',
  staff_id INTEGER REFERENCES staff(id),
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS customers (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  phone TEXT NOT NULL,
  email TEXT,
  address TEXT,
  id_proof TEXT,
  notes TEXT,
  created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS clothing_items (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  sku TEXT NOT NULL UNIQUE,
  category TEXT NOT NULL,
  size TEXT,
  color TEXT,
  daily_rate DOUBLE PRECISION NOT NULL DEFAULT 0,
  deposit DOUBLE PRECISION NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'available',
  item_type TEXT NOT NULL DEFAULT 'clothing',
  photo TEXT,
  condition_notes TEXT,
  created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  sub_category TEXT
);

CREATE TABLE IF NOT EXISTS custom_categories (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  "group" TEXT NOT NULL DEFAULT 'other',
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS suppliers (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  phone TEXT,
  address TEXT,
  created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS bookings (
  id SERIAL PRIMARY KEY,
  booking_number TEXT NOT NULL UNIQUE,
  monthly_serial INTEGER NOT NULL DEFAULT 0,
  customer_name TEXT NOT NULL,
  customer_address TEXT NOT NULL,
  contact_1 TEXT NOT NULL,
  whatsapp_no TEXT,
  delivery_date DATE NOT NULL,
  delivery_time TEXT NOT NULL,
  return_date DATE NOT NULL,
  return_time TEXT NOT NULL,
  venue TEXT,
  security_deposit DOUBLE PRECISION NOT NULL DEFAULT 0,
  total_price DOUBLE PRECISION NOT NULL DEFAULT 0,
  total_advance DOUBLE PRECISION NOT NULL DEFAULT 0,
  total_remaining DOUBLE PRECISION NOT NULL DEFAULT 0,
  common_notes TEXT,
  staff_names TEXT,
  status TEXT NOT NULL DEFAULT 'booked',
  created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  delivery_notes TEXT,
  remaining_collected DOUBLE PRECISION NOT NULL DEFAULT 0,
  security_collected DOUBLE PRECISION NOT NULL DEFAULT 0,
  delivered_at TIMESTAMP(3),
  returned_at TIMESTAMP(3),
  incomplete_notes TEXT,
  security_held DOUBLE PRECISION NOT NULL DEFAULT 0,
  item_id INTEGER REFERENCES clothing_items(id),
  dress_name TEXT,
  price DOUBLE PRECISION NOT NULL DEFAULT 0,
  advance DOUBLE PRECISION NOT NULL DEFAULT 0,
  remaining DOUBLE PRECISION NOT NULL DEFAULT 0,
  notes TEXT,
  contact_2 TEXT
);

CREATE TABLE IF NOT EXISTS booking_items (
  id SERIAL PRIMARY KEY,
  booking_id INTEGER NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
  item_id INTEGER NOT NULL REFERENCES clothing_items(id),
  dress_name TEXT NOT NULL,
  category TEXT,
  price DOUBLE PRECISION NOT NULL DEFAULT 0,
  advance DOUBLE PRECISION NOT NULL DEFAULT 0,
  remaining DOUBLE PRECISION NOT NULL DEFAULT 0,
  size TEXT,
  notes TEXT,
  prepared_by TEXT,
  checked_by TEXT,
  is_packed_ready BOOLEAN NOT NULL DEFAULT false,
  packing_note TEXT
);

CREATE TABLE IF NOT EXISTS rentals (
  id SERIAL PRIMARY KEY,
  rental_number TEXT NOT NULL UNIQUE,
  customer_id INTEGER NOT NULL REFERENCES customers(id),
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  actual_return_date DATE,
  status TEXT NOT NULL DEFAULT 'active',
  subtotal DOUBLE PRECISION NOT NULL DEFAULT 0,
  deposit_total DOUBLE PRECISION NOT NULL DEFAULT 0,
  late_fee DOUBLE PRECISION NOT NULL DEFAULT 0,
  damage_fee DOUBLE PRECISION NOT NULL DEFAULT 0,
  discount DOUBLE PRECISION NOT NULL DEFAULT 0,
  total_amount DOUBLE PRECISION NOT NULL DEFAULT 0,
  notes TEXT,
  created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS rental_items (
  id SERIAL PRIMARY KEY,
  rental_id INTEGER NOT NULL REFERENCES rentals(id) ON DELETE CASCADE,
  item_id INTEGER NOT NULL REFERENCES clothing_items(id),
  daily_rate DOUBLE PRECISION NOT NULL,
  deposit DOUBLE PRECISION NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS invoices (
  id SERIAL PRIMARY KEY,
  invoice_number TEXT NOT NULL UNIQUE,
  rental_id INTEGER NOT NULL REFERENCES rentals(id),
  issue_date DATE NOT NULL DEFAULT CURRENT_DATE,
  due_date DATE,
  subtotal DOUBLE PRECISION NOT NULL DEFAULT 0,
  tax_rate DOUBLE PRECISION NOT NULL DEFAULT 0,
  tax_amount DOUBLE PRECISION NOT NULL DEFAULT 0,
  total DOUBLE PRECISION NOT NULL DEFAULT 0,
  amount_paid DOUBLE PRECISION NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'unpaid',
  notes TEXT,
  created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS payments (
  id SERIAL PRIMARY KEY,
  invoice_id INTEGER NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
  amount DOUBLE PRECISION NOT NULL,
  method TEXT NOT NULL DEFAULT 'cash',
  reference TEXT,
  notes TEXT,
  paid_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS supplier_purchases (
  id SERIAL PRIMARY KEY,
  supplier_id INTEGER NOT NULL REFERENCES suppliers(id),
  item_description TEXT NOT NULL,
  category TEXT,
  amount DOUBLE PRECISION NOT NULL DEFAULT 0,
  gst_amount DOUBLE PRECISION NOT NULL DEFAULT 0,
  transaction_type TEXT NOT NULL DEFAULT 'purchase',
  date DATE NOT NULL DEFAULT CURRENT_DATE,
  notes TEXT
);

CREATE TABLE IF NOT EXISTS staff_login_requests (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id),
  token TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL DEFAULT 'pending',
  requested_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  resolved_at TIMESTAMP(3),
  resolved_by_id INTEGER REFERENCES users(id)
);

CREATE INDEX IF NOT EXISTS staff_login_requests_token_idx ON staff_login_requests(token);

CREATE TABLE IF NOT EXISTS user_sessions (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id),
  session_id TEXT NOT NULL UNIQUE,
  active BOOLEAN NOT NULL DEFAULT true,
  login_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  last_seen TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  ended_at TIMESTAMP(3),
  ended_by_id INTEGER REFERENCES users(id)
);

CREATE INDEX IF NOT EXISTS user_sessions_session_id_idx ON user_sessions(session_id);

CREATE TABLE IF NOT EXISTS staff_attendance (
  id SERIAL PRIMARY KEY,
  staff_id INTEGER NOT NULL REFERENCES staff(id),
  date DATE NOT NULL,
  status TEXT NOT NULL DEFAULT 'present',
  UNIQUE (staff_id, date)
);
