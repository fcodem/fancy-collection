-- Non-destructive performance indexes. Review plans before production deploy.
-- Existing indexes on bookings(status, delivery_date) already present in schema.

CREATE INDEX IF NOT EXISTS "booking_items_booking_id_is_delivered_is_returned_is_cancelled_idx"
  ON "booking_items"("booking_id", "is_delivered", "is_returned", "is_cancelled");
