-- Durable WhatsApp broadcast queue (survives serverless after() kills).
ALTER TABLE "whatsapp_broadcasts" ADD COLUMN IF NOT EXISTS "recipients_json" JSONB;
ALTER TABLE "whatsapp_broadcasts" ADD COLUMN IF NOT EXISTS "next_index" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "whatsapp_broadcasts" ADD COLUMN IF NOT EXISTS "language" TEXT NOT NULL DEFAULT 'en';
ALTER TABLE "whatsapp_broadcasts" ADD COLUMN IF NOT EXISTS "send_body_name" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "whatsapp_broadcasts" ADD COLUMN IF NOT EXISTS "header_format" TEXT;

CREATE INDEX IF NOT EXISTS "whatsapp_broadcasts_status_created_at_idx"
  ON "whatsapp_broadcasts" ("status", "created_at");
