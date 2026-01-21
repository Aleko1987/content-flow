// Scheduled Post Service - Repository pattern for storage abstraction
import type { ScheduledPost, ScheduledPostInput, MediaItem } from '@/types/scheduled-post';

const STORAGE_KEY = 'scheduled_posts';

// Generate UUID
const generateId = (): string => {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
};

// Combine date and time to ISO string
const combineDateTime = (date: string, time: string): string => {
  return new Date(`${date}T${time}:00`).toISOString();
};

// Get all posts from localStorage
const getAll = (): ScheduledPost[] => {
  try {
    const data = localStorage.getItem(STORAGE_KEY);
    return data ? JSON.parse(data) : [];
  } catch (error) {
    console.error('Failed to load scheduled posts:', error);
    return [];
  }
};

// Save all posts to localStorage
const saveAll = (posts: ScheduledPost[]): void => {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(posts));
  } catch (error) {
    console.error('Failed to save scheduled posts:', error);
    throw new Error('Failed to save data');
  }
};

// Get post by ID
const getById = (id: string): ScheduledPost | null => {
  const posts = getAll();
  return posts.find(p => p.id === id) || null;
};

// Get posts for a specific date
const getByDate = (date: string): ScheduledPost[] => {
  const posts = getAll();
  return posts.filter(p => p.scheduledDate === date);
};

// Get posts for a date range
const getByDateRange = (startDate: string, endDate: string): ScheduledPost[] => {
  const posts = getAll();
  return posts.filter(p => p.scheduledDate >= startDate && p.scheduledDate <= endDate);
};

// Create a new post
const create = (input: ScheduledPostInput): ScheduledPost => {
  const posts = getAll();
  const now = new Date().toISOString();
  
  const newPost: ScheduledPost = {
    id: generateId(),
    title: input.title || null,
    caption: input.caption || null,
    scheduledDate: input.scheduledDate,
    scheduledTime: input.scheduledTime,
    scheduledAt: combineDateTime(input.scheduledDate, input.scheduledTime),
    platforms: input.platforms,
    status: 'planned',
    media: input.media,
    contentItemId: input.contentItemId,
    createdAt: now,
    updatedAt: now,
  };
  
  posts.push(newPost);
  saveAll(posts);
  return newPost;
};

// Update an existing post
const update = (id: string, input: Partial<ScheduledPostInput>): ScheduledPost => {
  const posts = getAll();
  const index = posts.findIndex(p => p.id === id);
  
  if (index === -1) {
    throw new Error('Post not found');
  }
  
  const existingPost = posts[index];
  const updatedPost: ScheduledPost = {
    ...existingPost,
    ...input,
    scheduledAt: input.scheduledDate && input.scheduledTime 
      ? combineDateTime(input.scheduledDate, input.scheduledTime)
      : input.scheduledDate 
        ? combineDateTime(input.scheduledDate, existingPost.scheduledTime)
        : input.scheduledTime
          ? combineDateTime(existingPost.scheduledDate, input.scheduledTime)
          : existingPost.scheduledAt,
    updatedAt: new Date().toISOString(),
  };
  
  posts[index] = updatedPost;
  saveAll(posts);
  return updatedPost;
};

// Delete a post
const remove = (id: string): void => {
  const posts = getAll();
  const filtered = posts.filter(p => p.id !== id);
  saveAll(filtered);
};

// Move post to a new date (for drag and drop)
const moveToDate = (id: string, newDate: string, newTime?: string): ScheduledPost => {
  const posts = getAll();
  const index = posts.findIndex(p => p.id === id);
  
  if (index === -1) {
    throw new Error('Post not found');
  }
  
  const existingPost = posts[index];
  const time = newTime || existingPost.scheduledTime;
  
  const updatedPost: ScheduledPost = {
    ...existingPost,
    scheduledDate: newDate,
    scheduledTime: time,
    scheduledAt: combineDateTime(newDate, time),
    updatedAt: new Date().toISOString(),
  };
  
  posts[index] = updatedPost;
  saveAll(posts);
  return updatedPost;
};

// Create multiple posts from dropped files
const createFromFiles = (
  date: string, 
  time: string, 
  mediaItems: MediaItem[]
): ScheduledPost[] => {
  return mediaItems.map(media => 
    create({
      scheduledDate: date,
      scheduledTime: time,
      platforms: [],
      media: [media],
    })
  );
};

export const scheduledPostService = {
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
