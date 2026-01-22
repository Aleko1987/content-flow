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

  return (
    <Sheet open={open} onOpenChange={(o) => !o && onClose()}>
      <SheetContent className="w-full sm:max-w-lg overflow-y-auto">
        <SheetHeader>
          <SheetTitle>{post ? 'Edit Scheduled Post' : 'New Scheduled Post'}</SheetTitle>
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
          {post && (
            <Button variant="destructive" onClick={handleDelete} className="mr-auto">
              <Trash2 className="h-4 w-4 mr-1" /> Delete
            </Button>
          )}
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={handleSave} disabled={saving}>{saving ? 'Saving...' : 'Save'}</Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
};
