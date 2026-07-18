-- Keyset order and exact serial paths for Delivery / Return / Jewellery lists.
-- Existing shorter indexes remain useful for other query shapes; these include
-- the complete ORDER BY tuple so PostgreSQL can stop after LIMIT.
CREATE INDEX IF NOT EXISTS "bookings_status_delivery_date_time_id_idx"
  ON "bookings"("status", "delivery_date", "delivery_time", "id");

CREATE INDEX IF NOT EXISTS "bookings_status_return_date_time_id_idx"
  ON "bookings"("status", "return_date", "return_time", "id");

CREATE INDEX IF NOT EXISTS "bookings_monthly_serial_delivery_date_id_idx"
  ON "bookings"("monthly_serial", "delivery_date", "id");
