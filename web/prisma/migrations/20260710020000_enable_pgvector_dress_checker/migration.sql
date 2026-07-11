-- Enable pgvector for Dress Checker (SigLIP 768-d embeddings)
-- Requires pgvector extension files installed on the PostgreSQL host.

CREATE EXTENSION IF NOT EXISTS vector;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'vector') THEN
    RAISE EXCEPTION 'pgvector extension is not available. Install it on the PostgreSQL server first.';
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'inventory_ai_profiles'
      AND column_name = 'embedding_vector'
      AND udt_name = 'vector'
  ) THEN
    NULL;
  ELSIF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'inventory_ai_profiles'
      AND column_name = 'embedding_vector'
  ) THEN
    ALTER TABLE inventory_ai_profiles DROP COLUMN embedding_vector;
    ALTER TABLE inventory_ai_profiles ADD COLUMN embedding_vector vector(768);
  ELSE
    ALTER TABLE inventory_ai_profiles ADD COLUMN embedding_vector vector(768);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS inventory_ai_profiles_embedding_vector_768_idx
  ON inventory_ai_profiles USING ivfflat (embedding_vector vector_cosine_ops)
  WITH (lists = 100);
