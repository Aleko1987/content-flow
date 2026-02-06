import React, { useState, useEffect, useCallback, useRef } from 'react';
import { format, startOfMonth, endOfMonth, startOfWeek, endOfWeek, addDays, isSameMonth, isSameDay, addMonths, subMonths, addWeeks, subWeeks } from 'date-fns';
import { Button } from '@/components/ui/button';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { ChevronLeft, ChevronRight, Plus, Loader2 } from 'lucide-react';
import { ScheduledPostCard } from './ScheduledPostCard';
import { ScheduledPostDrawer } from './ScheduledPostDrawer';
import { scheduledPostApiService } from '@/services/scheduledPostApiService';
import type { ScheduledPost } from '@/types/scheduled-post';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';

type ViewMode = 'month' | 'week';

export const CalendarPage: React.FC = () => {
  const { toast } = useToast();
  const [viewMode, setViewMode] = useState<ViewMode>('month');
  const [currentDate, setCurrentDate] = useState(new Date());
  const [posts, setPosts] = useState<ScheduledPost[]>([]);
  const [loading, setLoading] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [selectedPost, setSelectedPost] = useState<ScheduledPost | null>(null);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [draggedPostId, setDraggedPostId] = useState<string | null>(null);
  const processingRef = useRef(false);

  // Calculate visible date range based on view mode
  const getVisibleRange = useCallback(() => {
    if (viewMode === 'month') {
      const start = startOfWeek(startOfMonth(currentDate));
      const end = endOfWeek(endOfMonth(currentDate));
      return { start, end };
    } else {
      const start = startOfWeek(currentDate);
      const end = endOfWeek(currentDate);
      return { start, end };
    }
  }, [currentDate, viewMode]);

  const loadPosts = useCallback(async () => {
    setLoading(true);
    try {
      const { start, end } = getVisibleRange();
      const startStr = format(start, 'yyyy-MM-dd');
      const endStr = format(end, 'yyyy-MM-dd');
      const data = await scheduledPostApiService.getByDateRange(startStr, endStr);
      setPosts(data);
    } catch (error) {
      console.error('Failed to load posts:', error);
      toast({ title: 'Error', description: 'Failed to load scheduled posts', variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  }, [getVisibleRange, toast]);

  useEffect(() => { loadPosts(); }, [loadPosts]);

  useEffect(() => {
    let isMounted = true;

    const tick = async () => {
      if (processingRef.current || !isMounted) return;
      processingRef.current = true;
      try {
        await scheduledPostApiService.processDue();
        await loadPosts();
      } catch (error) {
        console.error('Failed to process due scheduled posts:', error);
      } finally {
        processingRef.current = false;
      }
    };

    tick();
    const intervalId = window.setInterval(tick, 60_000);
    return () => {
      isMounted = false;
      window.clearInterval(intervalId);
    };
  }, [loadPosts]);

  const navigate = (dir: 'prev' | 'next') => {
    if (viewMode === 'month') {
      setCurrentDate(dir === 'prev' ? subMonths(currentDate, 1) : addMonths(currentDate, 1));
    } else {
      setCurrentDate(dir === 'prev' ? subWeeks(currentDate, 1) : addWeeks(currentDate, 1));
    }
  };

  const getCalendarDays = () => {
    const { start, end } = getVisibleRange();
    const days: Date[] = [];
    let day = start;
    while (day <= end) { days.push(day); day = addDays(day, 1); }
    return days;
  };

  const days = getCalendarDays();

  const handleDayClick = (date: Date) => {
    setSelectedDate(format(date, 'yyyy-MM-dd'));
    setSelectedPost(null);
    setDrawerOpen(true);
  };

  const handlePostClick = (post: ScheduledPost) => {
    setSelectedPost(post);
    setSelectedDate(post.scheduledDate);
    setDrawerOpen(true);
  };

  const handlePostDelete = async (post: ScheduledPost) => {
    try {
      await scheduledPostApiService.remove(post.id);
      await loadPosts();
      toast({ title: 'Deleted', description: 'Post removed' });
    } catch (error) {
      console.error('Delete failed:', error);
      toast({ title: 'Error', description: 'Failed to delete', variant: 'destructive' });
    }
  };

  const handleDragStart = (e: React.DragEvent, postId: string) => {
    setDraggedPostId(postId);
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleDrop = async (e: React.DragEvent, date: Date) => {
    e.preventDefault();
    const dateStr = format(date, 'yyyy-MM-dd');
    
    // Handle file drops
    if (e.dataTransfer.files.length > 0) {
      setSelectedDate(dateStr);
      setSelectedPost(null);
      setDrawerOpen(true);
      return;
    }
    
    // Handle post drag
    if (draggedPostId) {
      try {
        await scheduledPostApiService.moveToDate(draggedPostId, dateStr);
        await loadPosts();
        toast({ title: 'Moved', description: 'Post rescheduled' });
      } catch {
        toast({ title: 'Error', description: 'Failed to move', variant: 'destructive' });
      }
      setDraggedPostId(null);
    }
  };

  const handleDragOver = (e: React.DragEvent) => { e.preventDefault(); };

  return (
    <div className="h-[calc(100vh-120px)] flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between mb-4 shrink-0">
        <div className="flex items-center gap-2">
          <Button variant="outline" size="icon" onClick={() => navigate('prev')}><ChevronLeft className="h-4 w-4" /></Button>
          <h2 className="text-lg font-semibold min-w-[200px] text-center">
            {viewMode === 'month' ? format(currentDate, 'MMMM yyyy') : `Week of ${format(startOfWeek(currentDate), 'MMM d, yyyy')}`}
          </h2>
          <Button variant="outline" size="icon" onClick={() => navigate('next')}><ChevronRight className="h-4 w-4" /></Button>
        </div>
        
        <div className="flex items-center gap-3">
          {loading && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
          <ToggleGroup type="single" value={viewMode} onValueChange={(v) => v && setViewMode(v as ViewMode)}>
            <ToggleGroupItem value="month">Month</ToggleGroupItem>
            <ToggleGroupItem value="week">Week</ToggleGroupItem>
          </ToggleGroup>
          <Button onClick={() => { setSelectedDate(format(new Date(), 'yyyy-MM-dd')); setSelectedPost(null); setDrawerOpen(true); }}>
            <Plus className="h-4 w-4 mr-1" /> New Post
          </Button>
        </div>
      </div>

      {/* Day Headers */}
      <div className="grid grid-cols-7 gap-1 mb-1 shrink-0">
        {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(d => (
          <div key={d} className="text-center text-xs font-medium text-muted-foreground py-1">{d}</div>
        ))}
      </div>

      {/* Calendar Grid */}
      <div className={cn('grid grid-cols-7 gap-1 flex-1', viewMode === 'month' ? 'grid-rows-6' : 'grid-rows-1')}>
        {days.map(day => {
          const dateStr = format(day, 'yyyy-MM-dd');
          const dayPosts = posts.filter(p => p.scheduledDate === dateStr).sort((a, b) => a.scheduledTime.localeCompare(b.scheduledTime));
          const isCurrentMonth = isSameMonth(day, currentDate);
          const isToday = isSameDay(day, new Date());

          return (
            <div
              key={dateStr}
              onDrop={(e) => handleDrop(e, day)}
              onDragOver={handleDragOver}
              onClick={() => handleDayClick(day)}
              className={cn(
                'border border-border rounded p-1 cursor-pointer hover:border-primary transition-colors overflow-hidden',
                !isCurrentMonth && 'opacity-40',
                isToday && 'border-primary bg-primary/5'
              )}
            >
              <div className="text-xs font-medium mb-1">{format(day, 'd')}</div>
              <div className="space-y-1 overflow-y-auto max-h-[calc(100%-20px)]">
                {dayPosts.slice(0, viewMode === 'month' ? 3 : 10).map(post => (
                  <ScheduledPostCard
                    key={post.id}
                    post={post}
                    onClick={() => { handlePostClick(post); }}
                    onDelete={() => { handlePostDelete(post); }}
                    onDragStart={(e) => handleDragStart(e, post.id)}
                  />
                ))}
                {viewMode === 'month' && dayPosts.length > 3 && (
                  <div className="text-xs text-muted-foreground text-center">+{dayPosts.length - 3} more</div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      <ScheduledPostDrawer
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        post={selectedPost}
        defaultDate={selectedDate || undefined}
        onSave={loadPosts}
      />
    </div>
  );
};
