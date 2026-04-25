CREATE TABLE IF NOT EXISTS "social_event_deliveries" (
  "source_event_id" text PRIMARY KEY NOT NULL,
  "platform" varchar(20) NOT NULL,
  "event_type" varchar(50) NOT NULL,
  "occurred_at" timestamp with time zone NOT NULL,
  "payload" jsonb NOT NULL,
  "delivery_status" varchar(20) DEFAULT 'pending' NOT NULL,
  "delivery_attempts" integer DEFAULT 0 NOT NULL,
  "delivered_at" timestamp with time zone,
  "last_error" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "social_execution_idempotency" (
  "idempotency_key" text PRIMARY KEY NOT NULL,
  "task_id" text NOT NULL,
  "request_payload" jsonb NOT NULL,
  "response_payload" jsonb,
  "status" varchar(20) DEFAULT 'pending' NOT NULL,
  "provider_action_id" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS "idx_social_event_deliveries_platform" ON "social_event_deliveries" ("platform");
CREATE INDEX IF NOT EXISTS "idx_social_event_deliveries_event_type" ON "social_event_deliveries" ("event_type");
CREATE INDEX IF NOT EXISTS "idx_social_event_deliveries_status" ON "social_event_deliveries" ("delivery_status");

CREATE INDEX IF NOT EXISTS "idx_social_execution_idempotency_task" ON "social_execution_idempotency" ("task_id");
CREATE INDEX IF NOT EXISTS "idx_social_execution_idempotency_status" ON "social_execution_idempotency" ("status");
