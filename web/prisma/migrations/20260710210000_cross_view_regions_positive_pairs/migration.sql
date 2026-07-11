-- Multi-region reference storage + admin same-dress positive pairs

ALTER TABLE "clothing_item_reference_photos"
  ADD COLUMN IF NOT EXISTS "region_embeddings" JSONB,
  ADD COLUMN IF NOT EXISTS "region_signatures" JSONB;

CREATE TABLE IF NOT EXISTS "dress_checker_positive_pairs" (
  "id" SERIAL PRIMARY KEY,
  "item_id" INTEGER NOT NULL REFERENCES "clothing_items"("id") ON DELETE CASCADE,
  "query_photo" TEXT NOT NULL,
  "catalog_photo" TEXT,
  "query_type" TEXT,
  "confidence" DOUBLE PRECISION,
  "matched_identifiers" JSONB,
  "source" TEXT NOT NULL DEFAULT 'admin_confirm',
  "confirmed_by" TEXT,
  "search_id" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS "dress_checker_positive_pairs_item_id_idx"
  ON "dress_checker_positive_pairs"("item_id");
CREATE INDEX IF NOT EXISTS "dress_checker_positive_pairs_created_at_idx"
  ON "dress_checker_positive_pairs"("created_at");
