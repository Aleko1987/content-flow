// Scheduled Post API Service - Backend-backed persistence
import type { ScheduledPost, ScheduledPostInput, MediaItem, Platform } from '@/types/scheduled-post';

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:3001';

// Helper to convert frontend MediaItem to API format
const mediaToApi = (media: MediaItem[]) => 
  media.map(m => ({
    id: m.id,
    type: m.type,
    fileName: m.fileName,
    mimeType: m.mimeType,
    size: m.size,
    storageUrl: m.storageUrl || null,
  }));

// Helper to convert API response to frontend format
const apiToScheduledPost = (data: any): ScheduledPost => ({
  id: data.id,
  title: data.title,
  caption: data.caption,
  scheduledDate: data.scheduledDate,
  scheduledTime: data.scheduledTime,
  scheduledAt: data.scheduledAt,
  platforms: data.platforms as Platform[],
  status: data.status,
  media: (data.media || []).map((m: any) => ({
    id: m.id,
    type: m.type,
    fileName: m.fileName,
    mimeType: m.mimeType,
    size: m.size,
    storageUrl: m.storageUrl,
    localObjectUrl: undefined, // API doesn't store local URLs
  })),
  contentItemId: data.contentItemId,
  createdAt: data.createdAt,
  updatedAt: data.updatedAt,
});

// Combine date and time to ISO string
const combineDateTime = (date: string, time: string): string => {
  return new Date(`${date}T${time}:00`).toISOString();
};

// Get posts for a date range
const getByDateRange = async (startDate: string, endDate: string): Promise<ScheduledPost[]> => {
  const response = await fetch(
    `${API_BASE}/api/scheduled-posts?from=${startDate}&to=${endDate}`
  );
  
  if (!response.ok) {
    throw new Error(`Failed to fetch scheduled posts: ${response.statusText}`);
  }
  
  const data = await response.json();
  return data.map(apiToScheduledPost);
};

// Get all posts (fetches a wide range - 1 year)
const getAll = async (): Promise<ScheduledPost[]> => {
  const now = new Date();
  const startDate = new Date(now.getFullYear(), 0, 1).toISOString().split('T')[0];
  const endDate = new Date(now.getFullYear() + 1, 11, 31).toISOString().split('T')[0];
  return getByDateRange(startDate, endDate);
};

// Get post by ID (fetches all and filters - simple approach)
const getById = async (id: string): Promise<ScheduledPost | null> => {
  const posts = await getAll();
  return posts.find(p => p.id === id) || null;
};

// Get posts for a specific date
const getByDate = async (date: string): Promise<ScheduledPost[]> => {
  return getByDateRange(date, date);
};

// Create a new post
const create = async (input: ScheduledPostInput): Promise<ScheduledPost> => {
  const scheduledAt = combineDateTime(input.scheduledDate, input.scheduledTime);
  
  const response = await fetch(`${API_BASE}/api/scheduled-posts`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      title: input.title || null,
      caption: input.caption || null,
      scheduledAt,
      platforms: input.platforms,
      status: 'planned',
      media: mediaToApi(input.media),
    }),
  });
  
  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.error || `Failed to create scheduled post: ${response.statusText}`);
  }
  
  const data = await response.json();
  return apiToScheduledPost(data);
};

// Update an existing post
const update = async (id: string, input: Partial<ScheduledPostInput>): Promise<ScheduledPost> => {
  const body: Record<string, any> = {};
  
  if (input.title !== undefined) body.title = input.title;
  if (input.caption !== undefined) body.caption = input.caption;
  if (input.platforms !== undefined) body.platforms = input.platforms;
  if (input.media !== undefined) body.media = mediaToApi(input.media);
  
  // Handle date/time updates
  if (input.scheduledDate && input.scheduledTime) {
    body.scheduledAt = combineDateTime(input.scheduledDate, input.scheduledTime);
  } else if (input.scheduledDate || input.scheduledTime) {
    // Need to fetch current post to combine with existing date/time
    const current = await getById(id);
    if (current) {
      const date = input.scheduledDate || current.scheduledDate;
      const time = input.scheduledTime || current.scheduledTime;
      body.scheduledAt = combineDateTime(date, time);
    }
  }
  
  const response = await fetch(`${API_BASE}/api/scheduled-posts/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  
  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.error || `Failed to update scheduled post: ${response.statusText}`);
  }
  
  const data = await response.json();
  return apiToScheduledPost(data);
};

// Delete a post
const remove = async (id: string): Promise<void> => {
  const response = await fetch(`${API_BASE}/api/scheduled-posts/${id}`, {
    method: 'DELETE',
  });
  
  if (!response.ok && response.status !== 204) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.error || `Failed to delete scheduled post: ${response.statusText}`);
  }
};

// Move post to a new date (for drag and drop)
const moveToDate = async (id: string, newDate: string, newTime?: string): Promise<ScheduledPost> => {
  return update(id, { 
    scheduledDate: newDate, 
    ...(newTime && { scheduledTime: newTime }) 
  });
};

// Create multiple posts from dropped files
const createFromFiles = async (
  date: string, 
  time: string, 
  mediaItems: MediaItem[]
): Promise<ScheduledPost[]> => {
  const results = await Promise.all(
    mediaItems.map(media => 
      create({
        scheduledDate: date,
        scheduledTime: time,
        platforms: [],
        media: [media],
      })
    )
  );
  return results;
};

export const scheduledPostApiService = {
  getAll,
  getById,
  getByDate,
  getByDateRange,
  create,
  update,
  remove,
  moveToDate,
  createFromFiles,
};
