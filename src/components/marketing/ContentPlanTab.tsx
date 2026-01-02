import React, { useState, useRef, useMemo } from 'react';
import { useContentOps } from '@/contexts/ContentOpsContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { ContentItemDrawer } from './ContentItemDrawer';
import { NewContentModal } from './NewContentModal';
import { Plus, Search, LayoutGrid, List, Filter, MoreHorizontal, Trash2, Edit } from 'lucide-react';
import type { ContentItem, ContentStatus, ContentPillar, ContentFormat } from '@/types/content-ops';

interface ContentPlanTabProps {
  showNewModal: boolean;
  onCloseNewModal: () => void;
  searchInputRef: React.RefObject<HTMLInputElement>;
}

const statusColors: Record<ContentStatus, string> = {
  draft: 'bg-status-draft/20 text-status-draft border-status-draft/30',
  ready: 'bg-status-ready/20 text-status-ready border-status-ready/30',
  scheduled: 'bg-status-scheduled/20 text-status-scheduled border-status-scheduled/30',
  posted: 'bg-status-posted/20 text-status-posted border-status-posted/30',
  repurpose: 'bg-status-repurpose/20 text-status-repurpose border-status-repurpose/30',
  archived: 'bg-status-archived/20 text-status-archived border-status-archived/30',
};

const priorityLabels: Record<number, { label: string; color: string }> = {
  1: { label: 'High', color: 'text-priority-high' },
  2: { label: 'Normal', color: 'text-priority-normal' },
  3: { label: 'Low', color: 'text-priority-low' },
};

export const ContentPlanTab: React.FC<ContentPlanTabProps> = ({
  showNewModal,
  onCloseNewModal,
  searchInputRef,
}) => {
  const { getContentItems, deleteContentItem } = useContentOps();
  const [viewMode, setViewMode] = useState<'table' | 'kanban'>('table');
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [pillarFilter, setPillarFilter] = useState<string>('all');
  const [formatFilter, setFormatFilter] = useState<string>('all');
  const [selectedItemId, setSelectedItemId] = useState<string | null>(null);
  const [showNewModalLocal, setShowNewModalLocal] = useState(false);
  
  const contentItems = getContentItems();
  
  const filteredItems = useMemo(() => {
    return contentItems.filter(item => {
      const matchesSearch = !search || 
        item.title.toLowerCase().includes(search.toLowerCase()) ||
        item.hook?.toLowerCase().includes(search.toLowerCase());
      const matchesStatus = statusFilter === 'all' || item.status === statusFilter;
      const matchesPillar = pillarFilter === 'all' || item.pillar === pillarFilter;
      const matchesFormat = formatFilter === 'all' || item.format === formatFilter;
      
      return matchesSearch && matchesStatus && matchesPillar && matchesFormat;
    });
  }, [contentItems, search, statusFilter, pillarFilter, formatFilter]);
  
  const groupedByStatus = useMemo(() => {
    const groups: Record<ContentStatus, ContentItem[]> = {
      draft: [],
      ready: [],
      scheduled: [],
      posted: [],
      repurpose: [],
      archived: [],
    };
    
    filteredItems.forEach(item => {
      groups[item.status].push(item);
    });
    
    return groups;
  }, [filteredItems]);
  
  const handleRowClick = (item: ContentItem) => {
    setSelectedItemId(item.id);
  };
  
  const handleDelete = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    deleteContentItem(id);
  };
  
  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center justify-between">
        <div className="flex flex-wrap gap-2 items-center">
          {/* Search */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              ref={searchInputRef}
              placeholder="Search content..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9 w-64 bg-secondary/50"
            />
          </div>
          
          {/* Filters */}
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-32 bg-secondary/50">
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Status</SelectItem>
              <SelectItem value="draft">Draft</SelectItem>
              <SelectItem value="ready">Ready</SelectItem>
              <SelectItem value="scheduled">Scheduled</SelectItem>
              <SelectItem value="posted">Posted</SelectItem>
              <SelectItem value="repurpose">Repurpose</SelectItem>
              <SelectItem value="archived">Archived</SelectItem>
            </SelectContent>
          </Select>
          
          <Select value={pillarFilter} onValueChange={setPillarFilter}>
            <SelectTrigger className="w-32 bg-secondary/50">
              <SelectValue placeholder="Pillar" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Pillars</SelectItem>
              <SelectItem value="product">Product</SelectItem>
              <SelectItem value="educational">Educational</SelectItem>
              <SelectItem value="proof">Proof</SelectItem>
              <SelectItem value="meme">Meme</SelectItem>
              <SelectItem value="offer">Offer</SelectItem>
            </SelectContent>
          </Select>
          
          <Select value={formatFilter} onValueChange={setFormatFilter}>
            <SelectTrigger className="w-32 bg-secondary/50">
              <SelectValue placeholder="Format" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Formats</SelectItem>
              <SelectItem value="post">Post</SelectItem>
              <SelectItem value="reel">Reel</SelectItem>
              <SelectItem value="short">Short</SelectItem>
              <SelectItem value="carousel">Carousel</SelectItem>
              <SelectItem value="article">Article</SelectItem>
              <SelectItem value="ad">Ad</SelectItem>
            </SelectContent>
          </Select>
        </div>
        
        <div className="flex gap-2">
          {/* View Toggle */}
          <div className="flex border border-border rounded-md overflow-hidden">
            <Button
              variant={viewMode === 'table' ? 'default' : 'ghost'}
              size="sm"
              onClick={() => setViewMode('table')}
              className="rounded-none"
            >
              <List className="h-4 w-4" />
            </Button>
            <Button
              variant={viewMode === 'kanban' ? 'default' : 'ghost'}
              size="sm"
              onClick={() => setViewMode('kanban')}
              className="rounded-none"
            >
              <LayoutGrid className="h-4 w-4" />
            </Button>
          </div>
          
          {/* Add Button */}
          <Button onClick={() => setShowNewModalLocal(true)} className="glow-primary">
            <Plus className="h-4 w-4 mr-2" />
            New Content
          </Button>
        </div>
      </div>
      
      {/* Table View */}
      {viewMode === 'table' && (
        <div className="border border-border rounded-lg overflow-hidden bg-card">
          <Table>
            <TableHeader>
              <TableRow className="bg-secondary/30 hover:bg-secondary/30">
                <TableHead className="w-12">#</TableHead>
                <TableHead>Title</TableHead>
                <TableHead className="w-24">Status</TableHead>
                <TableHead className="w-24">Pillar</TableHead>
                <TableHead className="w-24">Format</TableHead>
                <TableHead className="w-20">Priority</TableHead>
                <TableHead className="w-28">Created</TableHead>
                <TableHead className="w-12"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredItems.map((item, index) => (
                <TableRow 
                  key={item.id} 
                  className="cursor-pointer hover:bg-secondary/20 transition-colors"
                  onClick={() => handleRowClick(item)}
                >
                  <TableCell className="text-muted-foreground font-mono text-xs">
                    {index + 1}
                  </TableCell>
                  <TableCell>
                    <div>
                      <p className="font-medium text-foreground">{item.title}</p>
                      {item.hook && (
                        <p className="text-sm text-muted-foreground truncate max-w-md">
                          {item.hook}
                        </p>
                      )}
                    </div>
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline" className={statusColors[item.status]}>
                      {item.status}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    {item.pillar && (
                      <span className="text-sm capitalize text-muted-foreground">
                        {item.pillar}
                      </span>
                    )}
                  </TableCell>
                  <TableCell>
                    {item.format && (
                      <span className="text-sm capitalize text-muted-foreground">
                        {item.format}
                      </span>
                    )}
                  </TableCell>
                  <TableCell>
                    <span className={`text-sm font-medium ${priorityLabels[item.priority].color}`}>
                      {priorityLabels[item.priority].label}
                    </span>
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {item.createdAt.toLocaleDateString()}
                  </TableCell>
                  <TableCell>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
                        <Button variant="ghost" size="icon" className="h-8 w-8">
                          <MoreHorizontal className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={(e) => { e.stopPropagation(); setSelectedItemId(item.id); }}>
                          <Edit className="h-4 w-4 mr-2" />
                          Edit
                        </DropdownMenuItem>
                        <DropdownMenuItem 
                          onClick={(e) => handleDelete(item.id, e)}
                          className="text-destructive"
                        >
                          <Trash2 className="h-4 w-4 mr-2" />
                          Delete
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              ))}
              {filteredItems.length === 0 && (
                <TableRow>
                  <TableCell colSpan={8} className="text-center py-8 text-muted-foreground">
                    No content items found
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      )}
      
      {/* Kanban View */}
      {viewMode === 'kanban' && (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
          {(Object.keys(groupedByStatus) as ContentStatus[]).map(status => (
            <div key={status} className="space-y-2">
              <div className="flex items-center gap-2 px-2">
                <Badge variant="outline" className={statusColors[status]}>
                  {status}
                </Badge>
                <span className="text-xs text-muted-foreground">
                  {groupedByStatus[status].length}
                </span>
              </div>
              <div className="space-y-2 min-h-[200px]">
                {groupedByStatus[status].map(item => (
                  <div
                    key={item.id}
                    className="p-3 bg-card border border-border rounded-lg cursor-pointer hover:border-primary/50 hover:bg-secondary/20 transition-all"
                    onClick={() => handleRowClick(item)}
                  >
                    <p className="font-medium text-sm text-foreground line-clamp-2">
                      {item.title}
                    </p>
                    <div className="flex items-center gap-2 mt-2">
                      {item.pillar && (
                        <span className="text-xs text-muted-foreground capitalize">
                          {item.pillar}
                        </span>
                      )}
                      <span className={`text-xs ${priorityLabels[item.priority].color}`}>
                        P{item.priority}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
      
      {/* Modals/Drawers */}
      <ContentItemDrawer
        itemId={selectedItemId}
        open={!!selectedItemId}
        onClose={() => setSelectedItemId(null)}
      />
      
      <NewContentModal
        open={showNewModal || showNewModalLocal}
        onClose={() => {
          onCloseNewModal();
          setShowNewModalLocal(false);
        }}
      />
    </div>
  );
};
