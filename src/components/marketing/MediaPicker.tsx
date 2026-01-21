import React, { useState, useEffect } from 'react';
import { apiClient } from '@/lib/api-client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Progress } from '@/components/ui/progress';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Upload, X, Image as ImageIcon } from 'lucide-react';
import type { MediaAsset } from '@/types/content-ops';

interface PresignResponse {
  uploadUrl: string;
  objectKey: string;
  bucket: string;
  publicUrl: string;
}

interface MediaPickerProps {
  value: string | null;
  onChange: (mediaAssetId: string | null) => void;
  mimeType?: string;
}

export const MediaPicker: React.FC<MediaPickerProps> = ({ value, onChange, mimeType }) => {
  const [showDialog, setShowDialog] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [assets, setAssets] = useState<MediaAsset[]>([]);
  const [search, setSearch] = useState('');
  const [selectedAsset, setSelectedAsset] = useState<MediaAsset | null>(null);

  useEffect(() => {
    if (showDialog) {
      loadAssets();
    }
  }, [showDialog]);

  useEffect(() => {
    if (value && assets.length > 0) {
      const asset = assets.find(a => a.id === value);
      setSelectedAsset(asset || null);
    } else {
      setSelectedAsset(null);
    }
  }, [value, assets]);

  const loadAssets = async () => {
    try {
      const params: Record<string, string> = {};
      if (search) params.search = search;
      if (mimeType) params.type = mimeType.split('/')[0]; // image, video, etc.
      const data = await apiClient.mediaAssets.getAll(params) as MediaAsset[];
      setAssets(data);
    } catch (error) {
      console.error('Failed to load assets:', error);
    }
  };

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploading(true);
    setUploadProgress(0);

    try {
      // Get presigned URL
      const presignData = await apiClient.mediaAssets.presign({
        filename: file.name,
        mime_type: file.type,
        size_bytes: file.size,
      }) as PresignResponse;

      // Upload to R2
      const xhr = new XMLHttpRequest();
      await new Promise<void>((resolve, reject) => {
        xhr.upload.addEventListener('progress', (e) => {
          if (e.lengthComputable) {
            setUploadProgress((e.loaded / e.total) * 100);
          }
        });

        xhr.addEventListener('load', () => {
          if (xhr.status === 200) {
            resolve();
          } else {
            reject(new Error(`Upload failed: ${xhr.statusText}`));
          }
        });

        xhr.addEventListener('error', () => reject(new Error('Upload failed')));
        xhr.open('PUT', presignData.uploadUrl);
        xhr.setRequestHeader('Content-Type', file.type);
        xhr.send(file);
      });

      // Complete upload
      const asset = await apiClient.mediaAssets.complete({
        object_key: presignData.objectKey,
        bucket: presignData.bucket,
        mime_type: file.type,
        size_bytes: file.size,
        public_url: presignData.publicUrl,
      }) as MediaAsset;

      setAssets(prev => [asset, ...prev]);
      onChange(asset.id);
      setSelectedAsset(asset);
      setShowDialog(false);
    } catch (error) {
      console.error('Upload failed:', error);
      alert('Upload failed. Please try again.');
    } finally {
      setUploading(false);
      setUploadProgress(0);
      e.target.value = '';
    }
  };

  const handleSelectAsset = (asset: MediaAsset) => {
    onChange(asset.id);
    setSelectedAsset(asset);
    setShowDialog(false);
  };

  const handleRemove = () => {
    onChange(null);
    setSelectedAsset(null);
  };

  return (
    <div className="space-y-2">
      <Label>Media</Label>
      <div className="flex items-center gap-2">
        {selectedAsset ? (
          <>
            <div className="flex-1 flex items-center gap-2 p-2 border border-border rounded bg-secondary/50">
              {selectedAsset.mimeType?.startsWith('image/') ? (
                <ImageIcon className="h-4 w-4 text-muted-foreground" />
              ) : (
                <Upload className="h-4 w-4 text-muted-foreground" />
              )}
              <span className="text-sm flex-1 truncate">
                {selectedAsset.objectKey.split('/').pop()}
              </span>
              {selectedAsset.publicUrl && (
                <a
                  href={selectedAsset.publicUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs text-primary hover:underline"
                >
                  View
                </a>
              )}
            </div>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              onClick={handleRemove}
            >
              <X className="h-4 w-4" />
            </Button>
          </>
        ) : (
          <div className="flex-1 p-2 border border-dashed border-border rounded bg-secondary/50 text-sm text-muted-foreground text-center">
            No media selected
          </div>
        )}
        <Button
          type="button"
          variant="outline"
          onClick={() => setShowDialog(true)}
        >
          <Upload className="h-4 w-4 mr-2" />
          {selectedAsset ? 'Change' : 'Select'}
        </Button>
      </div>

      <Dialog open={showDialog} onOpenChange={setShowDialog}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Media Library</DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            {/* Upload */}
            <div className="space-y-2">
              <Label>Upload New Media</Label>
              <div className="flex items-center gap-2">
                <Input
                  type="file"
                  accept={mimeType || 'image/*,video/*'}
                  onChange={handleFileSelect}
                  disabled={uploading}
                  className="flex-1"
                />
                {uploading && (
                  <div className="w-32">
                    <Progress value={uploadProgress} />
                  </div>
                )}
              </div>
            </div>

            {/* Search */}
            <div className="space-y-2">
              <Label>Search</Label>
              <Input
                placeholder="Search by filename or type..."
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value);
                  // Debounce search
                  setTimeout(() => loadAssets(), 300);
                }}
              />
            </div>

            {/* Asset Grid */}
            <ScrollArea className="h-96">
              <div className="grid grid-cols-3 gap-4">
                {assets.map((asset) => (
                  <div
                    key={asset.id}
                    onClick={() => handleSelectAsset(asset)}
                    className={`p-2 border rounded cursor-pointer hover:border-primary transition-colors ${
                      selectedAsset?.id === asset.id ? 'border-primary bg-primary/10' : ''
                    }`}
                  >
                    {asset.publicUrl && asset.mimeType?.startsWith('image/') ? (
                      <img
                        src={asset.publicUrl}
                        alt={asset.objectKey}
                        className="w-full h-24 object-cover rounded mb-2"
                      />
                    ) : (
                      <div className="w-full h-24 bg-secondary rounded mb-2 flex items-center justify-center">
                        <ImageIcon className="h-8 w-8 text-muted-foreground" />
                      </div>
                    )}
                    <p className="text-xs truncate">{asset.objectKey.split('/').pop()}</p>
                    <p className="text-xs text-muted-foreground">{asset.mimeType}</p>
                  </div>
                ))}
                {assets.length === 0 && (
                  <div className="col-span-3 text-center text-sm text-muted-foreground py-8">
                    No media found. Upload a file to get started.
                  </div>
                )}
              </div>
            </ScrollArea>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};
