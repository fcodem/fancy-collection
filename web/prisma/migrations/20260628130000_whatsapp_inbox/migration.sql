-- WhatsApp inbox + broadcast tables (schema was ahead of migrations)

CREATE TABLE IF NOT EXISTS "whatsapp_conversations" (
    "id" SERIAL NOT NULL,
    "customer_phone" TEXT NOT NULL,
    "customer_name" TEXT NOT NULL,
    "booking_id" INTEGER,
    "is_window_open" BOOLEAN NOT NULL DEFAULT false,
    "window_opened_at" TIMESTAMP(3),
    "last_message_at" TIMESTAMP(3),
    "unread_count" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "whatsapp_conversations_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "whatsapp_conversations_customer_phone_key"
  ON "whatsapp_conversations"("customer_phone");
CREATE INDEX IF NOT EXISTS "whatsapp_conversations_booking_id_idx"
  ON "whatsapp_conversations"("booking_id");
CREATE INDEX IF NOT EXISTS "whatsapp_conversations_last_message_at_idx"
  ON "whatsapp_conversations"("last_message_at");

DO $$ BEGIN
  ALTER TABLE "whatsapp_conversations"
    ADD CONSTRAINT "whatsapp_conversations_booking_id_fkey"
    FOREIGN KEY ("booking_id") REFERENCES "bookings"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

CREATE TABLE IF NOT EXISTS "whatsapp_broadcasts" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "template_name" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "total_count" INTEGER NOT NULL DEFAULT 0,
    "sent_count" INTEGER NOT NULL DEFAULT 0,
    "failed_count" INTEGER NOT NULL DEFAULT 0,
    "created_by" TEXT,
    "completed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "whatsapp_broadcasts_pkey" PRIMARY KEY ("id")
);

-- Extend whatsapp_messages for inbox (table may exist from earlier migration)
ALTER TABLE "whatsapp_messages" ADD COLUMN IF NOT EXISTS "conversation_id" INTEGER;
ALTER TABLE "whatsapp_messages" ADD COLUMN IF NOT EXISTS "direction" TEXT NOT NULL DEFAULT 'outbound';
ALTER TABLE "whatsapp_messages" ADD COLUMN IF NOT EXISTS "is_automated" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "whatsapp_messages" ADD COLUMN IF NOT EXISTS "delivery_status" TEXT;
ALTER TABLE "whatsapp_messages" ADD COLUMN IF NOT EXISTS "delivered_at" TIMESTAMP(3);
ALTER TABLE "whatsapp_messages" ADD COLUMN IF NOT EXISTS "read_at" TIMESTAMP(3);
ALTER TABLE "whatsapp_messages" ADD COLUMN IF NOT EXISTS "received_at" TIMESTAMP(3);

ALTER TABLE "whatsapp_messages" ALTER COLUMN "phone" DROP NOT NULL;

CREATE INDEX IF NOT EXISTS "whatsapp_messages_conversation_id_idx"
  ON "whatsapp_messages"("conversation_id");
CREATE INDEX IF NOT EXISTS "whatsapp_messages_meta_message_id_idx"
  ON "whatsapp_messages"("meta_message_id");

DO $$ BEGIN
  ALTER TABLE "whatsapp_messages"
    ADD CONSTRAINT "whatsapp_messages_conversation_id_fkey"
    FOREIGN KEY ("conversation_id") REFERENCES "whatsapp_conversations"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;
