import { pgTable, text, timestamp, jsonb, boolean, integer, varchar, unique, index, primaryKey } from 'drizzle-orm/pg-core';

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
// Note: mediaIds column is kept for backward compatibility but should not be used.
// mediaIds is now derived from content_item_media join table.
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
  mediaIds: jsonb('media_ids').$type<string[]>().notNull().default([]), // DEPRECATED: Use content_item_media instead
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
});

// Media assets table (R2-backed)
export const mediaAssets = pgTable('media_assets', {
  id: text('id').primaryKey(),
  storageProvider: varchar('storage_provider', { length: 50 }).notNull().default('r2'),
  bucket: varchar('bucket', { length: 255 }).notNull(),
  objectKey: varchar('object_key', { length: 500 }).notNull(),
  publicUrl: text('public_url'),
  mimeType: varchar('mime_type', { length: 100 }),
  sizeBytes: integer('size_bytes'),
  sha256: varchar('sha256', { length: 64 }),
  createdAt: timestamp('created_at').notNull().defaultNow(),
});

// Content item media join table (many-to-many: content_items <-> media_assets)
// This is the source of truth for content item media associations.
// mediaIds in API responses is ALWAYS derived from this table, never from content_items.media_ids.
export const contentItemMedia = pgTable('content_item_media', {
  contentItemId: text('content_item_id').notNull().references(() => contentItems.id, { onDelete: 'cascade' }),
  mediaAssetId: text('media_asset_id').notNull().references(() => mediaAssets.id, { onDelete: 'cascade' }),
  createdAt: timestamp('created_at').notNull().defaultNow(),
}, (t) => ({
  pk: primaryKey({ columns: [t.contentItemId, t.mediaAssetId] }),
  itemIdx: index('idx_content_item_media_item').on(t.contentItemId),
  assetIdx: index('idx_content_item_media_asset').on(t.mediaAssetId),
}));

// Channel variants table (unique on content_item_id + channel_key)
export const channelVariants = pgTable('channel_variants', {
  id: text('id').primaryKey(),
  contentItemId: text('content_item_id').notNull().references(() => contentItems.id, { onDelete: 'cascade' }),
  channelKey: varchar('channel_key', { length: 50 }).notNull(),
  caption: text('caption'),
  hashtags: text('hashtags'),
  mediaPrompt: text('media_prompt'),
  mediaAssetId: text('media_asset_id').references(() => mediaAssets.id, { onDelete: 'set null' }),
  cta: text('cta'),
  linkUrl: text('link_url'),
  utmCampaign: text('utm_campaign'),
  utmSource: text('utm_source'),
  utmMedium: text('utm_medium'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
}, (table) => ({
  uniqueContentChannel: unique().on(table.contentItemId, table.channelKey),
}));

// Publish tasks table (unique on content_item_id + channel_key)
export const publishTasks = pgTable('publish_tasks', {
  id: text('id').primaryKey(),
  contentItemId: text('content_item_id').notNull().references(() => contentItems.id, { onDelete: 'cascade' }),
  channelKey: varchar('channel_key', { length: 50 }).notNull(),
  scheduledFor: timestamp('scheduled_for'),
  state: text('state').notNull().default('pending'),
  status: text('status').notNull().default('pending'), // queued|running|success|failed|retryable_failed
  assignee: text('assignee'),
  checklist: jsonb('checklist').$type<string[]>().notNull().default([]),
  idempotencyKey: text('idempotency_key'),
  providerRef: text('provider_ref'),
  attempts: integer('attempts').notNull().default(0),
  maxAttempts: integer('max_attempts').notNull().default(5),
  lockedAt: timestamp('locked_at', { withTimezone: true, mode: 'date' }),
  lockedBy: text('locked_by'),
  lastError: text('last_error'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
}, (table) => ({
  uniqueContentChannel: unique().on(table.contentItemId, table.channelKey),
  idempotencyKeyIdx: index('idx_publish_tasks_idempotency_key').on(table.idempotencyKey),
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

// Posted videos history table
export const postedVideos = pgTable('posted_videos', {
  id: text('id').primaryKey(),
  contentItemId: text('content_item_id').references(() => contentItems.id, { onDelete: 'set null' }),
  publishTaskId: text('publish_task_id').references(() => publishTasks.id, { onDelete: 'set null' }),
  filename: text('filename').notNull(),
  hookNumber: integer('hook_number'),
  meatNumber: integer('meat_number'),
  ctaNumber: integer('cta_number'),
  variant: text('variant'),
  platform: text('platform').notNull(),
  postedAt: timestamp('posted_at').notNull(),
  status: text('status').notNull(),
  externalPostId: text('external_post_id'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
}, (table) => ({
  postedAtIdx: index('idx_posted_videos_posted_at').on(table.postedAt),
  platformIdx: index('idx_posted_videos_platform').on(table.platform),
  hookIdx: index('idx_posted_videos_hook_number').on(table.hookNumber),
  meatIdx: index('idx_posted_videos_meat_number').on(table.meatNumber),
  ctaIdx: index('idx_posted_videos_cta_number').on(table.ctaNumber),
  filenameIdx: index('idx_posted_videos_filename').on(table.filename),
}));

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

// ============================================
// SCHEDULED POSTS (Calendar Feature)
// ============================================

// Scheduled posts table
export const scheduledPosts = pgTable('scheduled_posts', {
  id: text('id').primaryKey(),
  title: text('title'),
  caption: text('caption'),
  contentItemId: text('content_item_id').references(() => contentItems.id, { onDelete: 'set null' }),
  channelKey: varchar('channel_key', { length: 50 }),
  recipientPhone: text('recipient_phone'),
  scheduledAt: timestamp('scheduled_at', { withTimezone: true }).notNull(),
  platforms: jsonb('platforms').$type<string[]>().notNull().default([]),
  status: varchar('status', { length: 50 }).notNull().default('planned'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => ({
  scheduledAtIdx: index('scheduled_posts_scheduled_at_idx').on(table.scheduledAt),
  uniqueContentChannel: unique().on(table.contentItemId, table.channelKey),
}));

// Scheduled post media table
export const scheduledPostMedia = pgTable('scheduled_post_media', {
  id: text('id').primaryKey(),
  scheduledPostId: text('scheduled_post_id').notNull().references(() => scheduledPosts.id, { onDelete: 'cascade' }),
  type: varchar('type', { length: 20 }).notNull(), // 'image' | 'video'
  fileName: text('file_name').notNull(),
  mimeType: varchar('mime_type', { length: 100 }).notNull(),
  size: integer('size').notNull(),
  storageUrl: text('storage_url'), // null for now, frontend uses object URLs
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

// Connected accounts table (OAuth tokens)
export const connectedAccounts = pgTable('connected_accounts', {
  id: text('id').primaryKey(),
  provider: varchar('provider', { length: 50 }).notNull(),
  label: text('label'),
  status: varchar('status', { length: 50 }).notNull().default('connected'), // connected|revoked|error
  accountRef: text('account_ref'),
  tokenCiphertext: text('token_ciphertext').notNull(),
  tokenMeta: jsonb('token_meta').$type<Record<string, unknown>>(),
  createdAt: timestamp('created_at', { withTimezone: true, mode: 'string' }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'string' }).notNull().defaultNow(),
}, (table) => ({
  providerIdx: index('idx_connected_accounts_provider').on(table.provider),
  uniqueProvider: unique().on(table.provider),
}));

// Social event idempotency + delivery tracking
export const socialEventDeliveries = pgTable('social_event_deliveries', {
  sourceEventId: text('source_event_id').primaryKey(),
  platform: varchar('platform', { length: 20 }).notNull(),
  eventType: varchar('event_type', { length: 50 }).notNull(),
  occurredAt: timestamp('occurred_at', { withTimezone: true }).notNull(),
  payload: jsonb('payload').$type<Record<string, unknown>>().notNull(),
  deliveryStatus: varchar('delivery_status', { length: 20 }).notNull().default('pending'), // pending|delivered|failed
  deliveryAttempts: integer('delivery_attempts').notNull().default(0),
  deliveredAt: timestamp('delivered_at', { withTimezone: true }),
  lastError: text('last_error'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => ({
  platformIdx: index('idx_social_event_deliveries_platform').on(table.platform),
  eventTypeIdx: index('idx_social_event_deliveries_event_type').on(table.eventType),
  statusIdx: index('idx_social_event_deliveries_status').on(table.deliveryStatus),
}));

// ExecuteTaskRequest idempotency + response caching
export const socialExecutionIdempotency = pgTable('social_execution_idempotency', {
  idempotencyKey: text('idempotency_key').primaryKey(),
  taskId: text('task_id').notNull(),
  requestPayload: jsonb('request_payload').$type<Record<string, unknown>>().notNull(),
  responsePayload: jsonb('response_payload').$type<Record<string, unknown>>(),
  status: varchar('status', { length: 20 }).notNull().default('pending'),
  providerActionId: text('provider_action_id'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => ({
  taskIdx: index('idx_social_execution_idempotency_task').on(table.taskId),
  statusIdx: index('idx_social_execution_idempotency_status').on(table.status),
}));

// Audit trail for every execution attempt (including blocked/unsupported/failures)
export const socialExecutionAttempts = pgTable('social_execution_attempts', {
  attemptId: text('attempt_id').primaryKey(),
  idempotencyKey: text('idempotency_key').notNull(),
  taskId: text('task_id').notNull(),
  platform: varchar('platform', { length: 20 }).notNull(),
  actionType: varchar('action_type', { length: 50 }).notNull(),
  accountRef: text('account_ref'),
  targetRef: text('target_ref').notNull(),
  requestPayload: jsonb('request_payload').$type<Record<string, unknown>>().notNull(),
  responsePayload: jsonb('response_payload').$type<Record<string, unknown>>().notNull(),
  providerPayload: jsonb('provider_payload').$type<Record<string, unknown>>(),
  status: varchar('status', { length: 20 }).notNull(),
  reasonCode: text('reason_code'),
  correlationId: text('correlation_id').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => ({
  idempotencyIdx: index('idx_social_execution_attempts_idempotency').on(table.idempotencyKey),
  statusIdx: index('idx_social_execution_attempts_status').on(table.status),
  accountActionIdx: index('idx_social_execution_attempts_account_action').on(table.accountRef, table.actionType, table.createdAt),
}));

// Instagram inbound ownership mapping (account/page -> DO-Intent owner user)
export const instagramOwnerUserMap = pgTable('instagram_owner_user_map', {
  accountRef: text('account_ref').primaryKey(),
  ownerUserId: text('owner_user_id').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => ({
  ownerUserIdx: index('idx_instagram_owner_user_map_owner_user').on(table.ownerUserId),
}));

