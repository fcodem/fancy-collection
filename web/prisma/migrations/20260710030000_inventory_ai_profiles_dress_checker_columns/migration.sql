-- Dress Checker index columns on inventory_ai_profiles (idempotent, backward-compatible).
-- Safe to re-run: uses IF NOT EXISTS; never drops existing profile data.

ALTER TABLE inventory_ai_profiles
  ADD COLUMN IF NOT EXISTS photo_hash TEXT,
  ADD COLUMN IF NOT EXISTS difference_hash TEXT,
  ADD COLUMN IF NOT EXISTS color_histogram JSONB,
  ADD COLUMN IF NOT EXISTS verification_metadata JSONB,
  ADD COLUMN IF NOT EXISTS processing_error TEXT,
  ADD COLUMN IF NOT EXISTS reindexed_at TIMESTAMP,
  ADD COLUMN IF NOT EXISTS image_embedding_json JSONB;

DO $$
BEGIN
  CREATE EXTENSION IF NOT EXISTS vector;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'pgvector extension not available: %', SQLERRM;
END $$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'vector')
     AND NOT EXISTS (
       SELECT 1 FROM information_schema.columns
       WHERE table_schema = 'public'
         AND table_name = 'inventory_ai_profiles'
         AND column_name = 'embedding_vector'
     ) THEN
    ALTER TABLE inventory_ai_profiles ADD COLUMN embedding_vector vector(768);
    CREATE INDEX IF NOT EXISTS inventory_ai_profiles_embedding_vector_768_idx
      ON inventory_ai_profiles USING ivfflat (embedding_vector vector_cosine_ops)
      WITH (lists = 100);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS inventory_ai_profiles_photo_hash_idx
  ON inventory_ai_profiles (photo_hash)
  WHERE photo_hash IS NOT NULL;

CREATE INDEX IF NOT EXISTS inventory_ai_profiles_status_reindexed_idx
  ON inventory_ai_profiles (status, reindexed_at);
