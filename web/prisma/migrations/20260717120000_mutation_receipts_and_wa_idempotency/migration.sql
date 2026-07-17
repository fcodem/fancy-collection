-- Non-destructive: mutation receipts + WhatsApp job idempotency key.
-- DO NOT apply automatically to production — review and run via prisma migrate deploy.

CREATE TABLE IF NOT EXISTS "mutation_receipts" (
    "id" SERIAL NOT NULL,
    "operation_id" TEXT NOT NULL,
    "operation_type" TEXT NOT NULL,
    "booking_id" INTEGER,
    "actor_user_id" INTEGER,
    "request_hash" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'completed',
    "result_json" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completed_at" TIMESTAMP(3),

    CONSTRAINT "mutation_receipts_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "mutation_receipts_operation_id_key" ON "mutation_receipts"("operation_id");
CREATE INDEX IF NOT EXISTS "mutation_receipts_booking_id_operation_type_idx" ON "mutation_receipts"("booking_id", "operation_type");

ALTER TABLE "whatsapp_jobs" ADD COLUMN IF NOT EXISTS "idempotency_key" TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS "whatsapp_jobs_idempotency_key_key" ON "whatsapp_jobs"("idempotency_key");
