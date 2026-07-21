-- Persist Meta media id on inbound messages so failed downloads can be retried.
ALTER TABLE whatsapp_messages
  ADD COLUMN IF NOT EXISTS inbound_media_meta_id TEXT;

CREATE INDEX IF NOT EXISTS whatsapp_messages_inbound_media_pending_idx
  ON whatsapp_messages (direction, message_type)
  WHERE media_url IS NULL AND inbound_media_meta_id IS NOT NULL;
