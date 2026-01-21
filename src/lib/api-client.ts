// API Client for Content Ops Backend
const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001/api/content-ops';

export interface ApiError {
  error: string;
  details?: unknown;
}

async function handleResponse<T>(response: Response): Promise<T> {
  if (!response.ok) {
    const error: ApiError = await response.json().catch(() => ({
      error: `HTTP ${response.status}: ${response.statusText}`,
    }));
    throw new Error(error.error || `HTTP ${response.status}`);
  }
  return response.json() as Promise<T>;
}

// API response types (snake_case from server)
export interface ApiChannel {
  id: string;
  key: string;
  name: string;
  enabled: boolean;
  default_checklist: string[];
  created_at: string;
}

export interface ApiContentItem {
  id: string;
  title: string;
  hook: string | null;
  pillar: string | null;
  format: string | null;
  status: string;
  priority: number;
  owner: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface ApiChannelVariant {
  id: string;
  content_item_id: string;
  channel_key: string;
  caption: string | null;
  hashtags: string | null;
  media_prompt: string | null;
  media_asset_id: string | null;
  cta: string | null;
  link_url: string | null;
  utm_campaign: string | null;
  utm_source: string | null;
  utm_medium: string | null;
  created_at: string;
  updated_at: string;
}

export interface ApiPublishTask {
  id: string;
  content_item_id: string;
  channel_key: string;
  scheduled_for: string | null;
  state: string;
  assignee: string | null;
  checklist: string[];
  created_at: string;
  updated_at: string;
}

export interface ApiPublishLog {
  id: string;
  publish_task_id: string;
  posted_at: string;
  post_url: string | null;
  reach: number | null;
  clicks: number | null;
  notes: string | null;
}

export interface ApiBulkCreateResponse {
  tasks: ApiPublishTask[];
}

export interface ApiLogPublishResponse {
  log: ApiPublishLog;
  task: ApiPublishTask;
}

export const apiClient = {
  // Channels
  channels: {
    getAll: (): Promise<ApiChannel[]> => 
      fetch(`${API_BASE_URL}/channels`).then(r => handleResponse<ApiChannel[]>(r)),
    getByKey: (key: string): Promise<ApiChannel> => 
      fetch(`${API_BASE_URL}/channels/${key}`).then(r => handleResponse<ApiChannel>(r)),
    create: (data: unknown): Promise<ApiChannel> =>
      fetch(`${API_BASE_URL}/channels`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      }).then(r => handleResponse<ApiChannel>(r)),
    update: (key: string, data: unknown): Promise<ApiChannel> =>
      fetch(`${API_BASE_URL}/channels/${key}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      }).then(r => handleResponse<ApiChannel>(r)),
    delete: (key: string): Promise<void> =>
      fetch(`${API_BASE_URL}/channels/${key}`, {
        method: 'DELETE',
      }).then(() => undefined),
  },

  // Content Items
  contentItems: {
    getAll: (params?: Record<string, string | string[]>): Promise<ApiContentItem[]> => {
      const searchParams = new URLSearchParams();
      if (params) {
        Object.entries(params).forEach(([key, value]) => {
          if (Array.isArray(value)) {
            value.forEach(v => searchParams.append(key, v));
          } else if (value) {
            searchParams.append(key, value);
          }
        });
      }
      const query = searchParams.toString();
      return fetch(`${API_BASE_URL}/content-items${query ? `?${query}` : ''}`).then(r => handleResponse<ApiContentItem[]>(r));
    },
    getById: (id: string): Promise<ApiContentItem> => 
      fetch(`${API_BASE_URL}/content-items/${id}`).then(r => handleResponse<ApiContentItem>(r)),
    create: (data: unknown): Promise<ApiContentItem> =>
      fetch(`${API_BASE_URL}/content-items`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      }).then(r => handleResponse<ApiContentItem>(r)),
    update: (id: string, data: unknown): Promise<ApiContentItem> =>
      fetch(`${API_BASE_URL}/content-items/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      }).then(r => handleResponse<ApiContentItem>(r)),
    delete: (id: string): Promise<void> =>
      fetch(`${API_BASE_URL}/content-items/${id}`, {
        method: 'DELETE',
      }).then(() => undefined),
  },

  // Variants
  variants: {
    getByContentItem: (contentItemId: string): Promise<ApiChannelVariant[]> =>
      fetch(`${API_BASE_URL}/content-items/${contentItemId}/variants`).then(r => handleResponse<ApiChannelVariant[]>(r)),
    upsert: (contentItemId: string, channelKey: string, data: unknown): Promise<ApiChannelVariant> =>
      fetch(`${API_BASE_URL}/content-items/${contentItemId}/variants/${channelKey}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      }).then(r => handleResponse<ApiChannelVariant>(r)),
    create: (contentItemId: string, data: unknown): Promise<ApiChannelVariant> =>
      fetch(`${API_BASE_URL}/content-items/${contentItemId}/variants`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      }).then(r => handleResponse<ApiChannelVariant>(r)),
    delete: (contentItemId: string, channelKey: string): Promise<void> =>
      fetch(`${API_BASE_URL}/content-items/${contentItemId}/variants/${channelKey}`, {
        method: 'DELETE',
      }).then(() => undefined),
  },

  // Publish Tasks
  publishTasks: {
    getAll: (params?: Record<string, string | string[]>): Promise<ApiPublishTask[]> => {
      const searchParams = new URLSearchParams();
      if (params) {
        Object.entries(params).forEach(([key, value]) => {
          if (Array.isArray(value)) {
            value.forEach(v => searchParams.append(key, v));
          } else if (value) {
            searchParams.append(key, value);
          }
        });
      }
      const query = searchParams.toString();
      return fetch(`${API_BASE_URL}/publish-tasks${query ? `?${query}` : ''}`).then(r => handleResponse<ApiPublishTask[]>(r));
    },
    create: (data: unknown): Promise<ApiPublishTask> =>
      fetch(`${API_BASE_URL}/publish-tasks`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      }).then(r => handleResponse<ApiPublishTask>(r)),
    bulkCreate: (contentItemId: string): Promise<ApiBulkCreateResponse> =>
      fetch(`${API_BASE_URL}/publish-tasks/bulk-create`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content_item_id: contentItemId }),
      }).then(r => handleResponse<ApiBulkCreateResponse>(r)),
    update: (id: string, data: unknown): Promise<ApiPublishTask> =>
      fetch(`${API_BASE_URL}/publish-tasks/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      }).then(r => handleResponse<ApiPublishTask>(r)),
    logPublish: (id: string, data: unknown): Promise<ApiLogPublishResponse> =>
      fetch(`${API_BASE_URL}/publish-tasks/${id}/log-publish`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      }).then(r => handleResponse<ApiLogPublishResponse>(r)),
    delete: (id: string): Promise<void> =>
      fetch(`${API_BASE_URL}/publish-tasks/${id}`, {
        method: 'DELETE',
      }).then(() => undefined),
  },

  // Publish Logs
  publishLogs: {
    getAll: (params?: Record<string, string>): Promise<ApiPublishLog[]> => {
      const searchParams = new URLSearchParams();
      if (params) {
        Object.entries(params).forEach(([key, value]) => {
          if (value) searchParams.append(key, value);
        });
      }
      const query = searchParams.toString();
      return fetch(`${API_BASE_URL}/publish-logs${query ? `?${query}` : ''}`).then(r => handleResponse<ApiPublishLog[]>(r));
    },
    getById: (id: string): Promise<ApiPublishLog> => 
      fetch(`${API_BASE_URL}/publish-logs/${id}`).then(r => handleResponse<ApiPublishLog>(r)),
    create: (data: unknown): Promise<ApiPublishLog> =>
      fetch(`${API_BASE_URL}/publish-logs`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      }).then(r => handleResponse<ApiPublishLog>(r)),
    update: (id: string, data: unknown): Promise<ApiPublishLog> =>
      fetch(`${API_BASE_URL}/publish-logs/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      }).then(r => handleResponse<ApiPublishLog>(r)),
    delete: (id: string): Promise<void> =>
      fetch(`${API_BASE_URL}/publish-logs/${id}`, {
        method: 'DELETE',
      }).then(() => undefined),
  },

  // Media Assets
  mediaAssets: {
    presign: (data: unknown) =>
      fetch(`${API_BASE_URL}/media-assets/presign`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      }).then(r => handleResponse<unknown>(r)),
    complete: (data: unknown) =>
      fetch(`${API_BASE_URL}/media-assets/complete`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      }).then(r => handleResponse<unknown>(r)),
    getAll: (params?: Record<string, string>) => {
      const searchParams = new URLSearchParams();
      if (params) {
        Object.entries(params).forEach(([key, value]) => {
          if (value) searchParams.append(key, value);
        });
      }
      const query = searchParams.toString();
      return fetch(`${API_BASE_URL}/media-assets${query ? `?${query}` : ''}`).then(r => handleResponse<unknown>(r));
    },
    delete: (id: string): Promise<void> =>
      fetch(`${API_BASE_URL}/media-assets/${id}`, {
        method: 'DELETE',
      }).then(() => undefined),
  },
};
