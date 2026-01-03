import React, { useState } from 'react';
import { useContentOps } from '@/contexts/ContentOpsContext';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import type { ContentPillar, ContentFormat, Priority } from '@/types/content-ops';

interface NewContentModalProps {
  open: boolean;
  onClose: () => void;
}

export const NewContentModal: React.FC<NewContentModalProps> = ({ open, onClose }) => {
  const { createContentItem } = useContentOps();
  
  const [formData, setFormData] = useState({
    title: '',
    hook: '',
    pillar: '' as ContentPillar | '',
    format: '' as ContentFormat | '',
    priority: '2',
    notes: '',
  });
  
  const handleSubmit = async () => {
    if (!formData.title.trim()) return;
    
    try {
      await createContentItem({
        title: formData.title,
        hook: formData.hook || null,
        pillar: formData.pillar || null,
        format: formData.format || null,
        priority: parseInt(formData.priority) as Priority,
        notes: formData.notes || null,
      });
      
      // Reset form
      setFormData({
        title: '',
        hook: '',
        pillar: '',
        format: '',
        priority: '2',
        notes: '',
      });
      
      onClose();
    } catch (error) {
      // Error handled by context toast
    }
  };
  
  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>New Content Item</DialogTitle>
        </DialogHeader>
        
        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label htmlFor="new-title">Title *</Label>
            <Input
              id="new-title"
              value={formData.title}
              onChange={(e) => setFormData(prev => ({ ...prev, title: e.target.value }))}
              placeholder="Content title..."
              className="bg-secondary/50"
              autoFocus
            />
          </div>
          
          <div className="space-y-2">
            <Label htmlFor="new-hook">Hook</Label>
            <Input
              id="new-hook"
              value={formData.hook}
              onChange={(e) => setFormData(prev => ({ ...prev, hook: e.target.value }))}
              placeholder="Attention-grabbing hook..."
              className="bg-secondary/50"
            />
          </div>
          
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Pillar</Label>
              <Select
                value={formData.pillar}
                onValueChange={(value) => setFormData(prev => ({ ...prev, pillar: value as ContentPillar }))}
              >
                <SelectTrigger className="bg-secondary/50">
                  <SelectValue placeholder="Select" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="product">Product</SelectItem>
                  <SelectItem value="educational">Educational</SelectItem>
                  <SelectItem value="proof">Proof</SelectItem>
                  <SelectItem value="meme">Meme</SelectItem>
                  <SelectItem value="offer">Offer</SelectItem>
                </SelectContent>
              </Select>
            </div>
            
            <div className="space-y-2">
              <Label>Format</Label>
              <Select
                value={formData.format}
                onValueChange={(value) => setFormData(prev => ({ ...prev, format: value as ContentFormat }))}
              >
                <SelectTrigger className="bg-secondary/50">
                  <SelectValue placeholder="Select" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="post">Post</SelectItem>
                  <SelectItem value="reel">Reel</SelectItem>
                  <SelectItem value="short">Short</SelectItem>
                  <SelectItem value="carousel">Carousel</SelectItem>
                  <SelectItem value="article">Article</SelectItem>
                  <SelectItem value="ad">Ad</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          
          <div className="space-y-2">
            <Label>Priority</Label>
            <Select
              value={formData.priority}
              onValueChange={(value) => setFormData(prev => ({ ...prev, priority: value }))}
            >
              <SelectTrigger className="bg-secondary/50">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="1">High</SelectItem>
                <SelectItem value="2">Normal</SelectItem>
                <SelectItem value="3">Low</SelectItem>
              </SelectContent>
            </Select>
          </div>
          
          <div className="space-y-2">
            <Label htmlFor="new-notes">Notes</Label>
            <Textarea
              id="new-notes"
              value={formData.notes}
              onChange={(e) => setFormData(prev => ({ ...prev, notes: e.target.value }))}
              placeholder="Additional notes..."
              className="bg-secondary/50"
            />
          </div>
        </div>
        
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={!formData.title.trim()}
            className="glow-primary"
          >
            Create
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
