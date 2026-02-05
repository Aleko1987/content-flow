import React, { useCallback, useState, useEffect } from 'react';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Upload, X, Image as ImageIcon, Film, AlertCircle } from 'lucide-react';
import { FILE_LIMITS, type MediaItem } from '@/types/scheduled-post';
import { cn } from '@/lib/utils';

interface MediaDropzoneProps {
  value: MediaItem[];
  onChange: (media: MediaItem[]) => void;
  disabled?: boolean;
}

// Generate UUID
const generateId = (): string => {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
};

export const MediaDropzone: React.FC<MediaDropzoneProps> = ({
  value,
  onChange,
  disabled = false,
}) => {
  const { toast } = useToast();
  const [isDragging, setIsDragging] = useState(false);

  // Cleanup object URLs on unmount or when media changes
  useEffect(() => {
    return () => {
      value.forEach(item => {
        if (item.localObjectUrl?.startsWith('blob:')) {
          URL.revokeObjectURL(item.localObjectUrl);
        }
      });
    };
  }, [value]);

  const validateFile = (file: File): string | null => {
    const isImage = FILE_LIMITS.ALLOWED_IMAGE_TYPES.includes(file.type);
    const isVideo = FILE_LIMITS.ALLOWED_VIDEO_TYPES.includes(file.type);

    if (!isImage && !isVideo) {
      return `Invalid file type: ${file.type}. Allowed: images (PNG, JPG, WEBP, GIF) and videos (MP4, WebM, MOV)`;
    }

    if (isImage && file.size > FILE_LIMITS.IMAGE_MAX_SIZE) {
      return `Image too large: ${(file.size / 1024 / 1024).toFixed(1)}MB. Maximum: 20MB`;
    }

    if (isVideo && file.size > FILE_LIMITS.VIDEO_MAX_SIZE) {
      return `Video too large: ${(file.size / 1024 / 1024).toFixed(1)}MB. Maximum: 200MB`;
    }

    return null;
  };

  const processFiles = useCallback((files: FileList | File[]) => {
    const fileArray = Array.from(files);
    const newMedia: MediaItem[] = [];
    const errors: string[] = [];

    fileArray.forEach(file => {
      const error = validateFile(file);
      if (error) {
        errors.push(error);
        return;
      }

      const isImage = FILE_LIMITS.ALLOWED_IMAGE_TYPES.includes(file.type);
      
      newMedia.push({
        id: generateId(),
        type: isImage ? 'image' : 'video',
        fileName: file.name,
        mimeType: file.type,
        size: file.size,
        localObjectUrl: URL.createObjectURL(file),
      });
    });

    if (errors.length > 0) {
      toast({
        title: 'Some files were not added',
        description: errors.slice(0, 3).join('\n') + (errors.length > 3 ? `\n...and ${errors.length - 3} more` : ''),
        variant: 'destructive',
      });
    }

    if (newMedia.length > 0) {
      onChange([...value, ...newMedia]);
    }
  }, [value, onChange, toast]);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (disabled) return;
    processFiles(e.dataTransfer.files);
  }, [disabled, processFiles]);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    if (!disabled) {
      setIsDragging(true);
    }
  }, [disabled]);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  }, []);

  const handleFileInput = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      processFiles(e.target.files);
      e.target.value = '';
    }
  }, [processFiles]);

  const removeMedia = useCallback((id: string) => {
    const item = value.find(m => m.id === id);
    if (item?.localObjectUrl?.startsWith('blob:')) {
      URL.revokeObjectURL(item.localObjectUrl);
    }
    onChange(value.filter(m => m.id !== id));
  }, [value, onChange]);

  return (
    <div className="space-y-3">
      {/* Dropzone */}
      <div
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        className={cn(
          'border-2 border-dashed rounded-lg p-6 text-center transition-colors',
          isDragging 
            ? 'border-primary bg-primary/10' 
            : 'border-border hover:border-muted-foreground',
          disabled && 'opacity-50 pointer-events-none'
        )}
      >
        <Upload className="h-8 w-8 mx-auto mb-2 text-muted-foreground" />
        <p className="text-sm text-muted-foreground mb-2">
          Drag and drop images or videos here
        </p>
        <p className="text-xs text-muted-foreground mb-3">
          Images: PNG, JPG, WEBP, GIF (max 20MB) • Videos: MP4, WebM, MOV (max 200MB)
        </p>
        <label>
          <input
            type="file"
            multiple
            accept={[...FILE_LIMITS.ALLOWED_IMAGE_TYPES, ...FILE_LIMITS.ALLOWED_VIDEO_TYPES].join(',')}
            onChange={handleFileInput}
            disabled={disabled}
            className="hidden"
          />
          <Button type="button" variant="outline" size="sm" disabled={disabled} asChild>
            <span>Browse Files</span>
          </Button>
        </label>
      </div>

      {/* Media Preview Grid */}
      {value.length > 0 && (
        <div className="grid grid-cols-3 gap-2">
          {value.map(item => {
            const previewUrl = item.localObjectUrl || item.storageUrl || '';
            return (
            <div
              key={item.id}
              className="relative aspect-square bg-secondary rounded-lg overflow-hidden group"
            >
              {item.type === 'image' ? (
                <img
                  src={previewUrl}
                  alt={item.fileName}
                  className="w-full h-full object-cover"
                />
              ) : (
                <div className="w-full h-full flex flex-col items-center justify-center bg-secondary">
                  <Film className="h-8 w-8 text-muted-foreground mb-1" />
                  <span className="text-xs text-muted-foreground truncate px-2 w-full text-center">
                    {item.fileName}
                  </span>
                </div>
              )}
              
              {/* Type indicator */}
              <div className="absolute top-1 left-1">
                {item.type === 'image' ? (
                  <ImageIcon className="h-4 w-4 text-white drop-shadow" />
                ) : (
                  <Film className="h-4 w-4 text-white drop-shadow" />
                )}
              </div>
              
              {/* Remove button */}
              <button
                type="button"
                onClick={() => removeMedia(item.id)}
                className="absolute top-1 right-1 p-1 bg-destructive/80 rounded-full opacity-0 group-hover:opacity-100 transition-opacity"
              >
                <X className="h-3 w-3 text-white" />
              </button>
              
              {/* File size */}
              <div className="absolute bottom-1 right-1 px-1.5 py-0.5 bg-black/50 rounded text-xs text-white">
                {(item.size / 1024 / 1024).toFixed(1)}MB
              </div>
            </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
