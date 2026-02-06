ALTER TABLE "scheduled_posts"
ADD COLUMN IF NOT EXISTS "content_item_id" text;

ALTER TABLE "scheduled_posts"
ADD COLUMN IF NOT EXISTS "channel_key" varchar(50);

-- Optional foreign key for content_item_id
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'scheduled_posts_content_item_id_fk'
  ) THEN
    ALTER TABLE "scheduled_posts"
    ADD CONSTRAINT "scheduled_posts_content_item_id_fk"
    FOREIGN KEY ("content_item_id")
    REFERENCES "content_items"("id")
    ON DELETE SET NULL;
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS "scheduled_posts_content_item_channel_key_unique"
ON "scheduled_posts" ("content_item_id", "channel_key");

