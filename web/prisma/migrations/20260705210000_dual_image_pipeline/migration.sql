ALTER TABLE "clothing_items" ADD COLUMN IF NOT EXISTS "recognition_image" TEXT;
ALTER TABLE "clothing_items" ADD COLUMN IF NOT EXISTS "recognition_fingerprint" JSONB;
