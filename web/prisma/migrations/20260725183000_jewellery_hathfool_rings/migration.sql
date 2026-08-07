-- Rename Nathfool → Hathfool; add Rings and Long Har bridal jewellery set parts

ALTER TABLE "clothing_items" ADD COLUMN IF NOT EXISTS "has_hathfool" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "clothing_items" ADD COLUMN IF NOT EXISTS "has_rings" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "clothing_items" ADD COLUMN IF NOT EXISTS "has_long_har" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "booking_jewellery" ADD COLUMN IF NOT EXISTS "pick_hathfool" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "booking_jewellery" ADD COLUMN IF NOT EXISTS "pick_rings" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "booking_jewellery" ADD COLUMN IF NOT EXISTS "pick_long_har" BOOLEAN NOT NULL DEFAULT false;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'clothing_items' AND column_name = 'has_nathfool'
  ) THEN
    EXECUTE 'UPDATE "clothing_items" SET "has_hathfool" = "has_nathfool" WHERE "has_nathfool" = true';
    EXECUTE 'ALTER TABLE "clothing_items" DROP COLUMN "has_nathfool"';
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'booking_jewellery' AND column_name = 'pick_nathfool'
  ) THEN
    EXECUTE 'UPDATE "booking_jewellery" SET "pick_hathfool" = "pick_nathfool" WHERE "pick_nathfool" = true';
    EXECUTE 'ALTER TABLE "booking_jewellery" DROP COLUMN "pick_nathfool"';
  END IF;
END $$;
