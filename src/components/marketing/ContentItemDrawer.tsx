import React, { useState, useEffect, useRef } from 'react';
import { useContentOps } from '@/contexts/ContentOpsContext';
import { useToast } from '@/hooks/use-toast';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { Plus, Wand2, Trash2, Upload, X } from 'lucide-react';
import { MediaPicker } from './MediaPicker';
import { apiClient } from '@/lib/api-client';
import { scheduledPostApiService } from '@/services/scheduledPostApiService';
import type { ContentStatus, ContentPillar, ContentFormat, Priority, ChannelKey, ChannelVariant } from '@/types/content-ops';
import type { Platform } from '@/types/scheduled-post';

interface ContentItemDrawerProps {
  itemId: string | null;
  open: boolean;
  onClose: () => void;
}

const channelLabels: Record<ChannelKey, string> = {
  x: 'X (Twitter)',
  instagram: 'Instagram',
  facebook: 'Facebook',
  linkedin: 'LinkedIn',
  youtube: 'YouTube',
  website_blog: 'Website Blog',
  whatsapp_status: 'WhatsApp Status',
};

const channelToPlatform: Partial<Record<ChannelKey, Platform>> = {
  x: 'x',
  instagram: 'instagram',
  facebook: 'facebook',
  linkedin: 'linkedin',
  tiktok: 'tiktok',
  youtube: 'youtube_shorts',
};

export const ContentItemDrawer: React.FC<ContentItemDrawerProps> = ({ itemId, open, onClose }) => {
  const { 
    getContentItem, 
    updateContentItem, 
    getChannels,
    createVariant,
    updateVariant,
    deleteVariant,
    generateUtms,
    getTasksForContent,
    getVariantsForContent,
    createTask,
    createTasksForAllChannels,
    refreshContentItems,
  } = useContentOps();
  const { toast } = useToast();
  
  const item = itemId ? getContentItem(itemId) : null;
  const channels = getChannels();
  const enabledChannels = channels.filter(c => c.enabled);
  const schedulableChannels = enabledChannels.filter(c => channelToPlatform[c.key]);
  
  // Store getContentItem in ref to avoid including it in effect dependencies
  // This prevents the effect from re-running when context state updates
  const getContentItemRef = useRef(getContentItem);
  useEffect(() => {
    getContentItemRef.current = getContentItem;
  }, [getContentItem]);
  
  // Maintain local draft state that persists during editing
  const [draft, setDraft] = useState<Partial<ContentItem>>({
    title: '',
    hook: '',
    pillar: null,
    format: null,
    status: 'draft' as ContentStatus,
    priority: 2 as Priority,
    notes: '',
  });
  const [uploading, setUploading] = useState(false);
  const [attachedMedia, setAttachedMedia] = useState<Array<{ id: string; url: string; filename: string }>>([]);
  const [scheduleDate, setScheduleDate] = useState('');
  const [scheduleTime, setScheduleTime] = useState('');
  const [scheduleChannel, setScheduleChannel] = useState<ChannelKey>('x');
  const [scheduling, setScheduling] = useState(false);
  const scheduleInitializedRef = useRef(false);
  
  // Initialize/reset draft only when dialog opens or itemId changes
  // Use ref to get item to avoid depending on getContentItem function reference
  useEffect(() => {
    if (open && itemId) {
      const currentItem = getContentItemRef.current(itemId);
      if (currentItem) {
        setDraft({
          title: currentItem.title,
          hook: currentItem.hook || '',
          pillar: currentItem.pillar || null,
          format: currentItem.format || null,
          status: currentItem.status,
          priority: currentItem.priority,
          notes: currentItem.notes || '',
        });
        // Load attached media if mediaIds exist
        if (currentItem.mediaIds && currentItem.mediaIds.length > 0) {
          // For now, we'll just store the IDs. In a full implementation, you'd fetch media details
          setAttachedMedia(currentItem.mediaIds.map(id => ({ id, url: '', filename: '' })));
        } else {
          setAttachedMedia([]);
        }
      }
    }
  }, [open, itemId]); // Only reset when dialog opens/closes OR itemId changes, not on every item update

  useEffect(() => {
    if (!open) {
      scheduleInitializedRef.current = false;
      return;
    }
    if (scheduleInitializedRef.current) return;

    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    const hours = String(now.getHours()).padStart(2, '0');
    const minutes = String(now.getMinutes()).padStart(2, '0');
    setScheduleDate(`${year}-${month}-${day}`);
    setScheduleTime(`${hours}:${minutes}`);
    scheduleInitializedRef.current = true;
  }, [open]);

  useEffect(() => {
    if (!open) return;
    if (!schedulableChannels.find(c => c.key === scheduleChannel)) {
      const fallback = schedulableChannels[0]?.key;
      if (fallback) {
        setScheduleChannel(fallback);
      }
    }
  }, [open, schedulableChannels, scheduleChannel]);

  const handleScheduleToCalendar = async () => {
    if (!itemId) return;
    if (!scheduleDate || !scheduleTime) {
      return toast({ title: 'Error', description: 'Date and time are required', variant: 'destructive' });
    }
    const platform = channelToPlatform[scheduleChannel];
    if (!platform) {
      return toast({ title: 'Error', description: 'Selected channel is not supported for calendar scheduling', variant: 'destructive' });
    }

    const variants = getVariantsForContent(itemId);
    const variant = variants.find(v => v.channelKey === scheduleChannel);
    const caption = variant?.caption || [item?.hook, item?.title].filter(Boolean).join('\n\n');

    setScheduling(true);
    try {
      await scheduledPostApiService.create({
        title: item?.title || null,
        caption: caption || null,
        contentItemId: itemId,
        channelKey: scheduleChannel,
        scheduledDate: scheduleDate,
        scheduledTime: scheduleTime,
        platforms: [platform],
        media: [],
      });
      await apiClient.contentItems.updateStatus(itemId, 'scheduled');
      await refreshContentItems();
      toast({ title: 'Scheduled', description: 'Added to calendar' });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to schedule';
      toast({ title: 'Error', description: message, variant: 'destructive' });
    } finally {
      setScheduling(false);
    }
  };
  
  const handleSave = async () => {
    if (!itemId) return;
    
    try {
      await updateContentItem(itemId, {
        title: draft.title || '',
        hook: draft.hook || null,
        pillar: draft.pillar || null,
        format: draft.format || null,
        status: draft.status || 'draft',
        priority: draft.priority || 2,
        notes: draft.notes || null,
      });
    } catch (error) {
      // Error handled by context toast
      throw error; // Re-throw so caller knows save failed
    }
  };

  const handleClose = async (open: boolean) => {
    if (!open && itemId) {
      // Save changes when drawer closes
      try {
        await handleSave();
      } catch (error) {
        // If save fails, keep drawer open so user doesn't lose edits
        return;
      }
    }
    onClose();
  };
  
  const handleAddVariant = async (channelKey: ChannelKey) => {
    if (!itemId) return;
    try {
      await createVariant({
        contentItemId: itemId,
        channelKey,
      });
    } catch (error) {
      // Error handled by context toast
    }
  };
  
  const handleUpdateVariant = async (variantId: string, updates: Partial<ChannelVariant>) => {
    try {
      await updateVariant(variantId, updates);
    } catch (error) {
      // Error handled by context toast
    }
  };
  
  const handleGenerateUtms = async (variantId: string) => {
    try {
      await generateUtms(variantId, draft.title || '');
    } catch (error) {
      // Error handled by context toast
    }
  };
  
  const handleCreateAllTasks = async () => {
    if (!itemId) return;
    try {
      await createTasksForAllChannels(itemId);
    } catch (error) {
      // Error handled by context toast
    }
  };

  const handleFileSelect = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file || !itemId) return;

    setUploading(true);
    try {
      // Step 1: Get presigned URL
      const { key, uploadUrl, publicUrl } = await apiClient.media.presign(file.name, file.type);

      // Step 2: Upload directly to R2
      const uploadResponse = await fetch(uploadUrl, {
        method: 'PUT',
        headers: {
          'Content-Type': file.type,
        },
        body: file,
      });

      if (!uploadResponse.ok) {
        throw new Error(`Upload failed: ${uploadResponse.statusText}`);
      }

      // Step 3: Create media record
      const mediaRecord = await apiClient.media.create({
        key,
        url: publicUrl || uploadUrl,
        filename: file.name,
        contentType: file.type,
        size: file.size,
      });

      // Step 4: Update content item with new media ID
      const currentMediaIds = item?.mediaIds || [];
      await updateContentItem(itemId, {
        mediaIds: [...currentMediaIds, mediaRecord.id],
      });

      // Step 5: Refresh to get updated item
      await refreshContentItems();

      // Reset file input
      event.target.value = '';
    } catch (error) {
      console.error('Upload failed:', error);
      alert(error instanceof Error ? error.message : 'Upload failed');
    } finally {
      setUploading(false);
    }
  };
  
  if (!item) return null;
  
  const existingVariantChannels = item.variants.map(v => v.channelKey);
  const availableChannels = enabledChannels.filter(c => !existingVariantChannels.includes(c.key));
  
  return (
    <Sheet open={open} onOpenChange={handleClose}>
      <SheetContent className="w-full sm:max-w-xl overflow-y-auto">
        <SheetHeader>
          <SheetTitle>Edit Content Item</SheetTitle>
        </SheetHeader>
        
        <div className="space-y-6 py-6">
          {/* Basic Fields */}
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="title">Title</Label>
              <Input
                id="title"
                value={draft.title ?? ''}
                onChange={(e) => setDraft(prev => ({ ...prev, title: e.target.value }))}
                onBlur={handleSave}
                className="bg-secondary/50"
              />
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="hook">Hook</Label>
              <Input
                id="hook"
                value={draft.hook ?? ''}
                onChange={(e) => setDraft(prev => ({ ...prev, hook: e.target.value }))}
                onBlur={handleSave}
                placeholder="Attention-grabbing hook..."
                className="bg-secondary/50"
              />
            </div>
            
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Pillar</Label>
                <Select
                  value={draft.pillar ?? ''}
                  onValueChange={(value) => {
                    setDraft(prev => ({ ...prev, pillar: value as ContentPillar }));
                  }}
                >
                  <SelectTrigger className="bg-secondary/50">
                    <SelectValue placeholder="Select pillar" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="product">Product</SelectItem>
                    <SelectItem value="educational">Educational</SelectItem>
                    <SelectItem value="proof">Proof</SelectItem>
                    <SelectItem value="meme">Meme</SelectItem>
                    <SelectItem value="offer">Offer</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              
              <div className="space-y-2">
                <Label>Format</Label>
                <Select
                  value={draft.format ?? ''}
                  onValueChange={(value) => {
                    setDraft(prev => ({ ...prev, format: value as ContentFormat }));
                  }}
                >
                  <SelectTrigger className="bg-secondary/50">
                    <SelectValue placeholder="Select format" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="post">Post</SelectItem>
                    <SelectItem value="reel">Reel</SelectItem>
                    <SelectItem value="short">Short</SelectItem>
                    <SelectItem value="carousel">Carousel</SelectItem>
                    <SelectItem value="article">Article</SelectItem>
                    <SelectItem value="ad">Ad</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Status</Label>
                <Select
                  value={draft.status ?? 'draft'}
                  onValueChange={(value) => {
                    setDraft(prev => ({ ...prev, status: value as ContentStatus }));
                  }}
                >
                  <SelectTrigger className="bg-secondary/50">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="draft">Draft</SelectItem>
                    <SelectItem value="ready">Ready</SelectItem>
                    <SelectItem value="scheduled">Planned</SelectItem>
                    <SelectItem value="posted">Posted</SelectItem>
                    <SelectItem value="repurpose">Repurpose</SelectItem>
                    <SelectItem value="archived">Archived</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              
              <div className="space-y-2">
                <Label>Priority</Label>
                <Select
                  value={(draft.priority ?? 2).toString()}
                  onValueChange={(value) => {
                    const priority = parseInt(value) as Priority;
                    setDraft(prev => ({ ...prev, priority }));
                  }}
                >
                  <SelectTrigger className="bg-secondary/50">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="1">High</SelectItem>
                    <SelectItem value="2">Normal</SelectItem>
                    <SelectItem value="3">Low</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <Card className="mt-4">
              <CardHeader>
                <CardTitle>Schedule to Calendar</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-2">
                    <Label>Date</Label>
                    <Input
                      type="date"
                      value={scheduleDate}
                      onChange={(e) => setScheduleDate(e.target.value)}
                      className="bg-secondary/50"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Time</Label>
                    <Input
                      type="time"
                      value={scheduleTime}
                      onChange={(e) => setScheduleTime(e.target.value)}
                      className="bg-secondary/50"
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label>Channel</Label>
                  <Select
                    value={scheduleChannel}
                    onValueChange={(value) => setScheduleChannel(value as ChannelKey)}
                    disabled={schedulableChannels.length === 0}
                  >
                    <SelectTrigger className="bg-secondary/50">
                      <SelectValue placeholder="Select channel" />
                    </SelectTrigger>
                    <SelectContent>
                      {schedulableChannels.map(channel => (
                        <SelectItem key={channel.key} value={channel.key}>
                          {channelLabels[channel.key]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <Button
                  type="button"
                  onClick={handleScheduleToCalendar}
                  disabled={scheduling || schedulableChannels.length === 0}
                >
                  {scheduling ? 'Scheduling...' : 'Add to Calendar'}
                </Button>
              </CardContent>
            </Card>
            
            <div className="space-y-2">
              <Label htmlFor="notes">Notes</Label>
              <Textarea
                id="notes"
                value={draft.notes ?? ''}
                onChange={(e) => setDraft(prev => ({ ...prev, notes: e.target.value }))}
                onBlur={handleSave}
                placeholder="Additional notes..."
                className="bg-secondary/50"
              />
            </div>
          </div>

          <Separator />

          {/* Media Upload */}
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="font-semibold text-foreground">Media</h3>
              <div className="relative">
                <input
                  type="file"
                  id="media-upload"
                  className="hidden"
                  onChange={handleFileSelect}
                  disabled={uploading || !itemId}
                  accept="image/*,video/*"
                />
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => document.getElementById('media-upload')?.click()}
                  disabled={uploading || !itemId}
                >
                  <Upload className="h-4 w-4 mr-2" />
                  {uploading ? 'Uploading...' : 'Upload'}
                </Button>
              </div>
            </div>

            {/* Attached Media List */}
            {item?.mediaIds && item.mediaIds.length > 0 ? (
              <div className="grid grid-cols-3 gap-2">
                {item.mediaIds.map((mediaId) => (
                  <div
                    key={mediaId}
                    className="relative aspect-square bg-secondary/20 rounded-lg overflow-hidden border border-border"
                  >
                    <div className="w-full h-full flex items-center justify-center text-xs text-muted-foreground">
                      Media {mediaId.substring(0, 8)}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground text-center py-4">
                No media attached. Click Upload to add files.
              </p>
            )}
          </div>
          
          <Separator />
          
          {/* Channel Variants */}
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="font-semibold text-foreground">Channel Variants</h3>
              {availableChannels.length > 0 && (
                <Select onValueChange={(value) => handleAddVariant(value as ChannelKey)}>
                  <SelectTrigger className="w-40">
                    <Plus className="h-4 w-4 mr-2" />
                    Add Channel
                  </SelectTrigger>
                  <SelectContent>
                    {availableChannels.map(channel => (
                      <SelectItem key={channel.key} value={channel.key}>
                        {channel.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>
            
            {item.variants.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-4">
                No channel variants yet. Add one to get started.
              </p>
            ) : (
              <div className="space-y-3">
                {item.variants.map(variant => (
                  <Card key={variant.id} className="bg-secondary/20">
                    <CardHeader className="pb-2">
                      <div className="flex items-center justify-between">
                        <CardTitle className="text-sm">
                          {channelLabels[variant.channelKey]}
                        </CardTitle>
                        <div className="flex gap-1">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleGenerateUtms(variant.id)}
                            title="Generate UTMs"
                          >
                            <Wand2 className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => deleteVariant(variant.id).catch(() => {})}
                            className="text-destructive hover:text-destructive"
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                    </CardHeader>
                    <CardContent className="space-y-3">
                      {(variant.channelKey === 'whatsapp_status' || variant.channelKey === 'instagram') && (
                        <MediaPicker
                          value={variant.mediaAssetId || null}
                          onChange={(mediaAssetId) => handleUpdateVariant(variant.id, { mediaAssetId })}
                          mimeType={variant.channelKey === 'whatsapp_status' ? 'image/*,video/*' : 'image/*'}
                        />
                      )}
                      <div className="space-y-2">
                        <Label className="text-xs">Caption</Label>
                        <Textarea
                          value={variant.caption || ''}
                          onChange={(e) => handleUpdateVariant(variant.id, { caption: e.target.value })}
                          placeholder="Post caption..."
                          className="bg-background text-sm min-h-[60px]"
                        />
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        <div className="space-y-1">
                          <Label className="text-xs">Hashtags</Label>
                          <Input
                            value={variant.hashtags || ''}
                            onChange={(e) => handleUpdateVariant(variant.id, { hashtags: e.target.value })}
                            placeholder="#hashtag"
                            className="bg-background text-sm"
                          />
                        </div>
                        <div className="space-y-1">
                          <Label className="text-xs">CTA</Label>
                          <Input
                            value={variant.cta || ''}
                            onChange={(e) => handleUpdateVariant(variant.id, { cta: e.target.value })}
                            placeholder="Call to action"
                            className="bg-background text-sm"
                          />
                        </div>
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs">Link URL</Label>
                        <Input
                          value={variant.linkUrl || ''}
                          onChange={(e) => handleUpdateVariant(variant.id, { linkUrl: e.target.value })}
                          placeholder="https://..."
                          className="bg-background text-sm"
                        />
                      </div>
                      {(variant.utmCampaign || variant.utmSource || variant.utmMedium) && (
                        <div className="flex flex-wrap gap-1">
                          {variant.utmCampaign && (
                            <Badge variant="outline" className="text-xs">
                              campaign={variant.utmCampaign}
                            </Badge>
                          )}
                          {variant.utmSource && (
                            <Badge variant="outline" className="text-xs">
                              source={variant.utmSource}
                            </Badge>
                          )}
                          {variant.utmMedium && (
                            <Badge variant="outline" className="text-xs">
                              medium={variant.utmMedium}
                            </Badge>
                          )}
                        </div>
                      )}
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </div>
          
          <Separator />
          
          {/* Publish Tasks */}
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="font-semibold text-foreground">Publish Tasks</h3>
              <Button variant="outline" size="sm" onClick={handleCreateAllTasks}>
                <Plus className="h-4 w-4 mr-2" />
                Create for All Channels
              </Button>
            </div>
            
            {item.tasks.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-4">
                No publish tasks yet.
              </p>
            ) : (
              <div className="space-y-2">
                {item.tasks.map(task => (
                  <div
                    key={task.id}
                    className="flex items-center justify-between p-3 bg-secondary/20 rounded-lg"
                  >
                    <div className="flex items-center gap-3">
                      <Badge variant="outline">{task.channelKey}</Badge>
                      <span className="text-sm capitalize text-muted-foreground">
                        {task.state}
                      </span>
                    </div>
                    {task.scheduledFor && (
                      <span className="text-xs text-muted-foreground">
                        {new Date(task.scheduledFor).toLocaleDateString()}
                      </span>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
};
