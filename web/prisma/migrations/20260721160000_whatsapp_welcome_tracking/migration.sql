-- Track when the professional auto-welcome was last sent
ALTER TABLE "whatsapp_conversations" ADD COLUMN IF NOT EXISTS "last_welcome_sent_at" TIMESTAMP(3);
