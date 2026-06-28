-- Enable pg_trgm extension for fast ILIKE/contains searches
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- Booking table: the three most-searched text columns
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_bookings_customer_name_trgm
  ON bookings USING GIN (customer_name gin_trgm_ops);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_bookings_dress_name_trgm
  ON bookings USING GIN (dress_name gin_trgm_ops);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_bookings_contact1_trgm
  ON bookings USING GIN (contact1 gin_trgm_ops);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_bookings_whatsapp_no_trgm
  ON bookings USING GIN (whatsapp_no gin_trgm_ops);

-- BookingItems table: dress name search joins through here
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_booking_items_dress_name_trgm
  ON booking_items USING GIN (dress_name gin_trgm_ops);
