CREATE TABLE IF NOT EXISTS "posted_videos" (
  "id" text PRIMARY KEY NOT NULL,
  "content_item_id" text,
  "publish_task_id" text,
  "filename" text NOT NULL,
  "hook_number" integer,
  "meat_number" integer,
  "cta_number" integer,
  "variant" text,
  "platform" text NOT NULL,
  "posted_at" timestamp NOT NULL,
  "status" text NOT NULL,
  "external_post_id" text,
  "created_at" timestamp DEFAULT now() NOT NULL
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'posted_videos_content_item_id_content_items_id_fk'
  ) THEN
    ALTER TABLE "posted_videos"
    ADD CONSTRAINT "posted_videos_content_item_id_content_items_id_fk"
    FOREIGN KEY ("content_item_id")
    REFERENCES "content_items"("id")
    ON DELETE SET NULL;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'posted_videos_publish_task_id_publish_tasks_id_fk'
  ) THEN
    ALTER TABLE "posted_videos"
    ADD CONSTRAINT "posted_videos_publish_task_id_publish_tasks_id_fk"
    FOREIGN KEY ("publish_task_id")
    REFERENCES "publish_tasks"("id")
    ON DELETE SET NULL;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS "idx_posted_videos_posted_at" ON "posted_videos" ("posted_at");
CREATE INDEX IF NOT EXISTS "idx_posted_videos_platform" ON "posted_videos" ("platform");
CREATE INDEX IF NOT EXISTS "idx_posted_videos_hook_number" ON "posted_videos" ("hook_number");
CREATE INDEX IF NOT EXISTS "idx_posted_videos_meat_number" ON "posted_videos" ("meat_number");
CREATE INDEX IF NOT EXISTS "idx_posted_videos_cta_number" ON "posted_videos" ("cta_number");
CREATE INDEX IF NOT EXISTS "idx_posted_videos_filename" ON "posted_videos" ("filename");
