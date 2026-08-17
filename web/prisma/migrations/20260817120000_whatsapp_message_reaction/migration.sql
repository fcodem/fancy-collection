ALTER TABLE "whatsapp_messages" ADD COLUMN IF NOT EXISTS "reaction_emoji" TEXT;
ALTER TABLE "whatsapp_messages" ADD COLUMN IF NOT EXISTS "reacted_at" TIMESTAMP(3);
