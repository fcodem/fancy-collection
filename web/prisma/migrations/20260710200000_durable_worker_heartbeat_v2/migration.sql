-- Durable heartbeat schema for serverless-safe worker health
CREATE TABLE IF NOT EXISTS inventory_ai_worker_heartbeats (
  id                   INT PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  worker_id            TEXT NOT NULL DEFAULT 'unknown',
  mode                 TEXT NOT NULL DEFAULT 'CRON_WORKER',
  hostname             TEXT NOT NULL DEFAULT 'unknown',
  last_heartbeat_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_drain_at        TIMESTAMPTZ,
  processed_jobs       INT NOT NULL DEFAULT 0,
  processed_jobs_today INT NOT NULL DEFAULT 0,
  processed_today_date DATE,
  last_error           TEXT,
  source               TEXT NOT NULL DEFAULT 'unknown',
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE inventory_ai_worker_heartbeats ADD COLUMN IF NOT EXISTS mode TEXT;
ALTER TABLE inventory_ai_worker_heartbeats ADD COLUMN IF NOT EXISTS hostname TEXT;
ALTER TABLE inventory_ai_worker_heartbeats ADD COLUMN IF NOT EXISTS last_heartbeat_at TIMESTAMPTZ;
ALTER TABLE inventory_ai_worker_heartbeats ADD COLUMN IF NOT EXISTS processed_jobs INT;
ALTER TABLE inventory_ai_worker_heartbeats ADD COLUMN IF NOT EXISTS processed_jobs_today INT;
ALTER TABLE inventory_ai_worker_heartbeats ADD COLUMN IF NOT EXISTS processed_today_date DATE;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'inventory_ai_worker_heartbeats' AND column_name = 'last_tick_at'
  ) THEN
    EXECUTE $u$
      UPDATE inventory_ai_worker_heartbeats
      SET last_heartbeat_at = COALESCE(last_heartbeat_at, last_tick_at, NOW())
      WHERE id = 1
    $u$;
  END IF;
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'inventory_ai_worker_heartbeats' AND column_name = 'processed_total'
  ) THEN
    EXECUTE $u$
      UPDATE inventory_ai_worker_heartbeats
      SET processed_jobs = COALESCE(NULLIF(processed_jobs, 0), processed_total, 0)
      WHERE id = 1
    $u$;
  END IF;
END $$;

UPDATE inventory_ai_worker_heartbeats
SET
  mode = COALESCE(NULLIF(mode, ''), 'CRON_WORKER'),
  hostname = COALESCE(NULLIF(hostname, ''), 'unknown'),
  last_heartbeat_at = COALESCE(last_heartbeat_at, NOW()),
  processed_jobs = COALESCE(processed_jobs, 0),
  processed_jobs_today = COALESCE(processed_jobs_today, 0)
WHERE id = 1;

INSERT INTO inventory_ai_worker_heartbeats (id, worker_id, mode, hostname, last_heartbeat_at, source)
VALUES (1, 'bootstrap', 'CRON_WORKER', 'bootstrap', NOW(), 'migration')
ON CONFLICT (id) DO NOTHING;
