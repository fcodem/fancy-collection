-- WhatsApp guided booking enquiry flow bot state
ALTER TABLE "whatsapp_conversations" ADD COLUMN IF NOT EXISTS "bot_mode" TEXT NOT NULL DEFAULT 'ACTIVE';
ALTER TABLE "whatsapp_conversations" ADD COLUMN IF NOT EXISTS "bot_step" TEXT NOT NULL DEFAULT 'IDLE';
ALTER TABLE "whatsapp_conversations" ADD COLUMN IF NOT EXISTS "bot_category" TEXT;
ALTER TABLE "whatsapp_conversations" ADD COLUMN IF NOT EXISTS "bot_delivery_date" TEXT;
ALTER TABLE "whatsapp_conversations" ADD COLUMN IF NOT EXISTS "bot_return_date" TEXT;
ALTER TABLE "whatsapp_conversations" ADD COLUMN IF NOT EXISTS "bot_size" TEXT;
ALTER TABLE "whatsapp_conversations" ADD COLUMN IF NOT EXISTS "bot_colour" TEXT;
ALTER TABLE "whatsapp_conversations" ADD COLUMN IF NOT EXISTS "bot_notes" TEXT;
ALTER TABLE "whatsapp_conversations" ADD COLUMN IF NOT EXISTS "bot_invalid_attempts" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "whatsapp_conversations" ADD COLUMN IF NOT EXISTS "last_automated_inbound_meta_message_id" TEXT;
ALTER TABLE "whatsapp_conversations" ADD COLUMN IF NOT EXISTS "handover_message_sent_at" TIMESTAMP(3);
ALTER TABLE "whatsapp_conversations" ADD COLUMN IF NOT EXISTS "bot_resumed_at" TIMESTAMP(3);
ALTER TABLE "whatsapp_conversations" ADD COLUMN IF NOT EXISTS "bot_updated_at" TIMESTAMP(3);

CREATE INDEX IF NOT EXISTS "whatsapp_conversations_bot_mode_idx" ON "whatsapp_conversations"("bot_mode");
CREATE INDEX IF NOT EXISTS "whatsapp_conversations_bot_step_idx" ON "whatsapp_conversations"("bot_step");

CREATE TABLE IF NOT EXISTS "whatsapp_bot_config" (
    "id" INTEGER NOT NULL DEFAULT 1,
    "shop_name" TEXT,
    "address" TEXT,
    "hours" TEXT,
    "phone" TEXT,
    "greeting_reply" TEXT,
    "price_reply" TEXT,
    "rental_process_reply" TEXT,
    "security_advance_reply" TEXT,
    "handover_reply" TEXT,
    "booking_complete_reply" TEXT,
    "bot_enabled" BOOLEAN NOT NULL DEFAULT true,
    "flow_enabled" BOOLEAN NOT NULL DEFAULT true,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "whatsapp_bot_config_pkey" PRIMARY KEY ("id")
);

-- Conversations with manual staff replies should start in TEAM_HANDLING
UPDATE "whatsapp_conversations" AS c
SET "bot_mode" = 'TEAM_HANDLING'
WHERE EXISTS (
  SELECT 1 FROM "whatsapp_messages" AS m
  WHERE m."conversation_id" = c."id"
    AND m."direction" = 'outbound'
    AND m."is_automated" = false
);
