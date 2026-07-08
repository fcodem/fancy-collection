-- Jewellery set parts on inventory + per-booking part picks

ALTER TABLE "clothing_items" ADD COLUMN IF NOT EXISTS "has_earrings" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "clothing_items" ADD COLUMN IF NOT EXISTS "has_teeka" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "clothing_items" ADD COLUMN IF NOT EXISTS "has_pasa" BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE "booking_jewellery" ADD COLUMN IF NOT EXISTS "pick_earrings" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "booking_jewellery" ADD COLUMN IF NOT EXISTS "pick_teeka" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "booking_jewellery" ADD COLUMN IF NOT EXISTS "pick_pasa" BOOLEAN NOT NULL DEFAULT false;
