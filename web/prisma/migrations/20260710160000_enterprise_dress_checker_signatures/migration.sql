-- Enterprise dress checker: explicit signature columns + multi-reference pgvector search.

ALTER TABLE inventory_ai_profiles
  ADD COLUMN IF NOT EXISTS dominant_color TEXT,
  ADD COLUMN IF NOT EXISTS secondary_color TEXT,
  ADD COLUMN IF NOT EXISTS embroidery_signature JSONB,
  ADD COLUMN IF NOT EXISTS border_signature JSONB,
  ADD COLUMN IF NOT EXISTS motif_signature JSONB,
  ADD COLUMN IF NOT EXISTS texture_signature JSONB,
  ADD COLUMN IF NOT EXISTS silhouette_signature JSONB,
  ADD COLUMN IF NOT EXISTS stone_signature JSONB,
  ADD COLUMN IF NOT EXISTS panel_signature JSONB,
  ADD COLUMN IF NOT EXISTS matching_version INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_indexed_at TIMESTAMP;

ALTER TABLE clothing_item_reference_photos
  ADD COLUMN IF NOT EXISTS embedding_json JSONB,
  ADD COLUMN IF NOT EXISTS last_indexed_at TIMESTAMP;

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
         AND table_name = 'clothing_item_reference_photos'
         AND column_name = 'embedding_vector'
     ) THEN
    ALTER TABLE clothing_item_reference_photos ADD COLUMN embedding_vector vector(768);
    CREATE INDEX IF NOT EXISTS clothing_item_reference_photos_embedding_vector_idx
      ON clothing_item_reference_photos USING ivfflat (embedding_vector vector_cosine_ops)
      WITH (lists = 50);
  END IF;
END $$;
