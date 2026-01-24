CREATE TABLE "channel_variants" (
	"id" text PRIMARY KEY NOT NULL,
	"content_item_id" text NOT NULL,
	"channel_key" varchar(50) NOT NULL,
	"caption" text,
	"hashtags" text,
	"media_prompt" text,
	"media_asset_id" text,
	"cta" text,
	"link_url" text,
	"utm_campaign" text,
	"utm_source" text,
	"utm_medium" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "channel_variants_content_item_id_channel_key_unique" UNIQUE("content_item_id","channel_key")
);
--> statement-breakpoint
CREATE TABLE "channels" (
	"id" text PRIMARY KEY NOT NULL,
	"key" varchar(50) NOT NULL,
	"name" varchar(100) NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"default_checklist" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "channels_key_unique" UNIQUE("key")
);
--> statement-breakpoint
CREATE TABLE "content_items" (
	"id" text PRIMARY KEY NOT NULL,
	"title" varchar(500) NOT NULL,
	"hook" text,
	"pillar" varchar(50),
	"format" varchar(50),
	"status" varchar(50) DEFAULT 'draft' NOT NULL,
	"priority" integer DEFAULT 2 NOT NULL,
	"owner" text,
	"notes" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "intent_events" (
	"id" text PRIMARY KEY NOT NULL,
	"event_type" varchar(100) NOT NULL,
	"source" varchar(100) NOT NULL,
	"channel_key" varchar(50),
	"content_item_id" text,
	"payload" jsonb NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "media_assets" (
	"id" text PRIMARY KEY NOT NULL,
	"storage_provider" varchar(50) DEFAULT 'r2' NOT NULL,
	"bucket" varchar(255) NOT NULL,
	"object_key" varchar(500) NOT NULL,
	"public_url" text,
	"mime_type" varchar(100),
	"size_bytes" integer,
	"sha256" varchar(64),
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "publish_logs" (
	"id" text PRIMARY KEY NOT NULL,
	"publish_task_id" text NOT NULL,
	"posted_at" timestamp NOT NULL,
	"post_url" text,
	"reach" integer,
	"clicks" integer,
	"notes" text
);
--> statement-breakpoint
CREATE TABLE "publish_tasks" (
	"id" text PRIMARY KEY NOT NULL,
	"content_item_id" text NOT NULL,
	"channel_key" varchar(50) NOT NULL,
	"scheduled_for" timestamp,
	"state" varchar(50) DEFAULT 'todo' NOT NULL,
	"assignee" text,
	"checklist" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "publish_tasks_content_item_id_channel_key_unique" UNIQUE("content_item_id","channel_key")
);
--> statement-breakpoint
CREATE TABLE "scheduled_post_media" (
	"id" text PRIMARY KEY NOT NULL,
	"scheduled_post_id" text NOT NULL,
	"type" varchar(20) NOT NULL,
	"file_name" text NOT NULL,
	"mime_type" varchar(100) NOT NULL,
	"size" integer NOT NULL,
	"storage_url" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "scheduled_posts" (
	"id" text PRIMARY KEY NOT NULL,
	"title" text,
	"caption" text,
	"scheduled_at" timestamp with time zone NOT NULL,
	"platforms" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"status" varchar(50) DEFAULT 'planned' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "channel_variants" ADD CONSTRAINT "channel_variants_content_item_id_content_items_id_fk" FOREIGN KEY ("content_item_id") REFERENCES "public"."content_items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "channel_variants" ADD CONSTRAINT "channel_variants_media_asset_id_media_assets_id_fk" FOREIGN KEY ("media_asset_id") REFERENCES "public"."media_assets"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "publish_logs" ADD CONSTRAINT "publish_logs_publish_task_id_publish_tasks_id_fk" FOREIGN KEY ("publish_task_id") REFERENCES "public"."publish_tasks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "publish_tasks" ADD CONSTRAINT "publish_tasks_content_item_id_content_items_id_fk" FOREIGN KEY ("content_item_id") REFERENCES "public"."content_items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scheduled_post_media" ADD CONSTRAINT "scheduled_post_media_scheduled_post_id_scheduled_posts_id_fk" FOREIGN KEY ("scheduled_post_id") REFERENCES "public"."scheduled_posts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "scheduled_posts_scheduled_at_idx" ON "scheduled_posts" USING btree ("scheduled_at");