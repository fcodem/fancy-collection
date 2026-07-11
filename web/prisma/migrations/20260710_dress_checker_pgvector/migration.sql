-- Dress Checker Infrastructure v1
-- Adds perceptual hash columns, JSONB embedding fallback, and (conditional)
-- SigLIP image vector column to inventory_ai_profiles.
-- All additions are safe with IF NOT EXISTS / DO blocks.

-- Non-vector columns: always added regardless of pgvector availability
ALTER TABLE inventory_ai_profiles
  ADD COLUMN IF NOT EXISTS photo_hash            TEXT,
  ADD COLUMN IF NOT EXISTS difference_hash       TEXT,
  ADD COLUMN IF NOT EXISTS color_histogram       JSONB,
  ADD COLUMN IF NOT EXISTS verification_metadata JSONB,
  ADD COLUMN IF NOT EXISTS processing_error      TEXT,
  ADD COLUMN IF NOT EXISTS reindexed_at          TIMESTAMP,
  ADD COLUMN IF NOT EXISTS image_embedding_json  JSONB;

-- Index for quick hash lookups
CREATE INDEX IF NOT EXISTS inventory_ai_profiles_photo_hash_idx
  ON inventory_ai_profiles (photo_hash)
  WHERE photo_hash IS NOT NULL;

CREATE INDEX IF NOT EXISTS inventory_ai_profiles_reindexed_at_idx
  ON inventory_ai_profiles (reindexed_at DESC)
  WHERE reindexed_at IS NOT NULL;

-- Attempt pgvector extension (no-op if already installed; warning if missing)
DO $$
BEGIN
  CREATE EXTENSION IF NOT EXISTS vector;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'pgvector not available. Native vector column will be skipped. Error: %', SQLERRM;
END $$;

-- Conditionally add 768-d SigLIP image embedding vector column
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'vector') THEN
    ALTER TABLE inventory_ai_profiles
      ADD COLUMN IF NOT EXISTS image_embedding_vector vector(768);
    CREATE INDEX IF NOT EXISTS inventory_ai_profiles_image_embedding_idx
      ON inventory_ai_profiles
      USING ivfflat (image_embedding_vector vector_cosine_ops)
      WITH (lists = 50);
  ELSE
    RAISE WARNING 'pgvector not installed. image_embedding_vector column skipped. System will use JSONB cosine search instead.';
  END IF;
END $$;
