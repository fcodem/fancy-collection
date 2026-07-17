-- Additive: crash-safe mutation leases, blob cleanup claim fields, send ledger.
-- Partial unique index prevents duplicate pending cleanups for the same path.
-- DO NOT apply automatically to production without review.

ALTER TABLE "mutation_receipts" ADD COLUMN IF NOT EXISTS "error_code" TEXT;
ALTER TABLE "mutation_receipts" ADD COLUMN IF NOT EXISTS "claimed_at" TIMESTAMP(3);
ALTER TABLE "mutation_receipts" ADD COLUMN IF NOT EXISTS "lease_expires_at" TIMESTAMP(3);
CREATE INDEX IF NOT EXISTS "mutation_receipts_status_lease_expires_at_idx"
  ON "mutation_receipts"("status", "lease_expires_at");

ALTER TABLE "blob_cleanup_jobs" ADD COLUMN IF NOT EXISTS "claimed_at" TIMESTAMP(3);
ALTER TABLE "blob_cleanup_jobs" ADD COLUMN IF NOT EXISTS "lease_expires_at" TIMESTAMP(3);
ALTER TABLE "blob_cleanup_jobs" ADD COLUMN IF NOT EXISTS "claimed_by" TEXT;
CREATE INDEX IF NOT EXISTS "blob_cleanup_jobs_status_lease_expires_at_idx"
  ON "blob_cleanup_jobs"("status", "lease_expires_at");
CREATE INDEX IF NOT EXISTS "blob_cleanup_jobs_blob_path_idx"
  ON "blob_cleanup_jobs"("blob_path");

-- Only one active (pending/processing) cleanup row per path
CREATE UNIQUE INDEX IF NOT EXISTS "blob_cleanup_jobs_active_path_uidx"
  ON "blob_cleanup_jobs"("blob_path")
  WHERE "status" IN ('pending', 'processing');

CREATE TABLE IF NOT EXISTS "whatsapp_send_ledger" (
    "id" SERIAL NOT NULL,
    "idempotency_key" TEXT NOT NULL,
    "job_id" INTEGER,
    "booking_id" INTEGER,
    "document_hash" TEXT,
    "recipient_hash" TEXT,
    "provider_message_id" TEXT,
    "send_started_at" TIMESTAMP(3),
    "send_confirmed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "whatsapp_send_ledger_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "whatsapp_send_ledger_idempotency_key_key"
  ON "whatsapp_send_ledger"("idempotency_key");
CREATE INDEX IF NOT EXISTS "whatsapp_send_ledger_booking_id_idx"
  ON "whatsapp_send_ledger"("booking_id");
