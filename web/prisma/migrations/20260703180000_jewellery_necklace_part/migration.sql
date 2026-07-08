-- Add Necklace as a bookable jewellery set part

ALTER TABLE "clothing_items" ADD COLUMN IF NOT EXISTS "has_necklace" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "booking_jewellery" ADD COLUMN IF NOT EXISTS "pick_necklace" BOOLEAN NOT NULL DEFAULT false;
