-- Additive: mutation receipt lifecycle fields + blob cleanup + WA claim leases.
-- DO NOT apply automatically to production without review.

ALTER TABLE "mutation_receipts" ADD COLUMN IF NOT EXISTS "error_message" TEXT;
ALTER TABLE "mutation_receipts" ALTER COLUMN "status" SET DEFAULT 'processing';
CREATE INDEX IF NOT EXISTS "mutation_receipts_status_created_at_idx"
  ON "mutation_receipts"("status", "created_at");

CREATE TABLE IF NOT EXISTS "blob_cleanup_jobs" (
    "id" SERIAL NOT NULL,
    "blob_path" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "booking_id" INTEGER,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "max_attempts" INTEGER NOT NULL DEFAULT 5,
    "scheduled_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_error" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completed_at" TIMESTAMP(3),
    CONSTRAINT "blob_cleanup_jobs_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "blob_cleanup_jobs_status_scheduled_at_idx"
  ON "blob_cleanup_jobs"("status", "scheduled_at");
CREATE INDEX IF NOT EXISTS "blob_cleanup_jobs_booking_id_idx"
  ON "blob_cleanup_jobs"("booking_id");

ALTER TABLE "whatsapp_jobs" ADD COLUMN IF NOT EXISTS "claimed_at" TIMESTAMP(3);
ALTER TABLE "whatsapp_jobs" ADD COLUMN IF NOT EXISTS "lease_expires_at" TIMESTAMP(3);
ALTER TABLE "whatsapp_jobs" ADD COLUMN IF NOT EXISTS "claimed_by" TEXT;
CREATE INDEX IF NOT EXISTS "whatsapp_jobs_status_lease_expires_at_idx"
  ON "whatsapp_jobs"("status", "lease_expires_at");
