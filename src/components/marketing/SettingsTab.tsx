import React, { useCallback, useEffect, useState } from 'react';
import { useContentOps } from '@/contexts/ContentOpsContext';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Plus, X, Save } from 'lucide-react';
import type { ChannelKey, Channel } from '@/types/content-ops';
import { apiClient } from '@/lib/api-client';
import { useToast } from '@/hooks/use-toast';

const channelIcons: Record<ChannelKey, string> = {
  x: '𝕏',
  instagram: '📷',
  facebook: '📘',
  linkedin: '💼',
  youtube: '▶️',
  website_blog: '📝',
  whatsapp_status: '📱',
};

export const SettingsTab: React.FC = () => {
  const { getChannels, updateChannel } = useContentOps();
  const { toast } = useToast();
  const channels = getChannels();
  
  const [editingChecklist, setEditingChecklist] = useState<string | null>(null);
  const [newChecklistItem, setNewChecklistItem] = useState('');
  const [integrations, setIntegrations] = useState<Array<{ provider: string; status: 'connected' | 'disconnected' }>>([]);
  const [integrationsLoading, setIntegrationsLoading] = useState(false);
  const [connectingProvider, setConnectingProvider] = useState<string | null>(null);

  const refreshIntegrations = useCallback(async () => {
    setIntegrationsLoading(true);
    try {
      const data = await apiClient.integrations.getAll();
      setIntegrations(data.providers || []);
    } catch (error) {
      toast({
        title: 'Error',
        description: error instanceof Error ? error.message : 'Failed to load integrations',
        variant: 'destructive',
      });
    } finally {
      setIntegrationsLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    refreshIntegrations();
  }, [refreshIntegrations]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const provider = params.get('provider');
    const success = params.get('success');
    const error = params.get('error');

    if (provider && success) {
      const providerLabel = provider === 'instagram' ? 'Instagram' : 'X';
      if (success === '1') {
        toast({
          title: `${providerLabel} connected`,
          description: `Your ${providerLabel} account is now connected.`,
        });
        refreshIntegrations();
      } else {
        toast({
          title: `${providerLabel} connection failed`,
          description: error || 'Authorization failed.',
          variant: 'destructive',
        });
      }

      params.delete('provider');
      params.delete('success');
      params.delete('error');
      const query = params.toString();
      const nextUrl = `${window.location.pathname}${query ? `?${query}` : ''}`;
      window.history.replaceState({}, '', nextUrl);
    }
  }, [refreshIntegrations, toast]);

  const getIntegrationStatus = (provider: string) => {
    return integrations.find(item => item.provider === provider)?.status ?? 'disconnected';
  };

  const handleConnect = useCallback(async (provider: string) => {
    setConnectingProvider(provider);
    try {
      const result = await apiClient.integrations.connectStart(provider);
      if (result.url) {
        window.open(result.url, '_blank', 'noopener');
      } else {
        throw new Error('Missing authorization URL');
      }
    } catch (error) {
      toast({
        title: 'Connection error',
        description: error instanceof Error ? error.message : 'Failed to start OAuth flow',
        variant: 'destructive',
      });
    } finally {
      setConnectingProvider(null);
    }
  }, [toast]);
  
  const handleToggleChannel = async (id: string, enabled: boolean) => {
    try {
      await updateChannel(id, { enabled });
    } catch (error) {
      // Error handled by context toast
    }
  };
  
  const handleAddChecklistItem = async (channel: Channel) => {
    if (!newChecklistItem.trim()) return;
    
    try {
      await updateChannel(channel.id, {
        defaultChecklist: [...channel.defaultChecklist, newChecklistItem.trim()],
      });
      setNewChecklistItem('');
    } catch (error) {
      // Error handled by context toast
    }
  };
  
  const handleRemoveChecklistItem = async (channel: Channel, index: number) => {
    try {
      await updateChannel(channel.id, {
        defaultChecklist: channel.defaultChecklist.filter((_, i) => i !== index),
      });
    } catch (error) {
      // Error handled by context toast
    }
  };
  
  return (
    <div className="max-w-3xl space-y-6">
      <div>
        <h2 className="text-lg font-semibold text-foreground">Integrations</h2>
        <p className="text-sm text-muted-foreground">
          Connect external accounts for publishing
        </p>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <span className="text-2xl">𝕏</span>
              <div>
                <CardTitle className="text-base">X (Twitter)</CardTitle>
                <CardDescription className="text-xs">
                  Status: {integrationsLoading ? 'Loading…' : getIntegrationStatus('x')}
                </CardDescription>
              </div>
            </div>
            <Button
              variant="outline"
              disabled={integrationsLoading || connectingProvider === 'x'}
              onClick={() => handleConnect('x')}
            >
              {getIntegrationStatus('x') === 'connected' ? 'Reconnect' : 'Connect'}
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            Connect your X account to enable publishing.
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <span className="text-2xl">📷</span>
              <div>
                <CardTitle className="text-base">Instagram</CardTitle>
                <CardDescription className="text-xs">
                  Status: {integrationsLoading ? 'Loading…' : getIntegrationStatus('instagram')}
                </CardDescription>
              </div>
            </div>
            <Button
              variant="outline"
              disabled={integrationsLoading || connectingProvider === 'instagram'}
              onClick={() => handleConnect('instagram')}
            >
              {getIntegrationStatus('instagram') === 'connected' ? 'Reconnect' : 'Connect'}
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            Connect your Instagram business account to publish images.
          </p>
        </CardContent>
      </Card>

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
