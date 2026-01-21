// Demo data for Marketing Content Ops
import type {
  Channel,
  ChannelKey,
  ContentItem,
  ChannelVariant,
  PublishTask,
  PublishLog,
  IntentEvent,
} from '@/types/content-ops';

// Generate UUID without external dependency
const generateId = (): string => {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
};

// Default channels
export const defaultChannels: Channel[] = [
  { id: generateId(), key: 'x', name: 'X (Twitter)', enabled: true, defaultChecklist: ['Check character limit', 'Add relevant hashtags', 'Include call to action'], createdAt: new Date() },
  { id: generateId(), key: 'instagram', name: 'Instagram', enabled: true, defaultChecklist: ['Optimize image dimensions', 'Write engaging caption', 'Add location tag'], createdAt: new Date() },
  { id: generateId(), key: 'facebook', name: 'Facebook', enabled: true, defaultChecklist: ['Add preview image', 'Check link preview', 'Schedule optimal time'], createdAt: new Date() },
  { id: generateId(), key: 'linkedin', name: 'LinkedIn', enabled: true, defaultChecklist: ['Professional tone check', 'Add relevant hashtags', 'Tag relevant people'], createdAt: new Date() },
  { id: generateId(), key: 'youtube', name: 'YouTube', enabled: true, defaultChecklist: ['Upload thumbnail', 'Write description', 'Add tags'], createdAt: new Date() },
  { id: generateId(), key: 'website_blog', name: 'Website Blog', enabled: true, defaultChecklist: ['SEO meta tags', 'Internal links', 'Featured image'], createdAt: new Date() },
];

// Demo content items
const demoContentItems: ContentItem[] = [
  {
    id: generateId(),
    title: 'Product Launch Announcement',
    hook: 'Introducing the future of content management',
    pillar: 'product',
    format: 'post',
    status: 'ready',
    priority: 1,
    owner: 'Marketing Team',
    notes: 'Coordinate with PR for timing',
    createdAt: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000),
    updatedAt: new Date(),
  },
  {
    id: generateId(),
    title: '5 Tips for Better Social Media Engagement',
    hook: 'Stop making these common mistakes',
    pillar: 'educational',
    format: 'carousel',
    status: 'draft',
    priority: 2,
    owner: 'Content Lead',
    notes: null,
    createdAt: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000),
    updatedAt: new Date(),
  },
  {
    id: generateId(),
    title: 'Customer Success Story: 10x Growth',
    hook: 'How Company X achieved incredible results',
    pillar: 'proof',
    format: 'article',
    status: 'scheduled',
    priority: 2,
    owner: 'Marketing Team',
    notes: 'Waiting for customer approval on quotes',
    createdAt: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000),
    updatedAt: new Date(),
  },
  {
    id: generateId(),
    title: 'Monday Motivation Meme',
    hook: 'When your content calendar is finally organized',
    pillar: 'meme',
    format: 'post',
    status: 'posted',
    priority: 3,
    owner: 'Social Media Manager',
    notes: null,
    createdAt: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000),
    updatedAt: new Date(),
  },
  {
    id: generateId(),
    title: 'Holiday Special Offer',
    hook: '50% off for the next 48 hours',
    pillar: 'offer',
    format: 'ad',
    status: 'draft',
    priority: 1,
    owner: 'Marketing Team',
    notes: 'Need approval from finance',
    createdAt: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000),
    updatedAt: new Date(),
  },
];

// Generate demo variants for content items
const generateDemoVariants = (contentItems: ContentItem[], channels: Channel[]): ChannelVariant[] => {
  const variants: ChannelVariant[] = [];
  
  contentItems.forEach((item) => {
    const enabledChannels = channels.filter(c => c.enabled);
    const numVariants = Math.min(3, enabledChannels.length);
    const selectedChannels = enabledChannels.slice(0, numVariants);
    
    selectedChannels.forEach((channel) => {
      variants.push({
        id: generateId(),
        contentItemId: item.id,
        channelKey: channel.key,
        caption: `${item.hook || item.title} #${item.pillar || 'content'}`,
        hashtags: `#marketing #${channel.key} #content`,
        mediaPrompt: item.format === 'post' ? 'Eye-catching visual with brand colors' : null,
        mediaAssetId: null,
        cta: 'Learn more at our website',
        linkUrl: 'https://example.com',
        utmCampaign: null,
        utmSource: null,
        utmMedium: null,
        createdAt: item.createdAt,
        updatedAt: new Date(),
      });
    });
  });
  
  return variants;
};

// Generate demo publish tasks
const generateDemoTasks = (contentItems: ContentItem[], variants: ChannelVariant[], channels: Channel[]): PublishTask[] => {
  const tasks: PublishTask[] = [];
  
  variants.forEach((variant) => {
    const item = contentItems.find(i => i.id === variant.contentItemId);
    const channel = channels.find(c => c.key === variant.channelKey);
    if (!item || !channel) return;
    
    let state: PublishTask['state'] = 'todo';
    let scheduledFor: Date | null = null;
    
    if (item.status === 'posted') {
      state = 'posted';
      scheduledFor = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000);
    } else if (item.status === 'scheduled') {
      state = 'scheduled';
      scheduledFor = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000);
    }
    
    tasks.push({
      id: generateId(),
      contentItemId: item.id,
      channelKey: variant.channelKey,
      scheduledFor,
      state,
      assignee: item.owner,
      checklist: [...channel.defaultChecklist],
      createdAt: item.createdAt,
      updatedAt: new Date(),
    });
  });
  
  return tasks;
};

// Generate demo logs for posted tasks
const generateDemoLogs = (tasks: PublishTask[]): PublishLog[] => {
  const logs: PublishLog[] = [];
  
  tasks.filter(t => t.state === 'posted').forEach((task) => {
    logs.push({
      id: generateId(),
      publishTaskId: task.id,
      postedAt: task.scheduledFor || new Date(),
      postUrl: `https://${task.channelKey}.com/post/${generateId().slice(0, 8)}`,
      reach: Math.floor(Math.random() * 10000) + 100,
      clicks: Math.floor(Math.random() * 500) + 10,
      notes: 'Published successfully',
    });
  });
  
  return logs;
};

// Generate demo intent events
const generateDemoEvents = (logs: PublishLog[], tasks: PublishTask[]): IntentEvent[] => {
  const events: IntentEvent[] = [];
  
  logs.forEach((log) => {
    const task = tasks.find(t => t.id === log.publishTaskId);
    if (!task) return;
    
    events.push({
      id: generateId(),
      eventType: 'post_published',
      source: 'content_ops',
      channelKey: task.channelKey,
      contentItemId: task.contentItemId,
      payload: {
        postUrl: log.postUrl,
        scheduledFor: task.scheduledFor?.toISOString(),
      },
      createdAt: log.postedAt,
    });
  });
  
  return events;
};

// Initialize all demo data
export const initializeDemoData = () => {
  const channels = [...defaultChannels];
  const contentItems = [...demoContentItems];
  const variants = generateDemoVariants(contentItems, channels);
  const tasks = generateDemoTasks(contentItems, variants, channels);
  const logs = generateDemoLogs(tasks);
  const events = generateDemoEvents(logs, tasks);
  
  return {
    channels,
    contentItems,
    variants,
    tasks,
    logs,
    events,
  };
};
