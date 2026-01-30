import React, { createContext, useContext, useState, useCallback, useEffect } from 'react';
import { apiClient } from '@/lib/api-client';
import { useToast } from '@/hooks/use-toast';
import type {
  Channel,
  ChannelKey,
  ContentItem,
  ContentStatus,
  ContentPillar,
  ContentFormat,
  Priority,
  ChannelVariant,
  PublishTask,
  PublishState,
  PublishLog,
  IntentEvent,
  ContentItemWithVariants,
  PublishTaskWithDetails,
  PublishLogWithDetails,
  MediaAsset,
} from '@/types/content-ops';

// Helper to convert snake_case API responses to camelCase
function toCamelCaseChannel(obj: any): Channel {
  return {
    id: obj.id,
    key: obj.key as ChannelKey,
    name: obj.name,
    enabled: obj.enabled,
    defaultChecklist: obj.default_checklist || [],
    createdAt: new Date(obj.created_at),
  };
}

function toCamelCaseContentItem(obj: any): ContentItem {
  // Handle both camelCase (mediaIds) and snake_case (media_ids) for backward compatibility
  const mediaIds = Array.isArray(obj.mediaIds) 
    ? obj.mediaIds 
    : (Array.isArray(obj.media_ids) ? obj.media_ids : []);
  
  return {
    id: obj.id,
    title: obj.title,
    hook: obj.hook,
    pillar: obj.pillar as ContentPillar | null,
    format: obj.format as ContentFormat | null,
    status: obj.status as ContentStatus,
    priority: obj.priority as Priority,
    owner: obj.owner,
    notes: obj.notes,
    mediaIds: mediaIds,
    createdAt: new Date(obj.created_at || obj.createdAt),
    updatedAt: new Date(obj.updated_at || obj.updatedAt),
  };
}

function toCamelCaseVariant(obj: any): ChannelVariant {
  return {
    id: obj.id,
    contentItemId: obj.content_item_id,
    channelKey: obj.channel_key as ChannelKey,
    caption: obj.caption,
    hashtags: obj.hashtags,
    mediaPrompt: obj.media_prompt,
    mediaAssetId: obj.media_asset_id,
    cta: obj.cta,
    linkUrl: obj.link_url,
    utmCampaign: obj.utm_campaign,
    utmSource: obj.utm_source,
    utmMedium: obj.utm_medium,
    createdAt: new Date(obj.created_at),
    updatedAt: new Date(obj.updated_at),
  };
}

function toCamelCaseTask(obj: any): PublishTask {
  return {
    id: obj.id,
    contentItemId: obj.content_item_id,
    channelKey: obj.channel_key as ChannelKey,
    scheduledFor: obj.scheduled_for ? new Date(obj.scheduled_for) : null,
    state: obj.state as PublishState,
    assignee: obj.assignee,
    checklist: obj.checklist || [],
    createdAt: new Date(obj.created_at),
    updatedAt: new Date(obj.updated_at),
  };
}

function toCamelCaseLog(obj: any): PublishLog {
  return {
    id: obj.id,
    publishTaskId: obj.publish_task_id,
    postedAt: new Date(obj.posted_at),
    postUrl: obj.post_url,
    reach: obj.reach,
    clicks: obj.clicks,
    notes: obj.notes,
  };
}

function toCamelCaseMediaAsset(obj: any): MediaAsset {
  return {
    id: obj.id,
    storageProvider: obj.storage_provider || obj.storageProvider,
    bucket: obj.bucket,
    objectKey: obj.object_key || obj.objectKey,
    publicUrl: obj.public_url || obj.publicUrl,
    mimeType: obj.mime_type || obj.mimeType,
    sizeBytes: obj.size_bytes || obj.sizeBytes,
    sha256: obj.sha256,
    createdAt: new Date(obj.created_at || obj.createdAt),
  };
}

// Helper to convert camelCase to snake_case for API requests
function toSnakeCase<T extends Record<string, any>>(obj: T): any {
  const result: any = {};
  for (const [key, value] of Object.entries(obj)) {
    const snakeKey = key.replace(/[A-Z]/g, letter => `_${letter.toLowerCase()}`);
    result[snakeKey] = value;
  }
  return result;
}

interface ContentOpsState {
  channels: Channel[];
  contentItems: ContentItem[];
  variants: ChannelVariant[];
  tasks: PublishTask[];
  logs: PublishLog[];
  events: IntentEvent[];
  mediaAssets: MediaAsset[];
}

interface ContentOpsContextType {
  // State
  state: ContentOpsState;
  loading: boolean;
  
  // Channel operations
  getChannels: () => Channel[];
  updateChannel: (id: string, updates: Partial<Channel>) => Promise<void>;
  
  // Content item operations
  getContentItems: () => ContentItem[];
  getContentItem: (id: string) => ContentItemWithVariants | null;
  createContentItem: (data: Partial<ContentItem>) => Promise<ContentItem>;
  updateContentItem: (id: string, updates: Partial<ContentItem>) => Promise<void>;
  deleteContentItem: (id: string) => Promise<void>;
  
  // Media asset operations
  deleteMediaAsset: (id: string) => Promise<void>;
  
  // Variant operations
  getVariantsForContent: (contentItemId: string) => ChannelVariant[];
  createVariant: (data: Partial<ChannelVariant>) => Promise<ChannelVariant>;
  updateVariant: (id: string, updates: Partial<ChannelVariant>) => Promise<void>;
  deleteVariant: (id: string) => Promise<void>;
  generateUtms: (variantId: string, contentTitle: string) => Promise<void>;
  
  // Task operations
  getTasks: () => PublishTaskWithDetails[];
  getTasksForContent: (contentItemId: string) => PublishTask[];
  createTask: (data: Partial<PublishTask>) => Promise<PublishTask>;
  createTasksForAllChannels: (contentItemId: string) => Promise<PublishTask[]>;
  updateTask: (id: string, updates: Partial<PublishTask>) => Promise<void>;
  deleteTask: (id: string) => Promise<void>;
  
  // Log operations
  getLogs: () => PublishLogWithDetails[];
  createLog: (data: Partial<PublishLog>) => Promise<PublishLog>;
  
  // Event operations
  getEvents: () => IntentEvent[];
  
  // Refresh operations
  refreshChannels: () => Promise<void>;
  refreshContentItems: () => Promise<void>;
  refreshTasks: () => Promise<void>;
  refreshLogs: () => Promise<void>;
}

const ContentOpsContext = createContext<ContentOpsContextType | null>(null);

export const ContentOpsProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [state, setState] = useState<ContentOpsState>({
    channels: [],
    contentItems: [],
    variants: [],
    tasks: [],
    logs: [],
    events: [],
    mediaAssets: [],
  });
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();

  // Load initial data
  useEffect(() => {
    const loadData = async () => {
      try {
        setLoading(true);
        const [channelsData, itemsData, tasksData, logsData] = await Promise.all([
          apiClient.channels.getAll(),
          apiClient.contentItems.getAll(),
          apiClient.publishTasks.getAll(),
          apiClient.publishLogs.getAll(),
        ]);

        // Get variants for all content items
        const variantsPromises = itemsData.map((item) =>
          apiClient.variants.getByContentItem(item.id)
        );
        const variantsArrays = await Promise.all(variantsPromises);
        const allVariants = variantsArrays.flat();

        setState({
          channels: channelsData.map(toCamelCaseChannel),
          contentItems: itemsData.map(toCamelCaseContentItem),
          variants: allVariants.map(toCamelCaseVariant),
          tasks: tasksData.map(toCamelCaseTask),
          logs: logsData.map(toCamelCaseLog),
          events: [], // Events are write-only, not loaded
        });
      } catch (error) {
        console.error('Failed to load data:', error);
        toast({
          title: 'Error',
          description: error instanceof Error ? error.message : 'Failed to load data',
          variant: 'destructive',
        });
      } finally {
        setLoading(false);
      }
    };
    loadData();
  }, [toast]);

  // Channel operations
  const getChannels = useCallback(() => state.channels, [state.channels]);

  const updateChannel = useCallback(async (id: string, updates: Partial<Channel>) => {
    try {
      const channel = state.channels.find(c => c.id === id);
      if (!channel) throw new Error('Channel not found');

      const apiData = toSnakeCase(updates);
      const updated = await apiClient.channels.update(channel.key, apiData);
      const updatedChannel = toCamelCaseChannel(updated);

      setState(prev => ({
        ...prev,
        channels: prev.channels.map(c => c.id === id ? updatedChannel : c),
      }));
    } catch (error) {
      console.error('Failed to update channel:', error);
      toast({
        title: 'Error',
        description: error instanceof Error ? error.message : 'Failed to update channel',
        variant: 'destructive',
      });
      throw error;
    }
  }, [state.channels, toast]);

  // Content item operations
  const getContentItems = useCallback(() => state.contentItems, [state.contentItems]);

  const getContentItem = useCallback((id: string): ContentItemWithVariants | null => {
    const item = state.contentItems.find(i => i.id === id);
    if (!item) return null;
    
    return {
      ...item,
      variants: state.variants.filter(v => v.contentItemId === id),
      tasks: state.tasks.filter(t => t.contentItemId === id),
    };
  }, [state.contentItems, state.variants, state.tasks]);

  const createContentItem = useCallback(async (data: Partial<ContentItem>): Promise<ContentItem> => {
    try {
      const apiData = toSnakeCase(data);
      const created = await apiClient.contentItems.create(apiData);
      const newItem = toCamelCaseContentItem(created);

      setState(prev => ({
        ...prev,
        contentItems: [...prev.contentItems, newItem],
      }));

      return newItem;
    } catch (error) {
      console.error('Failed to create content item:', error);
      toast({
        title: 'Error',
        description: error instanceof Error ? error.message : 'Failed to create content item',
        variant: 'destructive',
      });
      throw error;
    }
  }, [toast]);

  const updateContentItem = useCallback(async (id: string, updates: Partial<ContentItem>) => {
    try {
      const apiData = toSnakeCase(updates);
      const updated = await apiClient.contentItems.update(id, apiData);
      const updatedItem = toCamelCaseContentItem(updated);

      setState(prev => ({
        ...prev,
        contentItems: prev.contentItems.map(i => i.id === id ? updatedItem : i),
      }));
    } catch (error) {
      console.error('Failed to update content item:', error);
      toast({
        title: 'Error',
        description: error instanceof Error ? error.message : 'Failed to update content item',
        variant: 'destructive',
      });
      throw error;
    }
  }, [toast]);

  const deleteContentItem = useCallback(async (id: string) => {
    // Optimistic update: remove item immediately from UI
    const itemToDelete = state.contentItems.find(i => i.id === id);
    const itemIndex = itemToDelete ? state.contentItems.findIndex(i => i.id === id) : -1;
    
    // Store related data for potential rollback
    const relatedVariants = state.variants.filter(v => v.contentItemId === id);
    const relatedTasks = state.tasks.filter(t => t.contentItemId === id);
    
    // Optimistically remove from state
    setState(prev => ({
      ...prev,
      contentItems: prev.contentItems.filter(i => i.id !== id),
      variants: prev.variants.filter(v => v.contentItemId !== id),
      tasks: prev.tasks.filter(t => t.contentItemId !== id),
    }));
    
    try {
      // Call API - idempotent delete normalizes 200/204/404/alreadyDeleted as success
      await apiClient.contentItems.delete(id);
      // Success: item already removed optimistically, no further action needed
      // Note: API client normalizes 404/alreadyDeleted as success, so no error toast
    } catch (error) {
      // Real error: rollback by restoring the item
      if (itemToDelete && itemIndex >= 0) {
        setState(prev => {
          const newContentItems = [...prev.contentItems];
          newContentItems.splice(itemIndex, 0, itemToDelete);
          
          // Dedupe-safe rollback: only restore variants/tasks not already present
          const existingVariantIds = new Set(prev.variants.map(v => v.id));
          const existingTaskIds = new Set(prev.tasks.map(t => t.id));
          const variantsToRestore = relatedVariants.filter(v => !existingVariantIds.has(v.id));
          const tasksToRestore = relatedTasks.filter(t => !existingTaskIds.has(t.id));
          
          return {
            ...prev,
            contentItems: newContentItems,
            variants: [...prev.variants, ...variantsToRestore],
            tasks: [...prev.tasks, ...tasksToRestore],
          };
        });
      }
      
      console.error('Failed to delete content item:', error);
      toast({
        title: 'Error',
        description: error instanceof Error ? error.message : 'Failed to delete content item',
        variant: 'destructive',
      });
      throw error;
    }
  }, [state.contentItems, state.variants, state.tasks, toast]);

  // Media asset operations
  const deleteMediaAsset = useCallback(async (id: string) => {
    // Optimistic update: remove asset immediately from UI
    const assetToDelete = state.mediaAssets.find(a => a.id === id);
    const assetIndex = assetToDelete ? state.mediaAssets.findIndex(a => a.id === id) : -1;
    
    // Optimistically remove from state
    setState(prev => ({
      ...prev,
      mediaAssets: prev.mediaAssets.filter(a => a.id !== id),
    }));
    
    try {
      // Call API - idempotent delete normalizes 200/204/404/alreadyDeleted as success
      await apiClient.mediaAssets.delete(id);
      // Success: asset already removed optimistically, no further action needed
      // Note: API client normalizes 404/alreadyDeleted as success, so no error toast
    } catch (error) {
      // Real error: rollback by restoring the asset at its original index
      if (assetToDelete && assetIndex >= 0) {
        setState(prev => {
          const newMediaAssets = [...prev.mediaAssets];
          newMediaAssets.splice(assetIndex, 0, assetToDelete);
          return {
            ...prev,
            mediaAssets: newMediaAssets,
          };
        });
      }
      
      console.error('Failed to delete media asset:', error);
      toast({
        title: 'Error',
        description: error instanceof Error ? error.message : 'Failed to delete media asset',
        variant: 'destructive',
      });
      throw error;
    }
  }, [state.mediaAssets, toast]);

  // Variant operations
  const getVariantsForContent = useCallback((contentItemId: string) => 
    state.variants.filter(v => v.contentItemId === contentItemId), 
    [state.variants]
  );

  const createVariant = useCallback(async (data: Partial<ChannelVariant>): Promise<ChannelVariant> => {
    try {
      if (!data.contentItemId || !data.channelKey) {
        throw new Error('contentItemId and channelKey are required');
      }

      const apiData = toSnakeCase({
        channel_key: data.channelKey,
        ...data,
      });
      const created = await apiClient.variants.create(data.contentItemId, apiData);
      const newVariant = toCamelCaseVariant(created);

      setState(prev => ({
        ...prev,
        variants: [...prev.variants, newVariant],
      }));

      return newVariant;
    } catch (error) {
      console.error('Failed to create variant:', error);
      toast({
        title: 'Error',
        description: error instanceof Error ? error.message : 'Failed to create variant',
        variant: 'destructive',
      });
      throw error;
    }
  }, [toast]);

  const updateVariant = useCallback(async (id: string, updates: Partial<ChannelVariant>) => {
    try {
      const variant = state.variants.find(v => v.id === id);
      if (!variant) throw new Error('Variant not found');

      const apiData = toSnakeCase(updates);
      const updated = await apiClient.variants.upsert(variant.contentItemId, variant.channelKey, apiData);
      const updatedVariant = toCamelCaseVariant(updated);

      setState(prev => ({
        ...prev,
        variants: prev.variants.map(v => v.id === id ? updatedVariant : v),
      }));
    } catch (error) {
      console.error('Failed to update variant:', error);
      toast({
        title: 'Error',
        description: error instanceof Error ? error.message : 'Failed to update variant',
        variant: 'destructive',
      });
      throw error;
    }
  }, [state.variants, toast]);

  const deleteVariant = useCallback(async (id: string) => {
    try {
      const variant = state.variants.find(v => v.id === id);
      if (!variant) throw new Error('Variant not found');

      await apiClient.variants.delete(variant.contentItemId, variant.channelKey);
      setState(prev => ({
        ...prev,
        variants: prev.variants.filter(v => v.id !== id),
      }));
    } catch (error) {
      console.error('Failed to delete variant:', error);
      toast({
        title: 'Error',
        description: error instanceof Error ? error.message : 'Failed to delete variant',
        variant: 'destructive',
      });
      throw error;
    }
  }, [state.variants, toast]);

  const generateUtms = useCallback(async (variantId: string, contentTitle: string) => {
    const variant = state.variants.find(v => v.id === variantId);
    if (!variant) return;
    
    const month = new Date().toLocaleString('en', { month: 'short' }).toLowerCase();
    const slug = contentTitle.toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 30);
    
    await updateVariant(variantId, {
      utmCampaign: `${slug}-${month}`,
      utmSource: variant.channelKey,
      utmMedium: 'social',
    });
  }, [state.variants, updateVariant]);

  // Task operations
  const getTasks = useCallback((): PublishTaskWithDetails[] => {
    return state.tasks.map(task => ({
      ...task,
      contentItem: state.contentItems.find(i => i.id === task.contentItemId)!,
      variant: state.variants.find(v => v.contentItemId === task.contentItemId && v.channelKey === task.channelKey) || null,
      log: state.logs.find(l => l.publishTaskId === task.id) || null,
    })).filter(t => t.contentItem);
  }, [state.tasks, state.contentItems, state.variants, state.logs]);

  const getTasksForContent = useCallback((contentItemId: string) => 
    state.tasks.filter(t => t.contentItemId === contentItemId),
    [state.tasks]
  );

  const createTask = useCallback(async (data: Partial<PublishTask>): Promise<PublishTask> => {
    try {
      if (!data.contentItemId || !data.channelKey) {
        throw new Error('contentItemId and channelKey are required');
      }

      const apiData = toSnakeCase(data);
      const created = await apiClient.publishTasks.create(apiData);
      const newTask = toCamelCaseTask(created);

      setState(prev => ({
        ...prev,
        tasks: [...prev.tasks, newTask],
      }));

      return newTask;
    } catch (error) {
      console.error('Failed to create task:', error);
      toast({
        title: 'Error',
        description: error instanceof Error ? error.message : 'Failed to create task',
        variant: 'destructive',
      });
      throw error;
    }
  }, [toast]);

  const createTasksForAllChannels = useCallback(async (contentItemId: string): Promise<PublishTask[]> => {
    try {
      const result = await apiClient.publishTasks.bulkCreate(contentItemId);
      const newTasks = (result.tasks || []).map(toCamelCaseTask);

      setState(prev => ({
        ...prev,
        tasks: [...prev.tasks, ...newTasks],
      }));

      return newTasks;
    } catch (error) {
      console.error('Failed to create tasks:', error);
      toast({
        title: 'Error',
        description: error instanceof Error ? error.message : 'Failed to create tasks',
        variant: 'destructive',
      });
      throw error;
    }
  }, [toast]);

  const updateTask = useCallback(async (id: string, updates: Partial<PublishTask>) => {
    try {
      const apiData = toSnakeCase(updates);
      const updated = await apiClient.publishTasks.update(id, apiData);
      const updatedTask = toCamelCaseTask(updated);

      setState(prev => ({
        ...prev,
        tasks: prev.tasks.map(t => t.id === id ? updatedTask : t),
      }));
    } catch (error) {
      console.error('Failed to update task:', error);
      toast({
        title: 'Error',
        description: error instanceof Error ? error.message : 'Failed to update task',
        variant: 'destructive',
      });
      throw error;
    }
  }, [toast]);

  const deleteTask = useCallback(async (id: string) => {
    try {
      await apiClient.publishTasks.delete(id);
      setState(prev => ({
        ...prev,
        tasks: prev.tasks.filter(t => t.id !== id),
        logs: prev.logs.filter(l => l.publishTaskId !== id),
      }));
    } catch (error) {
      console.error('Failed to delete task:', error);
      toast({
        title: 'Error',
        description: error instanceof Error ? error.message : 'Failed to delete task',
        variant: 'destructive',
      });
      throw error;
    }
  }, [toast]);

  // Log operations
  const getLogs = useCallback((): PublishLogWithDetails[] => {
    return state.logs.map(log => {
      const task = state.tasks.find(t => t.id === log.publishTaskId);
      const contentItem = task ? state.contentItems.find(i => i.id === task.contentItemId) : null;
      
      return {
        ...log,
        task: task!,
        contentItem: contentItem!,
      };
    }).filter(l => l.task && l.contentItem);
  }, [state.logs, state.tasks, state.contentItems]);

  const createLog = useCallback(async (data: Partial<PublishLog>): Promise<PublishLog> => {
    try {
      if (!data.publishTaskId) {
        throw new Error('publishTaskId is required');
      }

      // Use log-publish endpoint which handles task state update and intent event
      const apiData = toSnakeCase({
        posted_at: data.postedAt?.toISOString(),
        post_url: data.postUrl,
        reach: data.reach,
        clicks: data.clicks,
        notes: data.notes,
      });
      const result = await apiClient.publishTasks.logPublish(data.publishTaskId, apiData);
      const newLog = toCamelCaseLog(result.log);

      // Update task state to posted
      setState(prev => ({
        ...prev,
        logs: [...prev.logs, newLog],
        tasks: prev.tasks.map(t => 
          t.id === data.publishTaskId ? { ...t, state: 'posted' as PublishState } : t
        ),
      }));

      return newLog;
    } catch (error) {
      console.error('Failed to create log:', error);
      toast({
        title: 'Error',
        description: error instanceof Error ? error.message : 'Failed to create log',
        variant: 'destructive',
      });
      throw error;
    }
  }, [toast]);

  // Event operations
  const getEvents = useCallback(() => state.events, [state.events]);

  // Refresh operations
  const refreshChannels = useCallback(async () => {
    try {
      const channelsData = await apiClient.channels.getAll();
      setState(prev => ({ ...prev, channels: channelsData.map(toCamelCaseChannel) }));
    } catch (error) {
      console.error('Failed to refresh channels:', error);
    }
  }, []);

  const refreshContentItems = useCallback(async () => {
    try {
      const itemsData = await apiClient.contentItems.getAll();
      const variantsPromises = itemsData.map((item) =>
        apiClient.variants.getByContentItem(item.id)
      );
      const variantsArrays = await Promise.all(variantsPromises);
      const allVariants = variantsArrays.flat();

      setState(prev => ({
        ...prev,
        contentItems: itemsData.map(toCamelCaseContentItem),
        variants: allVariants.map(toCamelCaseVariant),
      }));
    } catch (error) {
      console.error('Failed to refresh content items:', error);
    }
  }, []);

  const refreshTasks = useCallback(async () => {
    try {
      const tasksData = await apiClient.publishTasks.getAll();
      setState(prev => ({ ...prev, tasks: tasksData.map(toCamelCaseTask) }));
    } catch (error) {
      console.error('Failed to refresh tasks:', error);
    }
  }, []);

  const refreshLogs = useCallback(async () => {
    try {
      const logsData = await apiClient.publishLogs.getAll();
      setState(prev => ({ ...prev, logs: logsData.map(toCamelCaseLog) }));
    } catch (error) {
      console.error('Failed to refresh logs:', error);
    }
  }, []);

  const value: ContentOpsContextType = {
    state,
    loading,
    getChannels,
    updateChannel,
    getContentItems,
    getContentItem,
    createContentItem,
    updateContentItem,
    deleteContentItem,
    deleteMediaAsset,
    getVariantsForContent,
    createVariant,
    updateVariant,
    deleteVariant,
    generateUtms,
    getTasks,
    getTasksForContent,
    createTask,
    createTasksForAllChannels,
    updateTask,
    deleteTask,
    getLogs,
    createLog,
    getEvents,
    refreshChannels,
    refreshContentItems,
    refreshTasks,
    refreshLogs,
  };

  return (
    <ContentOpsContext.Provider value={value}>
      {children}
    </ContentOpsContext.Provider>
  );
};

export const useContentOps = () => {
  const context = useContext(ContentOpsContext);
  if (!context) {
    throw new Error('useContentOps must be used within a ContentOpsProvider');
  }
  return context;
};
