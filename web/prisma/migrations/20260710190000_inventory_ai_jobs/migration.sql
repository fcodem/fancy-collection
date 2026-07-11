-- Durable AI indexing job queue + stone signature flag.

CREATE TABLE IF NOT EXISTS inventory_ai_jobs (
  id SERIAL PRIMARY KEY,
  item_id INTEGER NOT NULL REFERENCES clothing_items(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'PENDING',
  reason TEXT NOT NULL DEFAULT 'enqueue',
  priority INTEGER NOT NULL DEFAULT 100,
  retry_count INTEGER NOT NULL DEFAULT 0,
  max_retries INTEGER NOT NULL DEFAULT 3,
  error_message TEXT,
  last_error TEXT,
  next_retry_at TIMESTAMP,
  started_at TIMESTAMP,
  completed_at TIMESTAMP,
  locked_at TIMESTAMP,
  locked_by TEXT,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS inventory_ai_jobs_status_retry_priority_idx
  ON inventory_ai_jobs (status, next_retry_at, priority);

CREATE INDEX IF NOT EXISTS inventory_ai_jobs_item_status_idx
  ON inventory_ai_jobs (item_id, status);

CREATE INDEX IF NOT EXISTS inventory_ai_jobs_created_at_idx
  ON inventory_ai_jobs (created_at);

ALTER TABLE inventory_ai_profiles
  ADD COLUMN IF NOT EXISTS has_stone_signature BOOLEAN NOT NULL DEFAULT false;

-- FK to profiles (item_id is also profile PK) — optional soft link via same item_id.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'inventory_ai_jobs_item_id_profile_fkey'
  ) THEN
    -- Profiles may not exist yet for a job; skip hard FK to profiles.
    NULL;
  END IF;
END $$;
