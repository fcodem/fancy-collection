-- Add Long Har bridal jewellery set part (idempotent)

ALTER TABLE "clothing_items" ADD COLUMN IF NOT EXISTS "has_long_har" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "booking_jewellery" ADD COLUMN IF NOT EXISTS "pick_long_har" BOOLEAN NOT NULL DEFAULT false;
