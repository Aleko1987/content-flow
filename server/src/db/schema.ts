import { pgTable, text, timestamp, jsonb, boolean, integer, varchar, uniqueIndex } from 'drizzle-orm/pg-core';

// Channels table
export const channels = pgTable('channels', {
  id: text('id').primaryKey(),
  key: varchar('key', { length: 50 }).notNull().unique(),
  name: varchar('name', { length: 100 }).notNull(),
  enabled: boolean('enabled').notNull().default(true),
  defaultChecklist: jsonb('default_checklist').$type<string[]>().notNull().default([]),
  createdAt: timestamp('created_at').notNull().defaultNow(),
});

// Content items table
export const contentItems = pgTable('content_items', {
  id: text('id').primaryKey(),
  title: varchar('title', { length: 500 }).notNull(),
  hook: text('hook'),
  pillar: varchar('pillar', { length: 50 }),
  format: varchar('format', { length: 50 }),
  status: varchar('status', { length: 50 }).notNull().default('draft'),
  priority: integer('priority').notNull().default(2),
  owner: text('owner'),
  notes: text('notes'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
});

// Channel variants table (unique on content_item_id + channel_key)
export const channelVariants = pgTable('channel_variants', {
  id: text('id').primaryKey(),
  contentItemId: text('content_item_id').notNull().references(() => contentItems.id, { onDelete: 'cascade' }),
  channelKey: varchar('channel_key', { length: 50 }).notNull(),
  caption: text('caption'),
  hashtags: text('hashtags'),
  mediaPrompt: text('media_prompt'),
  cta: text('cta'),
  linkUrl: text('link_url'),
  utmCampaign: text('utm_campaign'),
  utmSource: text('utm_source'),
  utmMedium: text('utm_medium'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
}, (table) => ({
  uniqueContentChannel: uniqueIndex('unique_content_channel_variant').on(table.contentItemId, table.channelKey),
}));

// Publish tasks table (unique on content_item_id + channel_key)
export const publishTasks = pgTable('publish_tasks', {
  id: text('id').primaryKey(),
  contentItemId: text('content_item_id').notNull().references(() => contentItems.id, { onDelete: 'cascade' }),
  channelKey: varchar('channel_key', { length: 50 }).notNull(),
  scheduledFor: timestamp('scheduled_for'),
  state: varchar('state', { length: 50 }).notNull().default('todo'),
  assignee: text('assignee'),
  checklist: jsonb('checklist').$type<string[]>().notNull().default([]),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
}, (table) => ({
  uniqueContentChannel: uniqueIndex('unique_content_channel_task').on(table.contentItemId, table.channelKey),
}));

// Publish logs table
export const publishLogs = pgTable('publish_logs', {
  id: text('id').primaryKey(),
  publishTaskId: text('publish_task_id').notNull().references(() => publishTasks.id, { onDelete: 'cascade' }),
  postedAt: timestamp('posted_at').notNull(),
  postUrl: text('post_url'),
  reach: integer('reach'),
  clicks: integer('clicks'),
  notes: text('notes'),
});

// Intent events table
export const intentEvents = pgTable('intent_events', {
  id: text('id').primaryKey(),
  eventType: varchar('event_type', { length: 100 }).notNull(),
  source: varchar('source', { length: 100 }).notNull(),
  channelKey: varchar('channel_key', { length: 50 }),
  contentItemId: text('content_item_id'),
  payload: jsonb('payload').$type<Record<string, unknown>>().notNull(),
  createdAt: timestamp('created_at').notNull().defaultNow(),
});

