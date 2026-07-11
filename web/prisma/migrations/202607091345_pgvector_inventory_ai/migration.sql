-- pgvector + text embedding columns for inventory_ai_profiles.
-- Uses DO blocks so the migration succeeds even if the pgvector extension
-- is not yet installed on the local Postgres server. The system will
-- automatically use JSONB cosine search as fallback when vector columns
-- do not exist.

-- Step 1: Attempt to install pgvector (no-op if already present, silent warning if not installed)
DO $$
BEGIN
  CREATE EXTENSION IF NOT EXISTS vector;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'pgvector extension not available on this server. Vector columns will be skipped. Install pgvector and re-run migrations to enable native vector search. Error: %', SQLERRM;
END $$;

-- Step 2: Add prompt_version and ai_version columns (non-vector, always succeeds)
ALTER TABLE "inventory_ai_profiles"
  ADD COLUMN IF NOT EXISTS "prompt_version" TEXT,
  ADD COLUMN IF NOT EXISTS "ai_version" TEXT;

-- Step 3: Add 3072-d text embedding vector column ONLY if pgvector is available
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'vector') THEN
    ALTER TABLE "inventory_ai_profiles"
      ADD COLUMN IF NOT EXISTS "embedding_vector" vector(3072);
    CREATE INDEX IF NOT EXISTS "inventory_ai_profiles_embedding_vector_idx"
      ON "inventory_ai_profiles" USING ivfflat ("embedding_vector" vector_cosine_ops)
      WITH (lists = 100);
    CREATE INDEX IF NOT EXISTS "inventory_ai_profiles_status_indexed_at_idx"
      ON "inventory_ai_profiles" ("status", "indexed_at");
  ELSE
    RAISE WARNING 'Skipping embedding_vector column because pgvector is not installed.';
  END IF;
END $$;
