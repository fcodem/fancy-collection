-- Unique Meta message IDs for inbound webhook idempotency (multiple NULLs allowed).
CREATE UNIQUE INDEX IF NOT EXISTS whatsapp_messages_meta_message_id_key
  ON whatsapp_messages (meta_message_id)
  WHERE meta_message_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS whatsapp_webhook_queue (
  id SERIAL PRIMARY KEY,
  event_type VARCHAR(64) NOT NULL,
  meta_message_id VARCHAR(255),
  payload JSONB NOT NULL,
  status VARCHAR(32) NOT NULL DEFAULT 'pending',
  attempts INT NOT NULL DEFAULT 0,
  scheduled_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  processed_at TIMESTAMPTZ,
  last_error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS whatsapp_webhook_queue_dedup_idx
  ON whatsapp_webhook_queue (event_type, meta_message_id)
  WHERE meta_message_id IS NOT NULL AND status IN ('pending', 'processing');

CREATE INDEX IF NOT EXISTS whatsapp_webhook_queue_status_scheduled_idx
  ON whatsapp_webhook_queue (status, scheduled_at);
