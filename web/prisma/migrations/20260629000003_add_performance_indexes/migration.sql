-- Booking list sorts and customer+date lookups
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_bookings_created_at
  ON bookings (created_at);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_bookings_customer_name_delivery_date
  ON bookings (customer_name, delivery_date);

-- Booking item dress lookup within a booking
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_booking_items_booking_id_dress_name
  ON booking_items (booking_id, dress_name);
