-- BookingPrivateMedia: durable tracking for temporary private booking images.
-- DO NOT apply automatically to production without review.

CREATE TABLE IF NOT EXISTS "booking_private_media" (
    "id" SERIAL NOT NULL,
    "booking_id" INTEGER NOT NULL,
    "booking_item_id" INTEGER,
    "booking_order_id" INTEGER,
    "media_type" TEXT NOT NULL,
    "blob_url" TEXT NOT NULL,
    "blob_pathname" TEXT,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "delete_after" TIMESTAMP(3),
    "deleted_at" TIMESTAMP(3),
    "delete_attempts" INTEGER NOT NULL DEFAULT 0,
    "last_error_code" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "booking_private_media_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "booking_private_media_booking_id_status_idx"
  ON "booking_private_media"("booking_id", "status");
CREATE INDEX IF NOT EXISTS "booking_private_media_status_delete_after_idx"
  ON "booking_private_media"("status", "delete_after");
CREATE INDEX IF NOT EXISTS "booking_private_media_booking_id_blob_url_idx"
  ON "booking_private_media"("booking_id", "blob_url");

ALTER TABLE "booking_private_media"
  ADD CONSTRAINT "booking_private_media_booking_id_fkey"
  FOREIGN KEY ("booking_id") REFERENCES "bookings"("id") ON DELETE CASCADE ON UPDATE CASCADE;
