-- publish_tasks: idempotency + locking + retries + provider_ref

ALTER TABLE publish_tasks
  ADD COLUMN IF NOT EXISTS idempotency_key TEXT,
  ADD COLUMN IF NOT EXISTS provider_ref TEXT,
  ADD COLUMN IF NOT EXISTS attempts INT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS max_attempts INT NOT NULL DEFAULT 5,
  ADD COLUMN IF NOT EXISTS locked_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS locked_by TEXT,
  ADD COLUMN IF NOT EXISTS last_error TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS idx_publish_tasks_idempotency_key
ON publish_tasks (idempotency_key)
WHERE idempotency_key IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_publish_tasks_status_scheduled
ON publish_tasks (status, scheduled_for);

CREATE INDEX IF NOT EXISTS idx_publish_tasks_lock
ON publish_tasks (locked_at);
