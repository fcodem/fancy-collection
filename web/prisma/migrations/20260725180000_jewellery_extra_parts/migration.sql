-- Extra bridal jewellery set parts: Sheeshpatti, Nath, Nathfool, Kamarband

ALTER TABLE "clothing_items" ADD COLUMN IF NOT EXISTS "has_sheeshpatti" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "clothing_items" ADD COLUMN IF NOT EXISTS "has_nath" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "clothing_items" ADD COLUMN IF NOT EXISTS "has_nathfool" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "clothing_items" ADD COLUMN IF NOT EXISTS "has_kamarband" BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE "booking_jewellery" ADD COLUMN IF NOT EXISTS "pick_sheeshpatti" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "booking_jewellery" ADD COLUMN IF NOT EXISTS "pick_nath" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "booking_jewellery" ADD COLUMN IF NOT EXISTS "pick_nathfool" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "booking_jewellery" ADD COLUMN IF NOT EXISTS "pick_kamarband" BOOLEAN NOT NULL DEFAULT false;
