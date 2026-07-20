-- Booking performance indexes: contact2, delivered/returned timestamps, export keysets, phone search.
CREATE INDEX IF NOT EXISTS "bookings_contact_2_idx" ON "bookings"("contact_2");
CREATE INDEX IF NOT EXISTS "bookings_delivered_at_idx" ON "bookings"("delivered_at");
CREATE INDEX IF NOT EXISTS "bookings_returned_at_idx" ON "bookings"("returned_at");
CREATE INDEX IF NOT EXISTS "bookings_created_at_status_idx" ON "bookings"("created_at", "status");
CREATE INDEX IF NOT EXISTS "bookings_status_delivered_at_idx" ON "bookings"("status", "delivered_at");
CREATE INDEX IF NOT EXISTS "bookings_status_returned_at_idx" ON "bookings"("status", "returned_at");
CREATE INDEX IF NOT EXISTS "bookings_delivery_date_id_desc_idx" ON "bookings"("delivery_date" DESC, "id" DESC);

-- pg_trgm for contact_2 (matches existing contact_1 / whatsapp_no pattern).
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE INDEX IF NOT EXISTS "bookings_contact_2_trgm_idx"
  ON "bookings" USING GIN ("contact_2" gin_trgm_ops);

-- Suffix helpers for last-10 digit phone matching (customer list / dedup).
CREATE INDEX IF NOT EXISTS "bookings_contact_1_suffix_idx"
  ON "bookings" (RIGHT(REGEXP_REPLACE(COALESCE("contact_1", ''), '\D', '', 'g'), 10));
CREATE INDEX IF NOT EXISTS "bookings_whatsapp_no_suffix_idx"
  ON "bookings" (RIGHT(REGEXP_REPLACE(COALESCE("whatsapp_no", ''), '\D', '', 'g'), 10));
CREATE INDEX IF NOT EXISTS "bookings_contact_2_suffix_idx"
  ON "bookings" (RIGHT(REGEXP_REPLACE(COALESCE("contact_2", ''), '\D', '', 'g'), 10));
CREATE INDEX IF NOT EXISTS "customers_phone_suffix_idx"
  ON "customers" (RIGHT(REGEXP_REPLACE(COALESCE("phone", ''), '\D', '', 'g'), 10));
CREATE INDEX IF NOT EXISTS "customers_name_trgm_idx"
  ON "customers" USING GIN ("name" gin_trgm_ops);
