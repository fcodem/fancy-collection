-- Enable pgvector for Dress Checker (SigLIP 768-d embeddings)
-- Soft-fail friendly: never hard-abort deploy if extension/index setup is partial.

DO $$
BEGIN
  CREATE EXTENSION IF NOT EXISTS vector;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'pgvector extension not available: %', SQLERRM;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'vector') THEN
    RAISE WARNING 'pgvector extension is not available — Dress Checker will use non-vector fallbacks.';
    RETURN;
  END IF;

  -- Normalize to vector(768). Safe on empty/new DBs; clears a prior failed 3072 attempt.
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'inventory_ai_profiles'
      AND column_name = 'embedding_vector'
  ) THEN
    ALTER TABLE inventory_ai_profiles DROP COLUMN embedding_vector;
  END IF;

  ALTER TABLE inventory_ai_profiles ADD COLUMN embedding_vector vector(768);
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'embedding_vector setup skipped: %', SQLERRM;
END $$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'vector')
     AND EXISTS (
       SELECT 1 FROM information_schema.columns
       WHERE table_schema = 'public'
         AND table_name = 'inventory_ai_profiles'
         AND column_name = 'embedding_vector'
     ) THEN
    CREATE INDEX IF NOT EXISTS inventory_ai_profiles_embedding_vector_768_idx
      ON inventory_ai_profiles USING ivfflat (embedding_vector vector_cosine_ops)
      WITH (lists = 100);
  END IF;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'ivfflat index creation skipped (safe to create later): %', SQLERRM;
END $$;
