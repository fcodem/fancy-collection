-- Additive: unique client request id on bookings for atomic create-once semantics.
-- Replaces the unused booking_idempotency_keys approach (never dropped below if present).

ALTER TABLE "bookings"
ADD COLUMN IF NOT EXISTS "client_request_id" VARCHAR(64);

CREATE UNIQUE INDEX IF NOT EXISTS "bookings_client_request_id_key"
ON "bookings"("client_request_id");

-- Clean up prior unmerged design if it was applied locally.
DROP TABLE IF EXISTS "booking_idempotency_keys";
