-- Date-check occupancy: filter active booking_items by item before joining bookings.
CREATE INDEX IF NOT EXISTS "booking_items_item_id_is_cancelled_is_returned_booking_id_idx"
  ON "booking_items"("item_id", "is_cancelled", "is_returned", "booking_id");
