import React, { createContext, useContext, useState, useCallback, useEffect } from 'react';
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
} from '@/types/content-ops';
import { initializeDemoData, defaultChannels } from '@/data/demo-data';

// Generate UUID
const generateId = (): string => {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
};

interface ContentOpsState {
  channels: Channel[];
  contentItems: ContentItem[];
  variants: ChannelVariant[];
  tasks: PublishTask[];
  logs: PublishLog[];
  events: IntentEvent[];
}

interface ContentOpsContextType {
  // State
  state: ContentOpsState;
  
  // Channel operations
  getChannels: () => Channel[];
  updateChannel: (id: string, updates: Partial<Channel>) => void;
  
  // Content item operations
  getContentItems: () => ContentItem[];
  getContentItem: (id: string) => ContentItemWithVariants | null;
  createContentItem: (data: Partial<ContentItem>) => ContentItem;
  updateContentItem: (id: string, updates: Partial<ContentItem>) => void;
  deleteContentItem: (id: string) => void;
  
  // Variant operations
  getVariantsForContent: (contentItemId: string) => ChannelVariant[];
  createVariant: (data: Partial<ChannelVariant>) => ChannelVariant;
  updateVariant: (id: string, updates: Partial<ChannelVariant>) => void;
  deleteVariant: (id: string) => void;
  generateUtms: (variantId: string, contentTitle: string) => void;
  
  // Task operations
  getTasks: () => PublishTaskWithDetails[];
  getTasksForContent: (contentItemId: string) => PublishTask[];
  createTask: (data: Partial<PublishTask>) => PublishTask;
  createTasksForAllChannels: (contentItemId: string) => PublishTask[];
  updateTask: (id: string, updates: Partial<PublishTask>) => void;
  deleteTask: (id: string) => void;
  
  // Log operations
  getLogs: () => PublishLogWithDetails[];
  createLog: (data: Partial<PublishLog>) => PublishLog;
  
  // Event operations
  getEvents: () => IntentEvent[];
}

const ContentOpsContext = createContext<ContentOpsContextType | null>(null);

export const ContentOpsProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [state, setState] = useState<ContentOpsState>(() => initializeDemoData());
  
  // Channel operations
  const getChannels = useCallback(() => state.channels, [state.channels]);
  
  const updateChannel = useCallback((id: string, updates: Partial<Channel>) => {
    setState(prev => ({
      ...prev,
      channels: prev.channels.map(c => c.id === id ? { ...c, ...updates } : c),
    }));
  }, []);
  
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
  
  const createContentItem = useCallback((data: Partial<ContentItem>): ContentItem => {
    const newItem: ContentItem = {
      id: generateId(),
      title: data.title || 'Untitled',
      hook: data.hook || null,
      pillar: data.pillar || null,
      format: data.format || null,
      status: data.status || 'draft',
      priority: data.priority || 2,
      owner: data.owner || null,
      notes: data.notes || null,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    
    setState(prev => ({
      ...prev,
      contentItems: [...prev.contentItems, newItem],
    }));
    
    return newItem;
  }, []);
  
  const updateContentItem = useCallback((id: string, updates: Partial<ContentItem>) => {
    setState(prev => ({
      ...prev,
      contentItems: prev.contentItems.map(i => 
        i.id === id ? { ...i, ...updates, updatedAt: new Date() } : i
      ),
    }));
  }, []);
  
  const deleteContentItem = useCallback((id: string) => {
    setState(prev => ({
      ...prev,
      contentItems: prev.contentItems.filter(i => i.id !== id),
      variants: prev.variants.filter(v => v.contentItemId !== id),
      tasks: prev.tasks.filter(t => t.contentItemId !== id),
    }));
  }, []);
  
  // Variant operations
  const getVariantsForContent = useCallback((contentItemId: string) => 
    state.variants.filter(v => v.contentItemId === contentItemId), 
    [state.variants]
  );
  
  const createVariant = useCallback((data: Partial<ChannelVariant>): ChannelVariant => {
    const newVariant: ChannelVariant = {
      id: generateId(),
      contentItemId: data.contentItemId!,
      channelKey: data.channelKey!,
      caption: data.caption || null,
      hashtags: data.hashtags || null,
      mediaPrompt: data.mediaPrompt || null,
      cta: data.cta || null,
      linkUrl: data.linkUrl || null,
      utmCampaign: data.utmCampaign || null,
      utmSource: data.utmSource || null,
      utmMedium: data.utmMedium || null,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    
    setState(prev => ({
      ...prev,
      variants: [...prev.variants, newVariant],
    }));
    
    return newVariant;
  }, []);
  
  const updateVariant = useCallback((id: string, updates: Partial<ChannelVariant>) => {
    setState(prev => ({
      ...prev,
      variants: prev.variants.map(v => 
        v.id === id ? { ...v, ...updates, updatedAt: new Date() } : v
      ),
    }));
  }, []);
  
  const deleteVariant = useCallback((id: string) => {
    setState(prev => ({
      ...prev,
      variants: prev.variants.filter(v => v.id !== id),
    }));
  }, []);
  
  const generateUtms = useCallback((variantId: string, contentTitle: string) => {
    const variant = state.variants.find(v => v.id === variantId);
    if (!variant) return;
    
    const month = new Date().toLocaleString('en', { month: 'short' }).toLowerCase();
    const slug = contentTitle.toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 30);
    
    updateVariant(variantId, {
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
  
  const createTask = useCallback((data: Partial<PublishTask>): PublishTask => {
    const channel = state.channels.find(c => c.key === data.channelKey);
    
    const newTask: PublishTask = {
      id: generateId(),
      contentItemId: data.contentItemId!,
      channelKey: data.channelKey!,
      scheduledFor: data.scheduledFor || null,
      state: data.state || 'todo',
      assignee: data.assignee || null,
      checklist: data.checklist || channel?.defaultChecklist || [],
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    
    setState(prev => ({
      ...prev,
      tasks: [...prev.tasks, newTask],
    }));
    
    return newTask;
  }, [state.channels]);
  
  const createTasksForAllChannels = useCallback((contentItemId: string): PublishTask[] => {
    const enabledChannels = state.channels.filter(c => c.enabled);
    const existingTaskChannels = state.tasks
      .filter(t => t.contentItemId === contentItemId)
      .map(t => t.channelKey);
    
    const newTasks: PublishTask[] = [];
    
    enabledChannels.forEach(channel => {
      if (!existingTaskChannels.includes(channel.key)) {
        const task = createTask({
          contentItemId,
          channelKey: channel.key,
          checklist: channel.defaultChecklist,
        });
        newTasks.push(task);
      }
    });
    
    return newTasks;
  }, [state.channels, state.tasks, createTask]);
  
  const updateTask = useCallback((id: string, updates: Partial<PublishTask>) => {
    setState(prev => ({
      ...prev,
      tasks: prev.tasks.map(t => 
        t.id === id ? { ...t, ...updates, updatedAt: new Date() } : t
      ),
    }));
  }, []);
  
  const deleteTask = useCallback((id: string) => {
    setState(prev => ({
      ...prev,
      tasks: prev.tasks.filter(t => t.id !== id),
      logs: prev.logs.filter(l => l.publishTaskId !== id),
    }));
  }, []);
  
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
  
  const createLog = useCallback((data: Partial<PublishLog>): PublishLog => {
    const task = state.tasks.find(t => t.id === data.publishTaskId);
    
    const newLog: PublishLog = {
      id: generateId(),
      publishTaskId: data.publishTaskId!,
      postedAt: data.postedAt || new Date(),
      postUrl: data.postUrl || null,
      reach: data.reach || null,
      clicks: data.clicks || null,
      notes: data.notes || null,
    };
    
    // Create intent event
    const newEvent: IntentEvent = {
      id: generateId(),
      eventType: 'post_published',
      source: 'content_ops',
      channelKey: task?.channelKey || null,
      contentItemId: task?.contentItemId || null,
      payload: {
        postUrl: newLog.postUrl,
        scheduledFor: task?.scheduledFor?.toISOString(),
      },
      createdAt: new Date(),
    };
    
    // Update task state to posted
    setState(prev => ({
      ...prev,
      logs: [...prev.logs, newLog],
      events: [...prev.events, newEvent],
      tasks: prev.tasks.map(t => 
        t.id === data.publishTaskId ? { ...t, state: 'posted' as PublishState, updatedAt: new Date() } : t
      ),
    }));
    
    return newLog;
  }, [state.tasks]);
  
  // Event operations
  const getEvents = useCallback(() => state.events, [state.events]);
  
  const value: ContentOpsContextType = {
    state,
    getChannels,
    updateChannel,
    getContentItems,
    getContentItem,
    createContentItem,
    updateContentItem,
    deleteContentItem,
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
