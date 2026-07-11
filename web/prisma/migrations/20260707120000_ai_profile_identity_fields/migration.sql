-- AI profile identity metadata (prompt/model versions).
-- Safe to re-run; later migrations may also add these columns.

ALTER TABLE "inventory_ai_profiles"
  ADD COLUMN IF NOT EXISTS "prompt_version" TEXT,
  ADD COLUMN IF NOT EXISTS "ai_version" TEXT;
