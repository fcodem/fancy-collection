-- AlterTable (booking WhatsApp fields — may already exist from prior migration)
ALTER TABLE "bookings" ADD COLUMN IF NOT EXISTS "public_booking_id" TEXT;
ALTER TABLE "bookings" ADD COLUMN IF NOT EXISTS "qr_code_url" TEXT;
ALTER TABLE "bookings" ADD COLUMN IF NOT EXISTS "whatsapp_sent_at" TIMESTAMP(3);
ALTER TABLE "bookings" ADD COLUMN IF NOT EXISTS "whatsapp_status" TEXT;
ALTER TABLE "bookings" ADD COLUMN IF NOT EXISTS "whatsapp_error" TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS "bookings_public_booking_id_key" ON "bookings"("public_booking_id");

-- CreateTable
CREATE TABLE IF NOT EXISTS "whatsapp_jobs" (
    "id" SERIAL NOT NULL,
    "job_type" TEXT NOT NULL,
    "booking_id" INTEGER,
    "payload" JSONB,
    "scheduled_at" TIMESTAMP(3) NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "max_attempts" INTEGER NOT NULL DEFAULT 3,
    "last_attempt_at" TIMESTAMP(3),
    "completed_at" TIMESTAMP(3),
    "failed_reason" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" TEXT,

    CONSTRAINT "whatsapp_jobs_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "whatsapp_messages" (
    "id" SERIAL NOT NULL,
    "booking_id" INTEGER,
    "phone" TEXT NOT NULL,
    "message_type" TEXT NOT NULL,
    "body" TEXT,
    "media_url" TEXT,
    "filename" TEXT,
    "meta_message_id" TEXT,
    "status" TEXT NOT NULL DEFAULT 'sent',
    "error" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "whatsapp_messages_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "whatsapp_jobs_status_scheduled_at_idx" ON "whatsapp_jobs"("status", "scheduled_at");
CREATE INDEX IF NOT EXISTS "whatsapp_jobs_booking_id_idx" ON "whatsapp_jobs"("booking_id");
CREATE INDEX IF NOT EXISTS "whatsapp_messages_booking_id_idx" ON "whatsapp_messages"("booking_id");
CREATE INDEX IF NOT EXISTS "whatsapp_messages_created_at_idx" ON "whatsapp_messages"("created_at");

DO $$ BEGIN
  ALTER TABLE "whatsapp_jobs" ADD CONSTRAINT "whatsapp_jobs_booking_id_fkey" FOREIGN KEY ("booking_id") REFERENCES "bookings"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  ALTER TABLE "whatsapp_messages" ADD CONSTRAINT "whatsapp_messages_booking_id_fkey" FOREIGN KEY ("booking_id") REFERENCES "bookings"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;
