-- Latest-messages-per-conversation lookups for the WhatsApp inbox. Index only.
CREATE INDEX IF NOT EXISTS whatsapp_messages_conversation_id_created_at_idx
  ON whatsapp_messages (conversation_id, created_at DESC, id DESC);
