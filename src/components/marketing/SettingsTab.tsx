import React, { useState } from 'react';
import { useContentOps } from '@/contexts/ContentOpsContext';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Plus, X, Save } from 'lucide-react';
import type { ChannelKey, Channel } from '@/types/content-ops';

const channelIcons: Record<ChannelKey, string> = {
  x: '𝕏',
  instagram: '📷',
  facebook: '📘',
  linkedin: '💼',
  youtube: '▶️',
  website_blog: '📝',
};

export const SettingsTab: React.FC = () => {
  const { getChannels, updateChannel } = useContentOps();
  const channels = getChannels();
  
  const [editingChecklist, setEditingChecklist] = useState<string | null>(null);
  const [newChecklistItem, setNewChecklistItem] = useState('');
  
  const handleToggleChannel = (id: string, enabled: boolean) => {
    updateChannel(id, { enabled });
  };
  
  const handleAddChecklistItem = (channel: Channel) => {
    if (!newChecklistItem.trim()) return;
    
    updateChannel(channel.id, {
      defaultChecklist: [...channel.defaultChecklist, newChecklistItem.trim()],
    });
    setNewChecklistItem('');
  };
  
  const handleRemoveChecklistItem = (channel: Channel, index: number) => {
    updateChannel(channel.id, {
      defaultChecklist: channel.defaultChecklist.filter((_, i) => i !== index),
    });
  };
  
  return (
    <div className="max-w-3xl space-y-6">
      <div>
        <h2 className="text-lg font-semibold text-foreground">Channel Settings</h2>
        <p className="text-sm text-muted-foreground">
          Configure which channels are enabled and their default checklists
        </p>
      </div>
      
      <div className="space-y-4">
        {channels.map(channel => (
          <Card key={channel.id} className={!channel.enabled ? 'opacity-60' : ''}>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <span className="text-2xl">{channelIcons[channel.key]}</span>
                  <div>
                    <CardTitle className="text-base">{channel.name}</CardTitle>
                    <CardDescription className="text-xs">
                      {channel.key}
                    </CardDescription>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Label htmlFor={`toggle-${channel.id}`} className="text-sm text-muted-foreground">
                    {channel.enabled ? 'Enabled' : 'Disabled'}
                  </Label>
                  <Switch
                    id={`toggle-${channel.id}`}
                    checked={channel.enabled}
                    onCheckedChange={(checked) => handleToggleChannel(channel.id, checked)}
                  />
                </div>
              </div>
            </CardHeader>
            
            <CardContent>
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <Label className="text-sm font-medium">Default Checklist</Label>
                  {editingChecklist !== channel.id ? (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setEditingChecklist(channel.id)}
                    >
                      Edit
                    </Button>
                  ) : (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setEditingChecklist(null)}
                    >
                      <Save className="h-4 w-4 mr-1" />
                      Done
                    </Button>
                  )}
                </div>
                
                <div className="flex flex-wrap gap-2">
                  {channel.defaultChecklist.map((item, index) => (
                    <Badge
                      key={index}
                      variant="secondary"
                      className="py-1 px-2 flex items-center gap-1"
                    >
                      {item}
                      {editingChecklist === channel.id && (
                        <button
                          onClick={() => handleRemoveChecklistItem(channel, index)}
                          className="ml-1 hover:text-destructive"
                        >
                          <X className="h-3 w-3" />
                        </button>
                      )}
                    </Badge>
                  ))}
                  {channel.defaultChecklist.length === 0 && (
                    <span className="text-sm text-muted-foreground">No checklist items</span>
                  )}
                </div>
                
                {editingChecklist === channel.id && (
                  <div className="flex gap-2">
                    <Input
                      placeholder="Add checklist item..."
                      value={newChecklistItem}
                      onChange={(e) => setNewChecklistItem(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          handleAddChecklistItem(channel);
                        }
                      }}
                      className="bg-secondary/50"
                    />
                    <Button
                      size="icon"
                      onClick={() => handleAddChecklistItem(channel)}
                      disabled={!newChecklistItem.trim()}
                    >
                      <Plus className="h-4 w-4" />
                    </Button>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
};
