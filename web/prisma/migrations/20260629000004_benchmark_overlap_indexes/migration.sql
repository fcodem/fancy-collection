-- Overlap / availability lookups at scale (15k+ bookings)
CREATE INDEX IF NOT EXISTS idx_booking_items_item_id
  ON booking_items (item_id);

CREATE INDEX IF NOT EXISTS idx_bookings_status_delivery_return
  ON bookings (status, delivery_date, return_date);

-- Booking item join for overlap filters
CREATE INDEX IF NOT EXISTS idx_booking_items_item_id_booking_id
  ON booking_items (item_id, booking_id);
