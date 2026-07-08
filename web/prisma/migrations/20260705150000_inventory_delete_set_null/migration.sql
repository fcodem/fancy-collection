-- Allow inventory delete while preserving booking history (dress name stays on booking_items).

ALTER TABLE "booking_items" DROP CONSTRAINT IF EXISTS "booking_items_item_id_fkey";
ALTER TABLE "booking_items" ALTER COLUMN "item_id" DROP NOT NULL;
ALTER TABLE "booking_items"
  ADD CONSTRAINT "booking_items_item_id_fkey"
  FOREIGN KEY ("item_id") REFERENCES "clothing_items"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "bookings" DROP CONSTRAINT IF EXISTS "bookings_item_id_fkey";
ALTER TABLE "bookings"
  ADD CONSTRAINT "bookings_item_id_fkey"
  FOREIGN KEY ("item_id") REFERENCES "clothing_items"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "rental_items" DROP CONSTRAINT IF EXISTS "rental_items_item_id_fkey";
ALTER TABLE "rental_items" ALTER COLUMN "item_id" DROP NOT NULL;
ALTER TABLE "rental_items"
  ADD CONSTRAINT "rental_items_item_id_fkey"
  FOREIGN KEY ("item_id") REFERENCES "clothing_items"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "prospect_lead_items" DROP CONSTRAINT IF EXISTS "prospect_lead_items_item_id_fkey";
ALTER TABLE "prospect_lead_items"
  ADD CONSTRAINT "prospect_lead_items_item_id_fkey"
  FOREIGN KEY ("item_id") REFERENCES "clothing_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "booking_jewellery" DROP CONSTRAINT IF EXISTS "booking_jewellery_item_id_fkey";
ALTER TABLE "booking_jewellery"
  ADD CONSTRAINT "booking_jewellery_item_id_fkey"
  FOREIGN KEY ("item_id") REFERENCES "clothing_items"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "dress_checker_corrections" DROP CONSTRAINT IF EXISTS "dress_checker_corrections_correct_item_id_fkey";
ALTER TABLE "dress_checker_corrections"
  ADD CONSTRAINT "dress_checker_corrections_correct_item_id_fkey"
  FOREIGN KEY ("correct_item_id") REFERENCES "clothing_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "dress_checker_corrections" DROP CONSTRAINT IF EXISTS "dress_checker_corrections_predicted_item_id_fkey";
ALTER TABLE "dress_checker_corrections"
  ADD CONSTRAINT "dress_checker_corrections_predicted_item_id_fkey"
  FOREIGN KEY ("predicted_item_id") REFERENCES "clothing_items"("id") ON DELETE SET NULL ON UPDATE CASCADE;
