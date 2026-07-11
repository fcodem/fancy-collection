-- Fault-tolerant dress-checker profile lifecycle + validation flags.

ALTER TABLE inventory_ai_profiles
  ADD COLUMN IF NOT EXISTS ai_status TEXT NOT NULL DEFAULT 'PENDING',
  ADD COLUMN IF NOT EXISTS last_index_attempt_at TIMESTAMP,
  ADD COLUMN IF NOT EXISTS last_successful_index_at TIMESTAMP,
  ADD COLUMN IF NOT EXISTS index_failure_reason TEXT,
  ADD COLUMN IF NOT EXISTS index_checksum TEXT,
  ADD COLUMN IF NOT EXISTS needs_reindex BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS auto_repair_count INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS has_embedding BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS has_colour_data BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS has_embroidery_signature BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS has_border_signature BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS has_motif_signature BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS has_texture_signature BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS has_panel_signature BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS has_identification_index BOOLEAN NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS inventory_ai_profiles_ai_status_idx
  ON inventory_ai_profiles (ai_status);

CREATE INDEX IF NOT EXISTS inventory_ai_profiles_needs_reindex_idx
  ON inventory_ai_profiles (needs_reindex)
  WHERE needs_reindex = true;

-- Backfill ai_status from legacy status.
UPDATE inventory_ai_profiles
SET ai_status = CASE lower(status)
  WHEN 'ready' THEN 'READY'
  WHEN 'completed' THEN 'READY'
  WHEN 'processing' THEN 'PROCESSING'
  WHEN 'failed' THEN 'FAILED'
  WHEN 'error' THEN 'FAILED'
  WHEN 'stale' THEN 'STALE'
  WHEN 'pending' THEN 'PENDING'
  ELSE 'PENDING'
END
WHERE ai_status IS NULL OR ai_status = 'PENDING';

-- Mark incomplete "ready/completed" profiles as needing repair (do not leave searchable).
UPDATE inventory_ai_profiles
SET
  ai_status = 'STALE',
  status = 'stale',
  needs_reindex = true,
  index_failure_reason = COALESCE(
    index_failure_reason,
    'Migrated: incomplete enterprise profile (missing signatures, colour, embedding, or version)'
  )
WHERE lower(status) IN ('ready', 'completed')
  AND (
    dominant_color IS NULL
    OR embroidery_signature IS NULL
    OR border_signature IS NULL
    OR motif_signature IS NULL
    OR texture_signature IS NULL
    OR panel_signature IS NULL
    OR matching_version IS NULL
    OR matching_version < 9
    OR recognition_version IS NULL
    OR recognition_version < 9
    OR COALESCE(NULLIF(regexp_replace(COALESCE(pipeline_version, '0'), '[^0-9]', '', 'g'), ''), '0')::int < 9
    OR embedding_vector IS NULL
  );
