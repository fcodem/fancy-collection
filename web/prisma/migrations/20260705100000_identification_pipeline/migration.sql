-- Add multi-stage identification index fields
ALTER TABLE "clothing_items" ADD COLUMN IF NOT EXISTS "identification_index" JSONB;
ALTER TABLE "clothing_items" ADD COLUMN IF NOT EXISTS "identification_indexed_at" TIMESTAMP(3);

CREATE TABLE IF NOT EXISTS "clothing_item_reference_photos" (
    "id" SERIAL NOT NULL,
    "item_id" INTEGER NOT NULL,
    "photo" TEXT NOT NULL,
    "label" TEXT,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "content_hash" TEXT,
    "identification_index" JSONB,
    "indexed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "clothing_item_reference_photos_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "clothing_item_reference_photos_item_id_idx" ON "clothing_item_reference_photos"("item_id");

DO $$ BEGIN
  ALTER TABLE "clothing_item_reference_photos" ADD CONSTRAINT "clothing_item_reference_photos_item_id_fkey" FOREIGN KEY ("item_id") REFERENCES "clothing_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;
