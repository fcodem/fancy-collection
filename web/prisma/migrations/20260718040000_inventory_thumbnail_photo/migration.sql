-- Additive: list thumbnails (never replace original photo).

ALTER TABLE "clothing_items" ADD COLUMN IF NOT EXISTS "thumbnail_photo" TEXT;
