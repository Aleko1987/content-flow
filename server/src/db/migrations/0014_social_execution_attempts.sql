CREATE TABLE IF NOT EXISTS "social_execution_attempts" (
  "attempt_id" text PRIMARY KEY NOT NULL,
  "idempotency_key" text NOT NULL,
  "task_id" text NOT NULL,
  "platform" varchar(20) NOT NULL,
  "action_type" varchar(50) NOT NULL,
  "account_ref" text,
  "target_ref" text NOT NULL,
  "request_payload" jsonb NOT NULL,
  "response_payload" jsonb NOT NULL,
  "provider_payload" jsonb,
  "status" varchar(20) NOT NULL,
  "reason_code" text,
  "correlation_id" text NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS "idx_social_execution_attempts_idempotency"
  ON "social_execution_attempts" ("idempotency_key");
CREATE INDEX IF NOT EXISTS "idx_social_execution_attempts_status"
  ON "social_execution_attempts" ("status");
CREATE INDEX IF NOT EXISTS "idx_social_execution_attempts_account_action"
  ON "social_execution_attempts" ("account_ref", "action_type", "created_at");
