ALTER TABLE "clothing_items" ADD COLUMN IF NOT EXISTS "original_photo" TEXT;
ALTER TABLE "clothing_items" ADD COLUMN IF NOT EXISTS "transparent_image" TEXT;
ALTER TABLE "clothing_items" ADD COLUMN IF NOT EXISTS "showcase_image" TEXT;
ALTER TABLE "clothing_items" ADD COLUMN IF NOT EXISTS "thumbnail_image" TEXT;
ALTER TABLE "clothing_items" ADD COLUMN IF NOT EXISTS "booking_slip_image" TEXT;
ALTER TABLE "clothing_items" ADD COLUMN IF NOT EXISTS "quotation_image" TEXT;
ALTER TABLE "clothing_items" ADD COLUMN IF NOT EXISTS "whatsapp_image" TEXT;
ALTER TABLE "clothing_items" ADD COLUMN IF NOT EXISTS "catalogue_image" TEXT;
ALTER TABLE "clothing_items" ADD COLUMN IF NOT EXISTS "mobile_image" TEXT;
ALTER TABLE "clothing_items" ADD COLUMN IF NOT EXISTS "studio_processing_status" TEXT DEFAULT 'none';
ALTER TABLE "clothing_items" ADD COLUMN IF NOT EXISTS "studio_processing_version" INTEGER;
ALTER TABLE "clothing_items" ADD COLUMN IF NOT EXISTS "studio_generated_at" TIMESTAMP(3);
ALTER TABLE "clothing_items" ADD COLUMN IF NOT EXISTS "studio_processing_error" TEXT;

CREATE TABLE IF NOT EXISTS "inventory_studio_logs" (
    "id" SERIAL NOT NULL,
    "item_id" INTEGER NOT NULL,
    "event" TEXT NOT NULL,
    "message" TEXT,
    "version" INTEGER,
    "duration_ms" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "inventory_studio_logs_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "inventory_studio_logs_item_id_idx" ON "inventory_studio_logs"("item_id");
CREATE INDEX IF NOT EXISTS "inventory_studio_logs_created_at_idx" ON "inventory_studio_logs"("created_at");
CREATE INDEX IF NOT EXISTS "inventory_studio_logs_event_idx" ON "inventory_studio_logs"("event");

DO $$ BEGIN
  ALTER TABLE "inventory_studio_logs" ADD CONSTRAINT "inventory_studio_logs_item_id_fkey" FOREIGN KEY ("item_id") REFERENCES "clothing_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;
