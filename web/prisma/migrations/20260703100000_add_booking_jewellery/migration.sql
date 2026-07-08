-- Jewellery Selection: jewellery chosen by the customer for a booking
-- (either a manual entry with a photo + name, or picked from clothing_items inventory)

CREATE TABLE IF NOT EXISTS "booking_jewellery" (
    "id" SERIAL NOT NULL,
    "booking_id" INTEGER NOT NULL,
    "item_id" INTEGER,
    "name" TEXT NOT NULL,
    "category" TEXT,
    "photo" TEXT,
    "source" TEXT NOT NULL DEFAULT 'manual',
    "note" TEXT,
    "status" TEXT NOT NULL DEFAULT 'active',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "booking_jewellery_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "booking_jewellery_booking_id_idx"
  ON "booking_jewellery"("booking_id");
CREATE INDEX IF NOT EXISTS "booking_jewellery_item_id_idx"
  ON "booking_jewellery"("item_id");

DO $$ BEGIN
  ALTER TABLE "booking_jewellery"
    ADD CONSTRAINT "booking_jewellery_booking_id_fkey"
    FOREIGN KEY ("booking_id") REFERENCES "bookings"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  ALTER TABLE "booking_jewellery"
    ADD CONSTRAINT "booking_jewellery_item_id_fkey"
    FOREIGN KEY ("item_id") REFERENCES "clothing_items"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;
