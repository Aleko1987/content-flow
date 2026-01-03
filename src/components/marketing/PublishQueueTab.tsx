import React, { useState, useMemo } from 'react';
import { useContentOps } from '@/contexts/ContentOpsContext';
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
import { Calendar, Clock, GripVertical, ExternalLink } from 'lucide-react';
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
};

export const PublishQueueTab: React.FC = () => {
  const { getTasks, updateTask, createLog } = useContentOps();
  const [selectedTask, setSelectedTask] = useState<PublishTaskWithDetails | null>(null);
  const [showLogModal, setShowLogModal] = useState(false);
  const [logData, setLogData] = useState({
    postUrl: '',
    notes: '',
    postedAt: new Date().toISOString().slice(0, 16),
  });
  
  const tasks = getTasks();
  
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
        <p className="text-sm text-muted-foreground">
          Drag tasks between columns to update status
        </p>
      </div>
      
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
            <div className="space-y-2">
              <Label htmlFor="postUrl">Post URL *</Label>
              <Input
                id="postUrl"
                placeholder="https://..."
                value={logData.postUrl}
                onChange={(e) => setLogData(prev => ({ ...prev, postUrl: e.target.value }))}
                className="bg-secondary/50"
              />
            </div>
            
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
              <Label htmlFor="notes">Notes</Label>
              <Textarea
                id="notes"
                placeholder="Any notes about this publish..."
                value={logData.notes}
                onChange={(e) => setLogData(prev => ({ ...prev, notes: e.target.value }))}
                className="bg-secondary/50"
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
    </div>
  );
};
