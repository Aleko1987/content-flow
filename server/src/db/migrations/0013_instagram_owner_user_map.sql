CREATE TABLE IF NOT EXISTS "instagram_owner_user_map" (
  "account_ref" text PRIMARY KEY NOT NULL,
  "owner_user_id" text NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS "idx_instagram_owner_user_map_owner_user"
  ON "instagram_owner_user_map" ("owner_user_id");
