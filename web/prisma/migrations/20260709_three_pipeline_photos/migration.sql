-- Three-Pipeline Photo Architecture
-- Pipeline 1: original_photo (immutable upload)
-- Pipeline 2: enhanced_photo (strict AI preservation)
-- Pipeline 3: marketing_photo (creative AI)
-- Plus full enhancement tracking columns

ALTER TABLE clothing_items
  ADD COLUMN IF NOT EXISTS original_photo        TEXT,
  ADD COLUMN IF NOT EXISTS marketing_photo       TEXT,
  ADD COLUMN IF NOT EXISTS enhancement_model     TEXT,
  ADD COLUMN IF NOT EXISTS enhancement_latency   INTEGER,
  ADD COLUMN IF NOT EXISTS enhancement_started_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS enhancement_completed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS last_enhanced_at      TIMESTAMPTZ;

-- Backfill original_photo from photo for all existing items.
-- This preserves the current photo as the authoritative original.
UPDATE clothing_items
  SET original_photo = photo
  WHERE original_photo IS NULL
    AND photo IS NOT NULL
    AND photo <> '';
