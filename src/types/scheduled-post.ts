// Types for Calendar Scheduled Posts

export type ScheduledPostStatus = 'planned' | 'queued' | 'published' | 'failed';

export type Platform = 'linkedin' | 'x' | 'instagram' | 'facebook' | 'tiktok' | 'youtube_shorts';

export interface MediaItem {
  id: string;
  type: 'image' | 'video';
  fileName: string;
  mimeType: string;
  size: number;
  localObjectUrl: string; // For preview (frontend only)
  storageUrl?: string; // If persisted to storage
}

export interface ScheduledPost {
  id: string;
  title: string | null;
  caption: string | null;
  scheduledDate: string; // YYYY-MM-DD
  scheduledTime: string; // HH:mm
  scheduledAt: string; // ISO datetime
  platforms: Platform[];
  status: ScheduledPostStatus;
  media: MediaItem[];
  mediaIds: string[]; // Derived from media[].id (source of truth: scheduled_post_media)
  contentItemId?: string; // Link to ContentItem if applicable
  createdAt: string;
  updatedAt: string;
}

export interface ScheduledPostInput {
  title?: string;
  caption?: string;
  scheduledDate: string;
  scheduledTime: string;
  platforms: Platform[];
  media: MediaItem[];
  contentItemId?: string;
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
];
