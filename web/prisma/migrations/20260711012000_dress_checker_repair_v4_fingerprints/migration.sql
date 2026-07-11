-- Dress Checker repair: fingerprint cache keys, richer audits, admin feedback.
-- Idempotent because this project is frequently repaired on live dev databases.

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'inventory_ai_fingerprints'
  ) THEN
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'inventory_ai_fingerprints' AND column_name = 'id'
    ) THEN
      ALTER TABLE inventory_ai_fingerprints ADD COLUMN id SERIAL;
    END IF;

    IF EXISTS (
      SELECT 1 FROM pg_constraint
      WHERE conname = 'inventory_ai_fingerprints_pkey'
    ) THEN
      ALTER TABLE inventory_ai_fingerprints DROP CONSTRAINT inventory_ai_fingerprints_pkey;
    END IF;

    IF NOT EXISTS (
      SELECT 1 FROM pg_constraint
      WHERE conname = 'inventory_ai_fingerprints_pkey'
    ) THEN
      ALTER TABLE inventory_ai_fingerprints ADD CONSTRAINT inventory_ai_fingerprints_pkey PRIMARY KEY (id);
    END IF;
  END IF;
END $$;

ALTER TABLE inventory_ai_fingerprints
  ADD COLUMN IF NOT EXISTS input_image_hash TEXT,
  ADD COLUMN IF NOT EXISTS source_image TEXT,
  ADD COLUMN IF NOT EXISTS fingerprint_version INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS raw_structured_json JSONB,
  ADD COLUMN IF NOT EXISTS deterministic_json JSONB,
  ADD COLUMN IF NOT EXISTS validation_status TEXT NOT NULL DEFAULT 'VALID',
  ADD COLUMN IF NOT EXISTS validation_errors JSONB;

CREATE UNIQUE INDEX IF NOT EXISTS inventory_ai_fingerprints_item_hash_version_key
  ON inventory_ai_fingerprints(item_id, input_image_hash, fingerprint_version);
CREATE INDEX IF NOT EXISTS inventory_ai_fingerprints_item_id_idx
  ON inventory_ai_fingerprints(item_id);
CREATE INDEX IF NOT EXISTS inventory_ai_fingerprints_version_idx
  ON inventory_ai_fingerprints(fingerprint_version);
CREATE INDEX IF NOT EXISTS inventory_ai_fingerprints_validation_idx
  ON inventory_ai_fingerprints(validation_status);

ALTER TABLE dress_search_audits
  ADD COLUMN IF NOT EXISTS query_hash TEXT,
  ADD COLUMN IF NOT EXISTS query_fingerprint JSONB,
  ADD COLUMN IF NOT EXISTS region_ranking JSONB,
  ADD COLUMN IF NOT EXISTS gpt_input_candidates JSONB,
  ADD COLUMN IF NOT EXISTS fusion_meta JSONB,
  ADD COLUMN IF NOT EXISTS rejection_reasons JSONB,
  ADD COLUMN IF NOT EXISTS drop_stages JSONB,
  ADD COLUMN IF NOT EXISTS cache_meta JSONB,
  ADD COLUMN IF NOT EXISTS model_versions JSONB,
  ADD COLUMN IF NOT EXISTS degraded_mode_reason TEXT;

CREATE INDEX IF NOT EXISTS dress_search_audits_query_hash_idx
  ON dress_search_audits(query_hash);

CREATE TABLE IF NOT EXISTS dress_search_feedback (
  id SERIAL PRIMARY KEY,
  search_id TEXT,
  query_hash TEXT,
  correct_item_id INTEGER REFERENCES clothing_items(id) ON DELETE SET NULL,
  predicted_item_id INTEGER,
  feedback TEXT NOT NULL,
  visible_query_regions JSONB,
  candidate_scores JSONB,
  model_versions JSONB,
  index_versions JSONB,
  notes TEXT,
  created_by TEXT,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS dress_search_feedback_query_hash_idx
  ON dress_search_feedback(query_hash);
CREATE INDEX IF NOT EXISTS dress_search_feedback_correct_item_id_idx
  ON dress_search_feedback(correct_item_id);
CREATE INDEX IF NOT EXISTS dress_search_feedback_predicted_item_id_idx
  ON dress_search_feedback(predicted_item_id);
CREATE INDEX IF NOT EXISTS dress_search_feedback_created_at_idx
  ON dress_search_feedback(created_at);
