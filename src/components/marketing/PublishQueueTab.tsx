import React, { useState, useMemo } from 'react';
import { useContentOps } from '@/contexts/ContentOpsContext';
import { apiClient } from '@/lib/api-client';
import { useToast } from '@/hooks/use-toast';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Calendar, Clock, GripVertical, ExternalLink, Copy, Check, MessageSquare } from 'lucide-react';
import type { PublishTaskWithDetails, PublishState, ChannelKey } from '@/types/content-ops';

const stateColors: Record<PublishState, string> = {
  todo: 'bg-muted text-muted-foreground',
  scheduled: 'bg-status-scheduled/20 text-status-scheduled',
  posted: 'bg-status-posted/20 text-status-posted',
  skipped: 'bg-status-archived/20 text-status-archived',
};

const channelColors: Record<ChannelKey, string> = {
  x: 'bg-channel-x/20 text-channel-x border-channel-x/30',
  instagram: 'bg-channel-instagram/20 text-channel-instagram border-channel-instagram/30',
  facebook: 'bg-channel-facebook/20 text-channel-facebook border-channel-facebook/30',
  linkedin: 'bg-channel-linkedin/20 text-channel-linkedin border-channel-linkedin/30',
  youtube: 'bg-channel-youtube/20 text-channel-youtube border-channel-youtube/30',
  website_blog: 'bg-channel-blog/20 text-channel-blog border-channel-blog/30',
  whatsapp_status: 'bg-green-500/20 text-green-600 border-green-500/30',
};

export const PublishQueueTab: React.FC = () => {
  const { getTasks, updateTask, createLog, refreshTasks, refreshLogs } = useContentOps();
  const { toast } = useToast();
  const [selectedTask, setSelectedTask] = useState<PublishTaskWithDetails | null>(null);
  const [showLogModal, setShowLogModal] = useState(false);
  const [showWhatsAppGuide, setShowWhatsAppGuide] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);
  const [sendingWhatsAppTaskId, setSendingWhatsAppTaskId] = useState<string | null>(null);
  const [logData, setLogData] = useState({
    postUrl: '',
    notes: '',
    postedAt: new Date().toISOString().slice(0, 16),
    reach: '',
    clicks: '',
  });
  
  const tasks = getTasks();
  
  // Get WhatsApp Status due tasks
  const whatsappDueTasks = useMemo(() => {
    return tasks.filter(
      task => 
        task.channelKey === 'whatsapp_status' &&
        task.state === 'scheduled' &&
        task.scheduledFor &&
        new Date(task.scheduledFor) <= new Date()
    );
  }, [tasks]);
  
  const handleCopy = async (text: string, type: string) => {
    await navigator.clipboard.writeText(text);
    setCopied(type);
    setTimeout(() => setCopied(null), 2000);
  };

  const handleSendWhatsApp = async (task: PublishTaskWithDetails) => {
    setSendingWhatsAppTaskId(task.id);
    try {
      const result = await apiClient.whatsapp.sendStatus(task.id);
      toast({
        title: 'Sent to WhatsApp',
        description: result.messageId ? `Message id: ${result.messageId}` : 'Message sent',
      });
      await Promise.all([refreshTasks(), refreshLogs()]);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to send to WhatsApp';
      toast({ title: 'Error', description: message, variant: 'destructive' });
    } finally {
      setSendingWhatsAppTaskId(null);
    }
  };
  
  const groupedTasks = useMemo(() => {
    const groups: Record<PublishState, PublishTaskWithDetails[]> = {
      todo: [],
      scheduled: [],
      posted: [],
      skipped: [],
    };
    
    tasks.forEach(task => {
      groups[task.state].push(task);
    });
    
    return groups;
  }, [tasks]);
  
  const handleDragStart = (e: React.DragEvent, task: PublishTaskWithDetails) => {
    e.dataTransfer.setData('taskId', task.id);
  };
  
  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
  };
  
  const handleDrop = (e: React.DragEvent, newState: PublishState) => {
    e.preventDefault();
    const taskId = e.dataTransfer.getData('taskId');
    
    if (newState === 'posted') {
      const task = tasks.find(t => t.id === taskId);
      if (task) {
        setSelectedTask(task);
        setShowLogModal(true);
      }
    } else {
      updateTask(taskId, { state: newState }).catch(() => {
        // Error handled by context toast
      });
    }
  };
  
  const handleLogPublish = async () => {
    if (!selectedTask) return;
    
    try {
      await createLog({
        publishTaskId: selectedTask.id,
        postUrl: logData.postUrl || null,
        postedAt: new Date(logData.postedAt),
        reach: logData.reach ? parseInt(logData.reach) : null,
        clicks: logData.clicks ? parseInt(logData.clicks) : null,
        notes: logData.notes || null,
      });
      
      setShowLogModal(false);
      setSelectedTask(null);
      setLogData({ postUrl: '', notes: '', postedAt: new Date().toISOString().slice(0, 16), reach: '', clicks: '' });
    } catch (error) {
      // Error handled by context toast
    }
  };
  
  const handleCardClick = (task: PublishTaskWithDetails) => {
    setSelectedTask(task);
  };
  
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-foreground">Publish Queue</h2>
        <div className="flex items-center gap-2">
          {whatsappDueTasks.length > 0 && (
            <Badge variant="outline" className="bg-green-500/20 text-green-600">
              {whatsappDueTasks.length} WhatsApp Status due
            </Badge>
          )}
          <p className="text-sm text-muted-foreground">
            Drag tasks between columns to update status
          </p>
        </div>
      </div>
      
      {/* WhatsApp Status Due View */}
      {whatsappDueTasks.length > 0 && (
        <div className="border border-border rounded-lg p-4 bg-secondary/20">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-semibold text-foreground">WhatsApp Status - Due Today</h3>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowWhatsAppGuide(true)}
            >
              <MessageSquare className="h-4 w-4 mr-2" />
              Instructions
            </Button>
          </div>
          <p className="text-xs text-muted-foreground mb-4">
            WhatsApp Status is assisted (manual publish). We can message you the caption + media; you still post the status in WhatsApp.
          </p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {whatsappDueTasks.map(task => {
              const variant = task.variant;
              const mediaAsset = variant?.mediaAssetId ? { publicUrl: '' } : null; // TODO: Load media asset
              const alreadySent = !!task.providerRef;
              return (
                <div
                  key={task.id}
                  className="p-4 border border-border rounded-lg bg-card"
                >
                  <div className="flex items-start justify-between mb-3">
                    <div>
                      <p className="font-medium text-sm">{task.contentItem.title}</p>
                      <Badge variant="outline" className="mt-1">
                        {task.channelKey}
                      </Badge>
                      {alreadySent && (
                        <Badge variant="outline" className="mt-1 ml-2 bg-green-500/15 text-green-600 border-green-500/30">
                          Sent
                        </Badge>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={alreadySent || sendingWhatsAppTaskId === task.id}
                        onClick={() => handleSendWhatsApp(task)}
                        title={alreadySent ? 'Already sent' : 'Send caption + media to WhatsApp'}
                      >
                        {alreadySent ? 'Sent to WhatsApp' : (sendingWhatsAppTaskId === task.id ? 'Sending…' : 'Send to WhatsApp')}
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          setSelectedTask(task);
                          setShowLogModal(true);
                        }}
                      >
                        Mark Posted
                      </Button>
                    </div>
                  </div>
                  
                  {variant && (
                    <div className="space-y-2">
                      {variant.mediaAssetId && mediaAsset?.publicUrl && (
                        <div className="mb-2">
                          <img
                            src={mediaAsset.publicUrl}
                            alt="Media"
                            className="w-full h-32 object-cover rounded"
                          />
                        </div>
                      )}
                      {variant.caption && (
                        <div className="flex items-start gap-2">
                          <div className="flex-1 p-2 bg-secondary/50 rounded text-sm">
                            {variant.caption}
                          </div>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => handleCopy(variant.caption || '', 'caption')}
                          >
                            {copied === 'caption' ? (
                              <Check className="h-4 w-4 text-green-600" />
                            ) : (
                              <Copy className="h-4 w-4" />
                            )}
                          </Button>
                        </div>
                      )}
                      {variant.hashtags && (
                        <div className="flex items-center gap-2">
                          <div className="flex-1 p-2 bg-secondary/50 rounded text-sm">
                            {variant.hashtags}
                          </div>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => handleCopy(variant.hashtags || '', 'hashtags')}
                          >
                            {copied === 'hashtags' ? (
                              <Check className="h-4 w-4 text-green-600" />
                            ) : (
                              <Copy className="h-4 w-4" />
                            )}
                          </Button>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
      
      {/* Kanban Board */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {(['todo', 'scheduled', 'posted', 'skipped'] as PublishState[]).map(state => (
          <div
            key={state}
            className="flex flex-col min-h-[400px]"
            onDragOver={handleDragOver}
            onDrop={(e) => handleDrop(e, state)}
          >
            <div className="flex items-center gap-2 mb-3 px-1">
              <Badge variant="outline" className={stateColors[state]}>
                {state}
              </Badge>
              <span className="text-xs text-muted-foreground">
                {groupedTasks[state].length}
              </span>
            </div>
            
            <div className="flex-1 space-y-2 p-2 bg-secondary/20 rounded-lg border border-border min-h-[300px]">
              {groupedTasks[state].map(task => (
                <div
                  key={task.id}
                  draggable
                  onDragStart={(e) => handleDragStart(e, task)}
                  onClick={() => handleCardClick(task)}
                  className="p-3 bg-card border border-border rounded-lg cursor-grab active:cursor-grabbing hover:border-primary/50 transition-all group"
                >
                  <div className="flex items-start gap-2">
                    <GripVertical className="h-4 w-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0 mt-0.5" />
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-sm text-foreground line-clamp-2">
                        {task.contentItem.title}
                      </p>
                      <div className="flex flex-wrap items-center gap-2 mt-2">
                        <Badge variant="outline" className={channelColors[task.channelKey]}>
                          {task.channelKey}
                        </Badge>
                        {task.scheduledFor && (
                          <span className="text-xs text-muted-foreground flex items-center gap-1">
                            <Clock className="h-3 w-3" />
                            {new Date(task.scheduledFor).toLocaleDateString()}
                          </span>
                        )}
                      </div>
                      {task.checklist.length > 0 && (
                        <p className="text-xs text-muted-foreground mt-2">
                          {task.checklist.length} checklist items
                        </p>
                      )}
                    </div>
                  </div>
                </div>
              ))}
              
              {groupedTasks[state].length === 0 && (
                <div className="flex items-center justify-center h-24 text-muted-foreground text-sm">
                  Drop tasks here
                </div>
              )}
            </div>
          </div>
        ))}
      </div>
      
      {/* Task Detail Panel */}
      {selectedTask && !showLogModal && (
        <Dialog open={!!selectedTask} onOpenChange={() => setSelectedTask(null)}>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle>{selectedTask.contentItem.title}</DialogTitle>
            </DialogHeader>
            
            <div className="space-y-4">
              <div className="flex items-center gap-2">
                <Badge variant="outline" className={channelColors[selectedTask.channelKey]}>
                  {selectedTask.channelKey}
                </Badge>
                <Badge variant="outline" className={stateColors[selectedTask.state]}>
                  {selectedTask.state}
                </Badge>
              </div>
              
              {selectedTask.variant && (
                <div className="space-y-2 p-3 bg-secondary/30 rounded-lg">
                  <h4 className="text-sm font-medium text-foreground">Channel Variant</h4>
                  {selectedTask.variant.caption && (
                    <p className="text-sm text-muted-foreground">{selectedTask.variant.caption}</p>
                  )}
                  {selectedTask.variant.hashtags && (
                    <p className="text-xs text-primary">{selectedTask.variant.hashtags}</p>
                  )}
                  {selectedTask.variant.linkUrl && (
                    <a 
                      href={selectedTask.variant.linkUrl} 
                      target="_blank" 
                      rel="noopener noreferrer"
                      className="text-xs text-accent flex items-center gap-1 hover:underline"
                    >
                      <ExternalLink className="h-3 w-3" />
                      {selectedTask.variant.linkUrl}
                    </a>
                  )}
                </div>
              )}
              
              <div className="space-y-2">
                <h4 className="text-sm font-medium text-foreground">Checklist</h4>
                {selectedTask.checklist.length > 0 ? (
                  <ul className="space-y-1">
                    {selectedTask.checklist.map((item, i) => (
                      <li key={i} className="flex items-center gap-2 text-sm text-muted-foreground">
                        <div className="h-4 w-4 border border-border rounded flex-shrink-0" />
                        {item}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-sm text-muted-foreground">No checklist items</p>
                )}
              </div>
              
              <div className="space-y-2">
                <Label>Scheduled For</Label>
                <Input
                  type="datetime-local"
                  value={selectedTask.scheduledFor?.toISOString().slice(0, 16) || ''}
                  onChange={(e) => updateTask(selectedTask.id, { 
                    scheduledFor: e.target.value ? new Date(e.target.value) : null 
                  }).catch(() => {})}
                  className="bg-secondary/50"
                />
              </div>
            </div>
            
            <DialogFooter>
              <Button variant="outline" onClick={() => setSelectedTask(null)}>
                Close
              </Button>
              <Button 
                onClick={() => setShowLogModal(true)}
                className="glow-primary"
              >
                Mark as Posted
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
      
      {/* Log Publish Modal */}
      <Dialog open={showLogModal} onOpenChange={setShowLogModal}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Log Published Post</DialogTitle>
          </DialogHeader>
          
          <div className="space-y-4">
            {selectedTask?.channelKey !== 'whatsapp_status' && (
              <div className="space-y-2">
                <Label htmlFor="postUrl">Post URL</Label>
                <Input
                  id="postUrl"
                  placeholder="https://..."
                  value={logData.postUrl}
                  onChange={(e) => setLogData(prev => ({ ...prev, postUrl: e.target.value }))}
                  className="bg-secondary/50"
                />
              </div>
            )}
            
            <div className="space-y-2">
              <Label htmlFor="postedAt">Posted At</Label>
              <Input
                id="postedAt"
                type="datetime-local"
                value={logData.postedAt}
                onChange={(e) => setLogData(prev => ({ ...prev, postedAt: e.target.value }))}
                className="bg-secondary/50"
              />
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="notes">
                Notes {selectedTask?.channelKey === 'whatsapp_status' && '(required)'}
              </Label>
              <Textarea
                id="notes"
                placeholder={selectedTask?.channelKey === 'whatsapp_status' ? 'e.g., Status posted manually' : 'Any notes about this publish...'}
                value={logData.notes}
                onChange={(e) => setLogData(prev => ({ ...prev, notes: e.target.value }))}
                className="bg-secondary/50"
                required={selectedTask?.channelKey === 'whatsapp_status'}
              />
            </div>
          </div>
          
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowLogModal(false)}>
              Cancel
            </Button>
            <Button onClick={handleLogPublish} className="glow-accent">
              Log Publish
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      
      {/* WhatsApp Instructions Dialog */}
      <Dialog open={showWhatsAppGuide} onOpenChange={setShowWhatsAppGuide}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>WhatsApp Status Posting Instructions</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <ol className="list-decimal list-inside space-y-2 text-sm">
              <li>Open WhatsApp on your phone</li>
              <li>Go to the Status tab</li>
              <li>Tap the camera icon or your profile picture</li>
              <li>Select the media from your gallery (or take a new photo/video)</li>
              <li>Add the caption by tapping the text icon</li>
              <li>Paste the caption and hashtags (use the copy buttons)</li>
              <li>Tap the send button to post your status</li>
              <li>Return here and click "Mark as Posted" to log the publish</li>
            </ol>
            <p className="text-xs text-muted-foreground">
              Note: WhatsApp Status cannot be automated. This workflow helps you post manually and track it.
            </p>
          </div>
          <DialogFooter>
            <Button onClick={() => setShowWhatsAppGuide(false)}>Got it</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};
