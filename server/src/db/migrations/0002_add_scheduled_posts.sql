-- Migration: Add scheduled_posts and scheduled_post_media tables
-- Generated for Neon Postgres

-- Scheduled posts table
CREATE TABLE IF NOT EXISTS "scheduled_posts" (
  "id" text PRIMARY KEY NOT NULL,
  "title" text,
  "caption" text,
  "scheduled_at" timestamp with time zone NOT NULL,
  "platforms" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "status" varchar(50) DEFAULT 'planned' NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

-- Index on scheduled_at for date range queries
CREATE INDEX IF NOT EXISTS "scheduled_posts_scheduled_at_idx" ON "scheduled_posts" ("scheduled_at");

-- Scheduled post media table
CREATE TABLE IF NOT EXISTS "scheduled_post_media" (
  "id" text PRIMARY KEY NOT NULL,
  "scheduled_post_id" text NOT NULL REFERENCES "scheduled_posts"("id") ON DELETE CASCADE,
  "type" varchar(20) NOT NULL,
  "file_name" text NOT NULL,
  "mime_type" varchar(100) NOT NULL,
  "size" integer NOT NULL,
  "storage_url" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);

-- Index for looking up media by post
CREATE INDEX IF NOT EXISTS "scheduled_post_media_post_id_idx" ON "scheduled_post_media" ("scheduled_post_id");
