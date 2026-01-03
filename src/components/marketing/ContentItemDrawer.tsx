import React, { useState, useEffect } from 'react';
import { useContentOps } from '@/contexts/ContentOpsContext';
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
import { Plus, Wand2, Trash2 } from 'lucide-react';
import { MediaPicker } from './MediaPicker';
import type { ContentStatus, ContentPillar, ContentFormat, Priority, ChannelKey, ChannelVariant } from '@/types/content-ops';

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
    createTask,
    createTasksForAllChannels,
  } = useContentOps();
  
  const item = itemId ? getContentItem(itemId) : null;
  const channels = getChannels();
  const enabledChannels = channels.filter(c => c.enabled);
  
  const [formData, setFormData] = useState({
    title: '',
    hook: '',
    pillar: '' as ContentPillar | '',
    format: '' as ContentFormat | '',
    status: 'draft' as ContentStatus,
    priority: 2 as Priority,
    notes: '',
  });
  
  useEffect(() => {
    if (item) {
      setFormData({
        title: item.title,
        hook: item.hook || '',
        pillar: item.pillar || '',
        format: item.format || '',
        status: item.status,
        priority: item.priority,
        notes: item.notes || '',
      });
    }
  }, [item]);
  
  const handleSave = async () => {
    if (!itemId) return;
    
    try {
      await updateContentItem(itemId, {
        title: formData.title,
        hook: formData.hook || null,
        pillar: formData.pillar || null,
        format: formData.format || null,
        status: formData.status,
        priority: formData.priority,
        notes: formData.notes || null,
      });
    } catch (error) {
      // Error handled by context toast
    }
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
      await generateUtms(variantId, formData.title);
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
  
  if (!item) return null;
  
  const existingVariantChannels = item.variants.map(v => v.channelKey);
  const availableChannels = enabledChannels.filter(c => !existingVariantChannels.includes(c.key));
  
  return (
    <Sheet open={open} onOpenChange={onClose}>
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
                value={formData.title}
                onChange={(e) => setFormData(prev => ({ ...prev, title: e.target.value }))}
                onBlur={handleSave}
                className="bg-secondary/50"
              />
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="hook">Hook</Label>
              <Input
                id="hook"
                value={formData.hook}
                onChange={(e) => setFormData(prev => ({ ...prev, hook: e.target.value }))}
                onBlur={handleSave}
                placeholder="Attention-grabbing hook..."
                className="bg-secondary/50"
              />
            </div>
            
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Pillar</Label>
                <Select
                  value={formData.pillar}
                  onValueChange={(value) => {
                    setFormData(prev => ({ ...prev, pillar: value as ContentPillar }));
                    if (itemId) updateContentItem(itemId, { pillar: value as ContentPillar || null }).catch(() => {});
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
                  value={formData.format}
                  onValueChange={(value) => {
                    setFormData(prev => ({ ...prev, format: value as ContentFormat }));
                    if (itemId) updateContentItem(itemId, { format: value as ContentFormat || null }).catch(() => {});
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
                  value={formData.status}
                  onValueChange={(value) => {
                    setFormData(prev => ({ ...prev, status: value as ContentStatus }));
                    if (itemId) updateContentItem(itemId, { status: value as ContentStatus }).catch(() => {});
                  }}
                >
                  <SelectTrigger className="bg-secondary/50">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="draft">Draft</SelectItem>
                    <SelectItem value="ready">Ready</SelectItem>
                    <SelectItem value="scheduled">Scheduled</SelectItem>
                    <SelectItem value="posted">Posted</SelectItem>
                    <SelectItem value="repurpose">Repurpose</SelectItem>
                    <SelectItem value="archived">Archived</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              
              <div className="space-y-2">
                <Label>Priority</Label>
                <Select
                  value={formData.priority.toString()}
                  onValueChange={(value) => {
                    const priority = parseInt(value) as Priority;
                    setFormData(prev => ({ ...prev, priority }));
                    if (itemId) updateContentItem(itemId, { priority }).catch(() => {});
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
            
            <div className="space-y-2">
              <Label htmlFor="notes">Notes</Label>
              <Textarea
                id="notes"
                value={formData.notes}
                onChange={(e) => setFormData(prev => ({ ...prev, notes: e.target.value }))}
                onBlur={handleSave}
                placeholder="Additional notes..."
                className="bg-secondary/50"
              />
            </div>
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
