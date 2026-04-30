import React, { useEffect, useMemo, useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/hooks/use-toast';
import {
  apiClient,
  type ApiExecuteTaskRequest,
  type ApiExecuteTaskResponse,
  type ApiSocialCapabilityMatrix,
} from '@/lib/api-client';

type Platform = 'instagram' | 'facebook' | 'whatsapp';

const PLATFORM_LABELS: Record<Platform, string> = {
  instagram: 'Instagram',
  facebook: 'Facebook',
  whatsapp: 'WhatsApp',
};

const ALL_PLATFORMS: Platform[] = ['instagram', 'facebook', 'whatsapp'];

const buildTaskId = () => `task_${Date.now()}`;
const buildIdempotencyKey = (taskId: string) => `${taskId}:${Date.now()}`;

type ActionPreset = {
  id: string;
  label: string;
  description: string;
  platform: Platform;
  actionType: string;
  targetRef: string;
  content: string;
  metadata: Record<string, unknown>;
};

const ACTION_PRESETS: ActionPreset[] = [
  {
    id: 'instagram-mention',
    label: 'Instagram Mention Reply',
    description: 'Reply where your account is @mentioned',
    platform: 'instagram',
    actionType: 'mention',
    targetRef: '17841400000000000',
    content: 'Thanks for the mention. Happy to help.',
    metadata: {
      human_approved: true,
      media_id: '17900000000000000',
      comment_id: '17910000000000000',
    },
  },
  {
    id: 'instagram-dm',
    label: 'Instagram DM',
    description: 'Send Instagram direct message',
    platform: 'instagram',
    actionType: 'dm',
    targetRef: '17890000000000000',
    content: 'Thanks for reaching out. Our team will follow up shortly.',
    metadata: {
      human_approved: true,
      recipient_igsid: '17890000000000000',
    },
  },
  {
    id: 'facebook-dm',
    label: 'Facebook DM',
    description: 'Send message to Facebook recipient',
    platform: 'facebook',
    actionType: 'dm',
    targetRef: '1234567890123456',
    content: 'Thanks for your message. We will get back to you soon.',
    metadata: {
      human_approved: true,
      recipient_psid: '1234567890123456',
    },
  },
  {
    id: 'facebook-reply',
    label: 'Facebook Comment Reply',
    description: 'Reply to a Facebook comment',
    platform: 'facebook',
    actionType: 'reply',
    targetRef: '987654321000000',
    content: 'Thanks for your comment.',
    metadata: {
      human_approved: true,
    },
  },
  {
    id: 'whatsapp-dm',
    label: 'WhatsApp DM',
    description: 'Send WhatsApp outbound message',
    platform: 'whatsapp',
    actionType: 'dm',
    targetRef: '+27123456789',
    content: 'Hello. This is a test outbound message from DO-Socials.',
    metadata: {
      human_approved: true,
    },
  },
];

const supportedActions = (matrix?: ApiSocialCapabilityMatrix | null) =>
  (matrix?.actions || []).filter((action) => action.supported);

const unsupportedActions = (matrix?: ApiSocialCapabilityMatrix | null) =>
  (matrix?.actions || []).filter((action) => !action.supported);

export const SocialActionsTab: React.FC = () => {
  const { toast } = useToast();
  const hasFrontendServiceToken = Boolean((import.meta.env.VITE_DO_SOCIALS_AUTH_BEARER_TOKEN || '').trim());
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [lastLoadError, setLastLoadError] = useState<string | null>(null);
  const [lastExecuteError, setLastExecuteError] = useState<string | null>(null);
  const [matrices, setMatrices] = useState<Record<Platform, ApiSocialCapabilityMatrix | null>>({
    instagram: null,
    facebook: null,
    whatsapp: null,
  });
  const [integrations, setIntegrations] = useState<Array<{ provider: string; status: 'connected' | 'disconnected' }>>([]);

  const [platform, setPlatform] = useState<Platform>('instagram');
  const [actionType, setActionType] = useState<string>('');
  const [taskId, setTaskId] = useState(buildTaskId());
  const [idempotencyKey, setIdempotencyKey] = useState('');
  const [targetRef, setTargetRef] = useState('');
  const [leadRef, setLeadRef] = useState('');
  const [content, setContent] = useState('');
  const [metadataJson, setMetadataJson] = useState('{\n  "human_approved": true\n}');
  const [lastResponse, setLastResponse] = useState<ApiExecuteTaskResponse | null>(null);

  useEffect(() => {
    setIdempotencyKey(buildIdempotencyKey(taskId));
  }, [taskId]);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      setLoading(true);
      try {
        const [caps, integrationData] = await Promise.all([
          apiClient.socialExecution.getCapabilities(),
          apiClient.integrations.getAll(),
        ]);
        if (cancelled) return;
        const allCaps = caps as Record<string, ApiSocialCapabilityMatrix>;
        setMatrices({
          instagram: allCaps.instagram || null,
          facebook: allCaps.facebook || null,
          whatsapp: allCaps.whatsapp || null,
        });
        setIntegrations(integrationData.providers || []);
        setLastLoadError(null);
      } catch (error) {
        if (cancelled) return;
        const message = error instanceof Error ? error.message : 'Unable to fetch capability data';
        setLastLoadError(message);
        toast({
          title: 'Failed to load social capabilities',
          description: message,
          variant: 'destructive',
        });
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    load();
    return () => {
      cancelled = true;
    };
  }, [toast]);

  const activeMatrix = matrices[platform];

  const connectedProviders = useMemo(() => {
    const providerMap: Record<string, 'connected' | 'disconnected'> = {};
    for (const item of integrations) {
      providerMap[item.provider] = item.status;
    }
    return providerMap;
  }, [integrations]);

  const selectableActions = useMemo(
    () => (activeMatrix?.actions || []).map((action) => action.action_type),
    [activeMatrix]
  );

  useEffect(() => {
    if (!selectableActions.length) return;
    if (!actionType || !selectableActions.includes(actionType)) {
      const firstSupported = (activeMatrix?.actions || []).find((action) => action.supported)?.action_type;
      setActionType(firstSupported || selectableActions[0]);
    }
  }, [actionType, selectableActions, activeMatrix]);

  const selectedAction = useMemo(
    () => (activeMatrix?.actions || []).find((action) => action.action_type === actionType) || null,
    [activeMatrix, actionType]
  );

  const remainingToConnect = useMemo(() => {
    return ALL_PLATFORMS
      .filter((p) => supportedActions(matrices[p]).length > 0)
      .filter((p) => connectedProviders[p] !== 'connected');
  }, [matrices, connectedProviders]);

  const remainingToBuild = useMemo(() => {
    const rows: Array<{ platform: Platform; action: string }> = [];
    for (const p of ALL_PLATFORMS) {
      for (const action of unsupportedActions(matrices[p])) {
        rows.push({ platform: p, action: action.action_type });
      }
    }
    return rows;
  }, [matrices]);

  const handleRefresh = async () => {
    setLoading(true);
    try {
      const [caps, integrationData] = await Promise.all([
        apiClient.socialExecution.getCapabilities(),
        apiClient.integrations.getAll(),
      ]);
      const allCaps = caps as Record<string, ApiSocialCapabilityMatrix>;
      setMatrices({
        instagram: allCaps.instagram || null,
        facebook: allCaps.facebook || null,
        whatsapp: allCaps.whatsapp || null,
      });
      setIntegrations(integrationData.providers || []);
      setLastLoadError(null);
      toast({ title: 'Capabilities refreshed' });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unable to refresh capability data';
      setLastLoadError(message);
      toast({
        title: 'Refresh failed',
        description: message,
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  const regenerateIds = () => {
    const nextTaskId = buildTaskId();
    setTaskId(nextTaskId);
    setIdempotencyKey(buildIdempotencyKey(nextTaskId));
  };

  const applyPreset = (preset: ActionPreset) => {
    const nextTaskId = buildTaskId();
    setPlatform(preset.platform);
    setActionType(preset.actionType);
    setTaskId(nextTaskId);
    setIdempotencyKey(buildIdempotencyKey(nextTaskId));
    setTargetRef(preset.targetRef);
    setLeadRef('');
    setContent(preset.content);
    setMetadataJson(JSON.stringify(preset.metadata, null, 2));
    toast({
      title: `Preset applied: ${preset.label}`,
      description: preset.description,
    });
  };

  const handleSubmit = async () => {
    let metadata: Record<string, unknown> = {};
    try {
      const parsed = JSON.parse(metadataJson || '{}') as unknown;
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
        throw new Error('Metadata must be a JSON object.');
      }
      metadata = parsed as Record<string, unknown>;
    } catch (error) {
      toast({
        title: 'Invalid metadata JSON',
        description: error instanceof Error ? error.message : 'Could not parse metadata',
        variant: 'destructive',
      });
      return;
    }

    const payload: ApiExecuteTaskRequest = {
      version: 'v1',
      task_id: taskId.trim(),
      idempotency_key: idempotencyKey.trim(),
      platform,
      action_type: actionType,
      target_ref: targetRef.trim(),
      lead_ref: leadRef.trim() || null,
      content: content.trim() || null,
      metadata,
    };

    if (!payload.task_id || !payload.idempotency_key || !payload.target_ref || !payload.action_type) {
      toast({
        title: 'Missing required fields',
        description: 'task_id, idempotency_key, target_ref, and action_type are required.',
        variant: 'destructive',
      });
      return;
    }

    setSubmitting(true);
    try {
      const response = await apiClient.socialExecution.executeTask(payload);
      setLastResponse(response);
      setLastExecuteError(null);
      toast({
        title: 'Execution request submitted',
        description: `Status: ${response.status}${response.reason_code ? ` (${response.reason_code})` : ''}`,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unable to execute social task';
      setLastExecuteError(message);
      toast({
        title: 'Execution failed',
        description: message,
        variant: 'destructive',
      });
    } finally {
      setSubmitting(false);
    }
  };

  const authErrorDetected = useMemo(() => {
    const combined = `${lastLoadError || ''} ${lastExecuteError || ''}`.toLowerCase();
    return combined.includes('unauthorized') || combined.includes('401') || combined.includes('forbidden');
  }, [lastLoadError, lastExecuteError]);

  return (
    <div className="space-y-6 max-w-5xl">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold text-foreground">Social Actions Engine</h2>
          <p className="text-sm text-muted-foreground">
            Execute supported social actions through connected Instagram, Facebook, and WhatsApp integrations.
          </p>
        </div>
        <Button variant="outline" onClick={handleRefresh} disabled={loading}>
          {loading ? 'Refreshing...' : 'Refresh Capabilities'}
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Auth Setup Helper</CardTitle>
          <CardDescription>
            Service auth status and quick guidance for loading capabilities and executing tasks.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          <div className="flex items-center gap-2">
            <span>Frontend service token:</span>
            <Badge variant={hasFrontendServiceToken ? 'default' : 'secondary'}>
              {hasFrontendServiceToken ? 'Configured' : 'Missing'}
            </Badge>
          </div>
          {!hasFrontendServiceToken && (
            <p className="text-muted-foreground">
              Add `VITE_DO_SOCIALS_AUTH_BEARER_TOKEN` to your frontend environment and restart the frontend dev server.
            </p>
          )}
          {authErrorDetected && (
            <div className="rounded-md border border-destructive/30 bg-destructive/5 p-3 space-y-1">
              <p className="font-medium text-foreground">Auth error detected from API response.</p>
              <p className="text-muted-foreground">
                Ensure backend `DO_SOCIALS_AUTH_BEARER_TOKEN` matches frontend `VITE_DO_SOCIALS_AUTH_BEARER_TOKEN`,
                or disable service auth only in local development.
              </p>
            </div>
          )}
          {lastLoadError && <p className="text-muted-foreground">Last capability error: {lastLoadError}</p>}
          {lastExecuteError && <p className="text-muted-foreground">Last execute error: {lastExecuteError}</p>}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Methodical Rollout Status</CardTitle>
          <CardDescription>What is possible now, what remains to connect, and what remains to build.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-3 md:grid-cols-3">
            {ALL_PLATFORMS.map((p) => {
              const matrix = matrices[p];
              const connected = connectedProviders[p] === 'connected';
              const supportedCount = supportedActions(matrix).length;
              const unsupportedCount = unsupportedActions(matrix).length;
              return (
                <Card key={p}>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm flex items-center justify-between">
                      {PLATFORM_LABELS[p]}
                      <Badge variant={connected ? 'default' : 'secondary'}>
                        {connected ? 'Connected' : 'Not connected'}
                      </Badge>
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="text-xs text-muted-foreground space-y-1">
                    <p>Supported now: {supportedCount}</p>
                    <p>Not supported yet: {unsupportedCount}</p>
                  </CardContent>
                </Card>
              );
            })}
          </div>

          <div className="space-y-2">
            <Label className="text-sm">Remaining to connect</Label>
            {remainingToConnect.length ? (
              <div className="flex flex-wrap gap-2">
                {remainingToConnect.map((p) => (
                  <Badge key={p} variant="secondary">
                    Connect {PLATFORM_LABELS[p]}
                  </Badge>
                ))}
              </div>
            ) : (
              <p className="text-xs text-muted-foreground">All platforms with supported actions are connected.</p>
            )}
          </div>

          <div className="space-y-2">
            <Label className="text-sm">Remaining to build (unsupported actions)</Label>
            {remainingToBuild.length ? (
              <div className="flex flex-wrap gap-2">
                {remainingToBuild.map((row) => (
                  <Badge key={`${row.platform}:${row.action}`} variant="outline">
                    {PLATFORM_LABELS[row.platform]}: {row.action}
                  </Badge>
                ))}
              </div>
            ) : (
              <p className="text-xs text-muted-foreground">No unsupported actions in current matrices.</p>
            )}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Execute Action</CardTitle>
          <CardDescription>Submits `POST /api/content-ops/social-execution/execute-task` with v1 contract.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label>Quick presets</Label>
            <div className="flex flex-wrap gap-2">
              {ACTION_PRESETS.map((preset) => (
                <Button
                  key={preset.id}
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => applyPreset(preset)}
                >
                  {preset.label}
                </Button>
              ))}
            </div>
            <p className="text-xs text-muted-foreground">
              Presets populate platform, action, target, content, and metadata JSON. Replace sample IDs before execution.
            </p>
          </div>

          <div className="grid gap-3 md:grid-cols-2">
            <div>
              <Label>Platform</Label>
              <Select value={platform} onValueChange={(value) => setPlatform(value as Platform)}>
                <SelectTrigger className="bg-secondary/50">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {ALL_PLATFORMS.map((p) => (
                    <SelectItem key={p} value={p}>
                      {PLATFORM_LABELS[p]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label>Action</Label>
              <Select value={actionType} onValueChange={setActionType} disabled={!selectableActions.length}>
                <SelectTrigger className="bg-secondary/50">
                  <SelectValue placeholder="Select action" />
                </SelectTrigger>
                <SelectContent>
                  {selectableActions.map((action) => {
                    const actionInfo = (activeMatrix?.actions || []).find((entry) => entry.action_type === action);
                    const label = actionInfo?.supported ? `${action} (supported)` : `${action} (unsupported)`;
                    return (
                      <SelectItem key={action} value={action}>
                        {label}
                      </SelectItem>
                    );
                  })}
                </SelectContent>
              </Select>
            </div>
          </div>

          {selectedAction && (
            <div className="rounded-md border border-border p-3 bg-secondary/20 space-y-2 text-xs">
              <div className="flex items-center gap-2">
                <Badge variant={selectedAction.supported ? 'default' : 'secondary'}>
                  {selectedAction.supported ? 'Supported' : 'Unsupported'}
                </Badge>
                {selectedAction.reason_code_when_unsupported && (
                  <Badge variant="outline">{selectedAction.reason_code_when_unsupported}</Badge>
                )}
              </div>
              <p className="text-muted-foreground">
                Endpoints: {selectedAction.api_endpoints.length ? selectedAction.api_endpoints.join(', ') : 'N/A'}
              </p>
              <p className="text-muted-foreground">
                Required scopes:{' '}
                {selectedAction.required_scopes.length ? selectedAction.required_scopes.join(', ') : 'N/A'}
              </p>
              <p className="text-muted-foreground">Fallback: {selectedAction.fallback_behavior}</p>
            </div>
          )}

          <div className="grid gap-3 md:grid-cols-2">
            <div>
              <Label>Task ID</Label>
              <Input value={taskId} onChange={(e) => setTaskId(e.target.value)} className="bg-secondary/50" />
            </div>
            <div>
              <Label>Idempotency Key</Label>
              <Input
                value={idempotencyKey}
                onChange={(e) => setIdempotencyKey(e.target.value)}
                className="bg-secondary/50"
              />
            </div>
          </div>

          <Button variant="outline" size="sm" onClick={regenerateIds}>
            Regenerate task + idempotency IDs
          </Button>

          <div className="grid gap-3 md:grid-cols-2">
            <div>
              <Label>Target Ref *</Label>
              <Input value={targetRef} onChange={(e) => setTargetRef(e.target.value)} className="bg-secondary/50" />
            </div>
            <div>
              <Label>Lead Ref (optional)</Label>
              <Input value={leadRef} onChange={(e) => setLeadRef(e.target.value)} className="bg-secondary/50" />
            </div>
          </div>

          <div>
            <Label>Content</Label>
            <Textarea
              value={content}
              onChange={(e) => setContent(e.target.value)}
              className="bg-secondary/50"
              placeholder="Message/comment/reply content"
              rows={3}
            />
          </div>

          <div>
            <Label>Metadata (JSON)</Label>
            <Textarea
              value={metadataJson}
              onChange={(e) => setMetadataJson(e.target.value)}
              className="bg-secondary/50 font-mono text-xs"
              rows={6}
            />
          </div>

          <Button onClick={handleSubmit} disabled={submitting || loading}>
            {submitting ? 'Submitting...' : 'Execute Task'}
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Last Execution Response</CardTitle>
          <CardDescription>Latest response from DO-Socials execution API.</CardDescription>
        </CardHeader>
        <CardContent>
          {lastResponse ? (
            <pre className="bg-secondary/50 rounded-md p-3 text-xs overflow-auto">
              {JSON.stringify(lastResponse, null, 2)}
            </pre>
          ) : (
            <p className="text-sm text-muted-foreground">No execution submitted yet.</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
};
