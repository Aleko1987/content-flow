import React from 'react';
import { Badge } from '@/components/ui/badge';
import { PLATFORMS, type ScheduledPost } from '@/types/scheduled-post';
import { Image, Film, Trash2 } from 'lucide-react';
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

interface ScheduledPostCardProps {
  post: ScheduledPost;
  onClick: () => void;
  onDelete?: () => void;
  draggable?: boolean;
  onDragStart?: (e: React.DragEvent) => void;
}

export const ScheduledPostCard: React.FC<ScheduledPostCardProps> = ({
  post,
  onClick,
  onDelete,
  draggable = true,
  onDragStart,
}) => {
  const hasMedia = post.media.length > 0;
  const hasImage = post.media.some(m => m.type === 'image');
  const hasVideo = post.media.some(m => m.type === 'video');

  return (
    <div
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
      draggable={draggable}
      onDragStart={onDragStart}
      className="p-1.5 bg-card border border-border rounded text-xs cursor-pointer hover:border-primary transition-colors group"
    >
      <div className="flex items-center justify-between gap-1 mb-1">
        <div className="flex items-center gap-1">
          <span className="font-medium text-foreground">{post.scheduledTime}</span>
          {hasMedia && (
            <span className="text-muted-foreground">
              {hasImage && <Image className="h-3 w-3 inline" />}
              {hasVideo && <Film className="h-3 w-3 inline ml-0.5" />}
            </span>
          )}
        </div>
        {onDelete && (
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <button
                type="button"
                className="text-muted-foreground hover:text-destructive transition-colors"
                onMouseDown={(e) => { e.stopPropagation(); }}
                onClick={(e) => { e.stopPropagation(); }}
                draggable={false}
                aria-label="Delete scheduled post"
                title="Delete"
              >
                <Trash2 className="h-3 w-3" />
              </button>
            </AlertDialogTrigger>
            <AlertDialogContent onClick={(e) => { e.stopPropagation(); }}>
              <AlertDialogHeader>
                <AlertDialogTitle>Delete appointment?</AlertDialogTitle>
                <AlertDialogDescription>
                  This will permanently remove the scheduled post.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction onClick={onDelete}>Delete</AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        )}
      </div>
      {post.platforms.length > 0 && (
        <div className="flex flex-wrap gap-0.5">
          {post.platforms.slice(0, 3).map(p => {
            const platform = PLATFORMS.find(pl => pl.key === p);
            return (
              <span key={p} className="text-[10px]" title={platform?.label}>
                {platform?.icon}
              </span>
            );
          })}
          {post.platforms.length > 3 && (
            <span className="text-[10px] text-muted-foreground">+{post.platforms.length - 3}</span>
          )}
        </div>
      )}
      {post.caption && (
        <p className="text-muted-foreground truncate mt-0.5">{post.caption.slice(0, 30)}</p>
      )}
    </div>
  );
};
