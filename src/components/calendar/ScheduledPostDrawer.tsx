import React, { useState, useEffect } from 'react';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetFooter } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { PlatformMultiSelect } from './PlatformMultiSelect';
import { MediaDropzone } from './MediaDropzone';
import { scheduledPostApiService } from '@/services/scheduledPostApiService';
import type { ScheduledPost, Platform, MediaItem } from '@/types/scheduled-post';
import { Trash2 } from 'lucide-react';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';

interface ScheduledPostDrawerProps {
  open: boolean;
  onClose: () => void;
  post: ScheduledPost | null;
  defaultDate?: string;
  defaultTime?: string;
  onSave: () => void;
}

export const ScheduledPostDrawer: React.FC<ScheduledPostDrawerProps> = ({
  open,
  onClose,
  post,
  defaultDate,
  defaultTime = '09:00',
  onSave,
}) => {
  const { toast } = useToast();
  const [date, setDate] = useState(defaultDate || '');
  const [time, setTime] = useState(defaultTime);
  const [caption, setCaption] = useState('');
  const [platforms, setPlatforms] = useState<Platform[]>([]);
  const [media, setMedia] = useState<MediaItem[]>([]);
  const [saving, setSaving] = useState(false);
  const [postingNow, setPostingNow] = useState(false);

  const formatLocalDate = (value: Date) => {
    const year = value.getFullYear();
    const month = String(value.getMonth() + 1).padStart(2, '0');
    const day = String(value.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  };

  const formatLocalTime = (value: Date) => {
    const hours = String(value.getHours()).padStart(2, '0');
    const minutes = String(value.getMinutes()).padStart(2, '0');
    return `${hours}:${minutes}`;
  };

  useEffect(() => {
    if (post) {
      setDate(post.scheduledDate);
      setTime(post.scheduledTime);
      setCaption(post.caption || '');
      setPlatforms(post.platforms);
      setMedia(post.media);
    } else {
      setDate(defaultDate || '');
      setTime(defaultTime);
      setCaption('');
      setPlatforms([]);
      setMedia([]);
    }
  }, [post, defaultDate, defaultTime, open]);

  const handleSave = async () => {
    if (!date || !time) {
      toast({ title: 'Error', description: 'Date and time are required', variant: 'destructive' });
      return;
    }

    setSaving(true);
    try {
      if (post) {
        await scheduledPostApiService.update(post.id, { scheduledDate: date, scheduledTime: time, caption, platforms, media });
        toast({ title: 'Success', description: 'Post updated' });
      } else {
        await scheduledPostApiService.create({ scheduledDate: date, scheduledTime: time, caption, platforms, media });
        toast({ title: 'Success', description: 'Post scheduled' });
      }
      onSave();
      onClose();
    } catch (error) {
      console.error('Save failed:', error);
      toast({ title: 'Error', description: 'Failed to save', variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!post) return;
    try {
      await scheduledPostApiService.remove(post.id);
      toast({ title: 'Deleted', description: 'Post removed' });
      onSave();
      onClose();
    } catch (error) {
      console.error('Delete failed:', error);
      toast({ title: 'Error', description: 'Failed to delete', variant: 'destructive' });
    }
  };

  const handlePostNow = async () => {
    if (!post) return;
    setPostingNow(true);
    try {
      const now = new Date();
      const scheduledDate = formatLocalDate(now);
      const scheduledTime = formatLocalTime(now);
      await scheduledPostApiService.update(post.id, { scheduledDate, scheduledTime });
      const result = await scheduledPostApiService.executeNow(post.id);
      if (result.status === 'failed') {
        toast({ title: 'Failed to post', description: 'Publish failed. Check Render logs for details.', variant: 'destructive' });
        return;
      }
      const canonicalUrl = result.results?.find(r => r.canonicalUrl)?.canonicalUrl;
      toast({
        title: 'Posted',
        description: canonicalUrl ? `Published: ${canonicalUrl}` : 'Post queued for immediate publishing',
      });
      onSave();
      onClose();
    } catch (error) {
      console.error('Post now failed:', error);
      toast({ title: 'Error', description: 'Failed to post now', variant: 'destructive' });
    } finally {
      setPostingNow(false);
    }
  };

  return (
    <Sheet open={open} onOpenChange={(o) => !o && onClose()}>
      <SheetContent className="w-full sm:max-w-lg overflow-y-auto">
        <SheetHeader>
          <div className="flex items-center justify-between gap-2">
            <SheetTitle>{post ? 'Edit Scheduled Post' : 'New Scheduled Post'}</SheetTitle>
            {post && (
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button variant="destructive" size="sm">
                    <Trash2 className="h-4 w-4 mr-1" /> Delete
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Delete appointment?</AlertDialogTitle>
                    <AlertDialogDescription>
                      This will permanently remove the scheduled post.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction onClick={handleDelete}>Delete</AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            )}
          </div>
        </SheetHeader>

        <div className="space-y-4 py-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Date *</Label>
              <Input type="date" value={date} onChange={e => setDate(e.target.value)} className="bg-secondary/50" />
            </div>
            <div>
              <Label>Time *</Label>
              <Input type="time" value={time} onChange={e => setTime(e.target.value)} className="bg-secondary/50" />
            </div>
          </div>

          <div>
            <Label>Caption / Notes</Label>
            <Textarea value={caption} onChange={e => setCaption(e.target.value)} placeholder="Write your post..." rows={3} className="bg-secondary/50" />
          </div>

          <div>
            <Label>Platforms</Label>
            <PlatformMultiSelect value={platforms} onChange={setPlatforms} />
          </div>

          <div>
            <Label>Media</Label>
            <MediaDropzone value={media} onChange={setMedia} />
          </div>
        </div>

        <SheetFooter className="flex gap-2">
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          {post && (
            <Button variant="secondary" onClick={handlePostNow} disabled={saving || postingNow}>
              {postingNow ? 'Posting...' : 'Post Now'}
            </Button>
          )}
          <Button onClick={handleSave} disabled={saving || postingNow}>
            {saving ? 'Saving...' : 'Save'}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
};
