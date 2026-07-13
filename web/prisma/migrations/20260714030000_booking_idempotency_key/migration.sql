-- Additive: client booking request idempotency (safe to apply; no data loss).
CREATE TABLE IF NOT EXISTS "booking_idempotency_keys" (
    "key" VARCHAR(64) NOT NULL,
    "booking_id" INTEGER NOT NULL,
    "user_id" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "booking_idempotency_keys_pkey" PRIMARY KEY ("key")
);

CREATE UNIQUE INDEX IF NOT EXISTS "booking_idempotency_keys_booking_id_key" ON "booking_idempotency_keys"("booking_id");
CREATE INDEX IF NOT EXISTS "booking_idempotency_keys_user_id_created_at_idx" ON "booking_idempotency_keys"("user_id", "created_at");

DO $$ BEGIN
  ALTER TABLE "booking_idempotency_keys"
    ADD CONSTRAINT "booking_idempotency_keys_booking_id_fkey"
    FOREIGN KEY ("booking_id") REFERENCES "bookings"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
