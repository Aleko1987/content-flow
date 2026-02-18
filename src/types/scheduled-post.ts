// Types for Calendar Scheduled Posts

export type ScheduledPostStatus = 'planned' | 'queued' | 'published' | 'failed';

import type { ChannelKey } from './content-ops';

export type Platform =
  | 'linkedin'
  | 'x'
  | 'instagram'
  | 'facebook'
  | 'tiktok'
  | 'youtube_shorts'
  | 'whatsapp_status';

export interface MediaItem {
  id: string;
  type: 'image' | 'video';
  fileName: string;
  mimeType: string;
  size: number;
  localObjectUrl?: string; // For preview (frontend only; may be missing for persisted media)
  storageUrl?: string; // Publicly accessible URL (required for IG publish)
}

export interface ScheduledPost {
  id: string;
  title: string | null;
  caption: string | null;
  contentItemId?: string;
  channelKey?: ChannelKey | null;
  scheduledDate: string; // YYYY-MM-DD
  scheduledTime: string; // HH:mm
  scheduledAt: string; // ISO datetime
  platforms: Platform[];
  status: ScheduledPostStatus;
  media: MediaItem[];
  mediaIds: string[]; // Derived from media[].id (source of truth: scheduled_post_media)
  createdAt: string;
  updatedAt: string;
}

export interface ScheduledPostInput {
  title?: string;
  caption?: string;
  contentItemId?: string;
  channelKey?: ChannelKey | null;
  scheduledDate: string;
  scheduledTime: string;
  platforms: Platform[];
  media: MediaItem[];
}

// File validation constants
export const FILE_LIMITS = {
  IMAGE_MAX_SIZE: 20 * 1024 * 1024, // 20MB
  VIDEO_MAX_SIZE: 200 * 1024 * 1024, // 200MB
  ALLOWED_IMAGE_TYPES: ['image/png', 'image/jpg', 'image/jpeg', 'image/webp', 'image/gif'],
  ALLOWED_VIDEO_TYPES: ['video/mp4', 'video/webm', 'video/quicktime'],
};

export const PLATFORMS: { key: Platform; label: string; icon: string }[] = [
  { key: 'linkedin', label: 'LinkedIn', icon: '💼' },
  { key: 'x', label: 'X (Twitter)', icon: '𝕏' },
  { key: 'instagram', label: 'Instagram', icon: '📷' },
  { key: 'facebook', label: 'Facebook', icon: '📘' },
  { key: 'tiktok', label: 'TikTok', icon: '🎵' },
  { key: 'youtube_shorts', label: 'YouTube Shorts', icon: '▶️' },
  { key: 'whatsapp_status', label: 'WhatsApp Status (assisted)', icon: '💬' },
];
