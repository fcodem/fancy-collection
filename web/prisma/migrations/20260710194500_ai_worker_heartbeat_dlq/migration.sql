-- Durable AI worker heartbeat (serverless-safe) + dead-letter support
CREATE TABLE IF NOT EXISTS inventory_ai_worker_heartbeats (
  id               INT PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  worker_id        TEXT NOT NULL DEFAULT 'unknown',
  last_tick_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_drain_at    TIMESTAMPTZ,
  processed_total  INT NOT NULL DEFAULT 0,
  last_error       TEXT,
  source           TEXT NOT NULL DEFAULT 'unknown',
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO inventory_ai_worker_heartbeats (id, worker_id, last_tick_at, source)
VALUES (1, 'bootstrap', NOW(), 'migration')
ON CONFLICT (id) DO NOTHING;

-- Optional index for DLQ / failed job scans (status is already indexed with next_retry_at)
CREATE INDEX IF NOT EXISTS inventory_ai_jobs_status_updated_idx
  ON inventory_ai_jobs (status, updated_at DESC);
