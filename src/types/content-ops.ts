// Type definitions for Marketing Content Ops

export type ContentStatus = 'draft' | 'ready' | 'scheduled' | 'posted' | 'repurpose' | 'archived';
export type ContentPillar = 'product' | 'educational' | 'proof' | 'meme' | 'offer';
export type ContentFormat = 'post' | 'reel' | 'short' | 'carousel' | 'article' | 'ad';
export type Priority = 1 | 2 | 3; // 1=high, 2=normal, 3=low
export type PublishState = 'todo' | 'scheduled' | 'posted' | 'skipped';
export type ChannelKey = 'x' | 'instagram' | 'facebook' | 'linkedin' | 'youtube' | 'website_blog' | 'whatsapp_status';

export interface Channel {
  id: string;
  key: ChannelKey;
  name: string;
  enabled: boolean;
  defaultChecklist: string[];
  createdAt: Date;
}

export interface ContentItem {
  id: string;
  title: string;
  hook: string | null;
  pillar: ContentPillar | null;
  format: ContentFormat | null;
  status: ContentStatus;
  priority: Priority;
  owner: string | null;
  notes: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface MediaAsset {
  id: string;
  storageProvider: string;
  bucket: string;
  objectKey: string;
  publicUrl: string | null;
  mimeType: string | null;
  sizeBytes: number | null;
  sha256: string | null;
  createdAt: Date;
}

export interface ChannelVariant {
  id: string;
  contentItemId: string;
  channelKey: ChannelKey;
  caption: string | null;
  hashtags: string | null;
  mediaPrompt: string | null;
  mediaAssetId: string | null;
  cta: string | null;
  linkUrl: string | null;
  utmCampaign: string | null;
  utmSource: string | null;
  utmMedium: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface PublishTask {
  id: string;
  contentItemId: string;
  channelKey: ChannelKey;
  scheduledFor: Date | null;
  state: PublishState;
  assignee: string | null;
  checklist: string[];
  createdAt: Date;
  updatedAt: Date;
}

export interface PublishLog {
  id: string;
  publishTaskId: string;
  postedAt: Date;
  postUrl: string | null;
  reach: number | null;
  clicks: number | null;
  notes: string | null;
}

export interface IntentEvent {
  id: string;
  eventType: 'post_published';
  source: 'content_ops';
  channelKey: ChannelKey | null;
  contentItemId: string | null;
  payload: Record<string, unknown>;
  createdAt: Date;
}

// View types for joined data
export interface ContentItemWithVariants extends ContentItem {
  variants: ChannelVariant[];
  tasks: PublishTask[];
}

export interface PublishTaskWithDetails extends PublishTask {
  contentItem: ContentItem;
  variant: ChannelVariant | null;
  log: PublishLog | null;
}

export interface PublishLogWithDetails extends PublishLog {
  task: PublishTask;
  contentItem: ContentItem;
}

// Filter types
export interface ContentFilters {
  status?: ContentStatus[];
  pillar?: ContentPillar[];
  format?: ContentFormat[];
  channel?: ChannelKey[];
  search?: string;
  dateRange?: { start: Date; end: Date };
}

export interface PublishLogFilters {
  channel?: ChannelKey[];
  dateRange?: { start: Date; end: Date };
}
