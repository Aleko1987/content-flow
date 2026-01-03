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
  return response.json();
}

export const apiClient = {
  // Channels
  channels: {
    getAll: () => fetch(`${API_BASE_URL}/channels`).then(handleResponse),
    getByKey: (key: string) => fetch(`${API_BASE_URL}/channels/${key}`).then(handleResponse),
    create: (data: unknown) =>
      fetch(`${API_BASE_URL}/channels`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      }).then(handleResponse),
    update: (key: string, data: unknown) =>
      fetch(`${API_BASE_URL}/channels/${key}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      }).then(handleResponse),
    delete: (key: string) =>
      fetch(`${API_BASE_URL}/channels/${key}`, {
        method: 'DELETE',
      }).then(() => undefined),
  },

  // Content Items
  contentItems: {
    getAll: (params?: Record<string, string | string[]>) => {
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
      return fetch(`${API_BASE_URL}/content-items${query ? `?${query}` : ''}`).then(handleResponse);
    },
    getById: (id: string) => fetch(`${API_BASE_URL}/content-items/${id}`).then(handleResponse),
    create: (data: unknown) =>
      fetch(`${API_BASE_URL}/content-items`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      }).then(handleResponse),
    update: (id: string, data: unknown) =>
      fetch(`${API_BASE_URL}/content-items/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      }).then(handleResponse),
    delete: (id: string) =>
      fetch(`${API_BASE_URL}/content-items/${id}`, {
        method: 'DELETE',
      }).then(() => undefined),
  },

  // Variants
  variants: {
    getByContentItem: (contentItemId: string) =>
      fetch(`${API_BASE_URL}/content-items/${contentItemId}/variants`).then(handleResponse),
    upsert: (contentItemId: string, channelKey: string, data: unknown) =>
      fetch(`${API_BASE_URL}/content-items/${contentItemId}/variants/${channelKey}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      }).then(handleResponse),
    create: (contentItemId: string, data: unknown) =>
      fetch(`${API_BASE_URL}/content-items/${contentItemId}/variants`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      }).then(handleResponse),
    delete: (contentItemId: string, channelKey: string) =>
      fetch(`${API_BASE_URL}/content-items/${contentItemId}/variants/${channelKey}`, {
        method: 'DELETE',
      }).then(() => undefined),
  },

  // Publish Tasks
  publishTasks: {
    getAll: (params?: Record<string, string | string[]>) => {
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
      return fetch(`${API_BASE_URL}/publish-tasks${query ? `?${query}` : ''}`).then(handleResponse);
    },
    create: (data: unknown) =>
      fetch(`${API_BASE_URL}/publish-tasks`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      }).then(handleResponse),
    bulkCreate: (contentItemId: string) =>
      fetch(`${API_BASE_URL}/publish-tasks/bulk-create`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content_item_id: contentItemId }),
      }).then(handleResponse),
    update: (id: string, data: unknown) =>
      fetch(`${API_BASE_URL}/publish-tasks/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      }).then(handleResponse),
    logPublish: (id: string, data: unknown) =>
      fetch(`${API_BASE_URL}/publish-tasks/${id}/log-publish`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      }).then(handleResponse),
    delete: (id: string) =>
      fetch(`${API_BASE_URL}/publish-tasks/${id}`, {
        method: 'DELETE',
      }).then(() => undefined),
  },

  // Publish Logs
  publishLogs: {
    getAll: (params?: Record<string, string>) => {
      const searchParams = new URLSearchParams();
      if (params) {
        Object.entries(params).forEach(([key, value]) => {
          if (value) searchParams.append(key, value);
        });
      }
      const query = searchParams.toString();
      return fetch(`${API_BASE_URL}/publish-logs${query ? `?${query}` : ''}`).then(handleResponse);
    },
    getById: (id: string) => fetch(`${API_BASE_URL}/publish-logs/${id}`).then(handleResponse),
    create: (data: unknown) =>
      fetch(`${API_BASE_URL}/publish-logs`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      }).then(handleResponse),
    update: (id: string, data: unknown) =>
      fetch(`${API_BASE_URL}/publish-logs/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      }).then(handleResponse),
    delete: (id: string) =>
      fetch(`${API_BASE_URL}/publish-logs/${id}`, {
        method: 'DELETE',
      }).then(() => undefined),
  },
};

