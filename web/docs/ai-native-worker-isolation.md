# AI native worker crash isolation (Part 7)

Split: `aiJobTypes` → `aiJobClient` → `aiJobQueue` (worker) → `aiJobWorker`.
One job/cron, 50s timeout, /tmp probe, deterministic failures → dead letter.
Website ok = database ok only.
