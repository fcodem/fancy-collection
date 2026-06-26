-- AlterTable
ALTER TABLE "bookings" ADD COLUMN "public_booking_id" TEXT;
ALTER TABLE "bookings" ADD COLUMN "qr_code_url" TEXT;
ALTER TABLE "bookings" ADD COLUMN "whatsapp_sent_at" TIMESTAMP(3);
ALTER TABLE "bookings" ADD COLUMN "whatsapp_status" TEXT;
ALTER TABLE "bookings" ADD COLUMN "whatsapp_error" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "bookings_public_booking_id_key" ON "bookings"("public_booking_id");

-- CreateTable
CREATE TABLE "whatsapp_message_queue" (
    "id" SERIAL NOT NULL,
    "booking_id" INTEGER NOT NULL,
    "step" TEXT NOT NULL,
    "step_index" INTEGER NOT NULL DEFAULT 0,
    "payload" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "max_attempts" INTEGER NOT NULL DEFAULT 5,
    "last_error" TEXT,
    "next_retry_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "whatsapp_message_queue_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "whatsapp_message_queue_status_next_retry_at_idx" ON "whatsapp_message_queue"("status", "next_retry_at");
CREATE INDEX "whatsapp_message_queue_booking_id_idx" ON "whatsapp_message_queue"("booking_id");

-- AddForeignKey
ALTER TABLE "whatsapp_message_queue" ADD CONSTRAINT "whatsapp_message_queue_booking_id_fkey" FOREIGN KEY ("booking_id") REFERENCES "bookings"("id") ON DELETE CASCADE ON UPDATE CASCADE;
