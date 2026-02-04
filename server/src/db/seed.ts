// Load environment variables from server/.env
import { loadEnv } from './env.js';
loadEnv();

import { db } from './index.js';
import { channels, contentItems, channelVariants, publishTasks, publishLogs, intentEvents } from './schema.js';

// Generate UUID
const generateId = (): string => {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
};

async function seed() {
  console.log('Seeding database...');

  // Clear existing data
  await db.delete(intentEvents);
  await db.delete(publishLogs);
  await db.delete(publishTasks);
  await db.delete(channelVariants);
  await db.delete(contentItems);
  await db.delete(channels);

  // Seed channels
  const defaultChannels = [
    { id: generateId(), key: 'x', name: 'X (Twitter)', enabled: true, defaultChecklist: ['Check character limit', 'Add relevant hashtags', 'Include call to action'] },
    { id: generateId(), key: 'instagram', name: 'Instagram', enabled: true, defaultChecklist: ['Optimize image dimensions', 'Write engaging caption', 'Add location tag'] },
    { id: generateId(), key: 'facebook', name: 'Facebook', enabled: true, defaultChecklist: ['Add preview image', 'Check link preview', 'Schedule optimal time'] },
    { id: generateId(), key: 'linkedin', name: 'LinkedIn', enabled: true, defaultChecklist: ['Professional tone check', 'Add relevant hashtags', 'Tag relevant people'] },
    { id: generateId(), key: 'youtube', name: 'YouTube', enabled: true, defaultChecklist: ['Upload thumbnail', 'Write description', 'Add tags'] },
    { id: generateId(), key: 'website_blog', name: 'Website Blog', enabled: true, defaultChecklist: ['SEO meta tags', 'Internal links', 'Featured image'] },
    { id: generateId(), key: 'whatsapp_status', name: 'WhatsApp Status', enabled: true, defaultChecklist: ['Select media', 'Write caption', 'Post manually'] },
  ];

  await db.insert(channels).values(defaultChannels);
  console.log('✓ Seeded channels');

  // Seed content items
  const now = new Date();
  const demoContentItems = [
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
      createdAt: new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000),
      updatedAt: now,
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
      createdAt: new Date(now.getTime() - 5 * 24 * 60 * 60 * 1000),
      updatedAt: now,
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
      createdAt: new Date(now.getTime() - 3 * 24 * 60 * 60 * 1000),
      updatedAt: now,
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
      createdAt: new Date(now.getTime() - 10 * 24 * 60 * 60 * 1000),
      updatedAt: now,
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
      createdAt: new Date(now.getTime() - 1 * 24 * 60 * 60 * 1000),
      updatedAt: now,
    },
  ];

  await db.insert(contentItems).values(demoContentItems);
  console.log('✓ Seeded content items');

  // Seed variants (3 per content item)
  const variants: Array<typeof channelVariants.$inferInsert> = [];
  const enabledChannelKeys = defaultChannels.filter(c => c.enabled).map(c => c.key);

  demoContentItems.forEach((item) => {
    const selectedChannels = enabledChannelKeys.slice(0, 3);
    selectedChannels.forEach((channelKey) => {
      variants.push({
        id: generateId(),
        contentItemId: item.id,
        channelKey,
        caption: `${item.hook || item.title} #${item.pillar || 'content'}`,
        hashtags: `#marketing #${channelKey} #content`,
        mediaPrompt: item.format === 'post' ? 'Eye-catching visual with brand colors' : null,
        cta: 'Learn more at our website',
        linkUrl: 'https://example.com',
        utmCampaign: null,
        utmSource: null,
        utmMedium: null,
        createdAt: item.createdAt,
        updatedAt: now,
      });
    });
  });

  await db.insert(channelVariants).values(variants);
  console.log('✓ Seeded channel variants');

  // Seed publish tasks
  const tasks: Array<typeof publishTasks.$inferInsert> = [];
  variants.forEach((variant) => {
    const item = demoContentItems.find(i => i.id === variant.contentItemId);
    const channel = defaultChannels.find(c => c.key === variant.channelKey);
    if (!item || !channel) return;

    let state: 'todo' | 'scheduled' | 'posted' | 'skipped' = 'todo';
    let scheduledFor: Date | null = null;

    if (item.status === 'posted') {
      state = 'posted';
      scheduledFor = new Date(now.getTime() - 2 * 24 * 60 * 60 * 1000);
    } else if (item.status === 'scheduled') {
      state = 'scheduled';
      scheduledFor = new Date(now.getTime() + 3 * 24 * 60 * 60 * 1000);
    }

    tasks.push({
      id: generateId(),
      contentItemId: item.id,
      channelKey: variant.channelKey,
      scheduledFor,
      state,
      status: state === 'posted' ? 'success' : 'queued',
      assignee: item.owner,
      checklist: [...channel.defaultChecklist],
      idempotencyKey: null,
      providerRef: null,
      attempts: 0,
      maxAttempts: 5,
      lockedAt: null,
      lockedBy: null,
      lastError: null,
      createdAt: item.createdAt,
      updatedAt: now,
    });
  });

  await db.insert(publishTasks).values(tasks);
  console.log('✓ Seeded publish tasks');

  // Seed publish logs for posted tasks
  const logs: Array<typeof publishLogs.$inferInsert> = [];
  const postedTasks = tasks.filter(t => t.state === 'posted');

  postedTasks.forEach((task) => {
    logs.push({
      id: generateId(),
      publishTaskId: task.id!,
      postedAt: task.scheduledFor || now,
      postUrl: `https://${task.channelKey}.com/post/${generateId().slice(0, 8)}`,
      reach: Math.floor(Math.random() * 10000) + 100,
      clicks: Math.floor(Math.random() * 500) + 10,
      notes: 'Published successfully',
    });
  });

  await db.insert(publishLogs).values(logs);
  console.log('✓ Seeded publish logs');

  // Seed intent events
  const events: Array<typeof intentEvents.$inferInsert> = [];
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

  await db.insert(intentEvents).values(events);
  console.log('✓ Seeded intent events');

  console.log('✓ Seeding completed!');
  return { success: true };
}

// Export for use in API route
export { seed };

// Allow running directly from CLI
if (process.argv[1]?.endsWith('seed.ts') || process.argv[1]?.endsWith('seed.js')) {
  seed().then(() => {
    process.exit(0);
  }).catch((err) => {
    console.error('Seeding failed:', err);
    process.exit(1);
  });
}

