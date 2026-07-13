-- pgvector prep for inventory_ai_profiles.
-- IMPORTANT: do NOT create vector(3072) + ivfflat here.
-- pgvector IVFFlat cannot index 3072-d vectors (limit ~2000), which previously
-- marked this migration as FAILED in production and blocked all later deploys.
-- Dress Checker migrations add vector(768) + indexes safely afterward.

DO $$
BEGIN
  CREATE EXTENSION IF NOT EXISTS vector;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'pgvector extension not available: %', SQLERRM;
END $$;

ALTER TABLE "inventory_ai_profiles"
  ADD COLUMN IF NOT EXISTS "prompt_version" TEXT,
  ADD COLUMN IF NOT EXISTS "ai_version" TEXT;

-- Optional non-indexed JSONB-friendly marker only; real vector column comes later (768-d).
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'vector') THEN
    -- Leave any existing embedding_vector alone (may be partial from a prior failed attempt).
    -- Do not create ivfflat indexes in this migration.
    NULL;
  ELSE
    RAISE WARNING 'Skipping vector setup because pgvector is not installed.';
  END IF;
END $$;
