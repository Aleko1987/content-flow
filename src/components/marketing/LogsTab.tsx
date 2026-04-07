import React, { useState, useMemo, useEffect } from 'react';
import { useContentOps } from '@/contexts/ContentOpsContext';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { apiClient, type ApiPostedVideo, type ApiPostedVideosSummary } from '@/lib/api-client';
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
import { Input } from '@/components/ui/input';
import { Download, ExternalLink, Calendar } from 'lucide-react';
import type { ChannelKey } from '@/types/content-ops';

const channelColors: Record<ChannelKey, string> = {
  x: 'bg-channel-x/20 text-channel-x border-channel-x/30',
  instagram: 'bg-channel-instagram/20 text-channel-instagram border-channel-instagram/30',
  facebook: 'bg-channel-facebook/20 text-channel-facebook border-channel-facebook/30',
  linkedin: 'bg-channel-linkedin/20 text-channel-linkedin border-channel-linkedin/30',
  youtube: 'bg-channel-youtube/20 text-channel-youtube border-channel-youtube/30',
  website_blog: 'bg-channel-blog/20 text-channel-blog border-channel-blog/30',
  whatsapp_status: 'bg-green-500/20 text-green-500 border-green-500/30',
};

export const LogsTab: React.FC = () => {
  const { getLogs } = useContentOps();
  const [channelFilter, setChannelFilter] = useState<string>('all');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [postedVideos, setPostedVideos] = useState<ApiPostedVideo[]>([]);
  const [postedSummary, setPostedSummary] = useState<ApiPostedVideosSummary | null>(null);
  
  const logs = getLogs();
  
  const filteredLogs = useMemo(() => {
    return logs.filter(log => {
      const matchesChannel = channelFilter === 'all' || log.task.channelKey === channelFilter;
      const matchesStart = !startDate || new Date(log.postedAt) >= new Date(startDate);
      const matchesEnd = !endDate || new Date(log.postedAt) <= new Date(endDate + 'T23:59:59');
      
      return matchesChannel && matchesStart && matchesEnd;
    }).sort((a, b) => new Date(b.postedAt).getTime() - new Date(a.postedAt).getTime());
  }, [logs, channelFilter, startDate, endDate]);

  useEffect(() => {
    let isMounted = true;
    const loadPostedVideos = async () => {
      try {
        const [rows, summary] = await Promise.all([
          apiClient.postedVideos.getAll({ limit: '20' }),
          apiClient.postedVideos.getSummary(),
        ]);
        if (!isMounted) return;
        setPostedVideos(rows);
        setPostedSummary(summary);
      } catch (error) {
        // Keep the tab usable even if posting history is unavailable.
        console.error('Failed to load posted videos history:', error);
      }
    };

    loadPostedVideos();
    return () => {
      isMounted = false;
    };
  }, []);
  
  const exportToCsv = () => {
    const headers = ['Title', 'Channel', 'Posted At', 'Post URL', 'Reach', 'Clicks', 'Notes'];
    const rows = filteredLogs.map(log => [
      log.contentItem.title,
      log.task.channelKey,
      new Date(log.postedAt).toISOString(),
      log.postUrl || '',
      log.reach?.toString() || '',
      log.clicks?.toString() || '',
      log.notes || '',
    ]);
    
    const csvContent = [
      headers.join(','),
      ...rows.map(row => row.map(cell => `"${cell.replace(/"/g, '""')}"`).join(',')),
    ].join('\n');
    
    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `publish-logs-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };
  
  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center justify-between">
        <div className="flex flex-wrap gap-3 items-center">
          <Select value={channelFilter} onValueChange={setChannelFilter}>
            <SelectTrigger className="w-40 bg-secondary/50">
              <SelectValue placeholder="All Channels" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Channels</SelectItem>
              <SelectItem value="x">X (Twitter)</SelectItem>
              <SelectItem value="instagram">Instagram</SelectItem>
              <SelectItem value="facebook">Facebook</SelectItem>
              <SelectItem value="linkedin">LinkedIn</SelectItem>
              <SelectItem value="youtube">YouTube</SelectItem>
              <SelectItem value="website_blog">Website Blog</SelectItem>
            </SelectContent>
          </Select>
          
          <div className="flex items-center gap-2">
            <Calendar className="h-4 w-4 text-muted-foreground" />
            <Input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="w-36 bg-secondary/50"
              placeholder="Start date"
            />
            <span className="text-muted-foreground">to</span>
            <Input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="w-36 bg-secondary/50"
              placeholder="End date"
            />
          </div>
        </div>
        
        <Button onClick={exportToCsv} variant="outline" className="gap-2">
          <Download className="h-4 w-4" />
          Export CSV
        </Button>
      </div>
      
      {/* Logs Table */}
      <div className="border border-border rounded-lg overflow-hidden bg-card">
        <Table>
          <TableHeader>
            <TableRow className="bg-secondary/30 hover:bg-secondary/30">
              <TableHead>Content</TableHead>
              <TableHead className="w-28">Channel</TableHead>
              <TableHead className="w-36">Posted At</TableHead>
              <TableHead className="w-20">Reach</TableHead>
              <TableHead className="w-20">Clicks</TableHead>
              <TableHead>Post URL</TableHead>
              <TableHead>Notes</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredLogs.map(log => (
              <TableRow key={log.id} className="hover:bg-secondary/20">
                <TableCell>
                  <p className="font-medium text-foreground">{log.contentItem.title}</p>
                </TableCell>
                <TableCell>
                  <Badge variant="outline" className={channelColors[log.task.channelKey]}>
                    {log.task.channelKey}
                  </Badge>
                </TableCell>
                <TableCell className="text-sm text-muted-foreground">
                  {new Date(log.postedAt).toLocaleDateString()}{' '}
                  {new Date(log.postedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </TableCell>
                <TableCell className="text-sm text-muted-foreground font-mono">
                  {log.reach?.toLocaleString() || '-'}
                </TableCell>
                <TableCell className="text-sm text-muted-foreground font-mono">
                  {log.clicks?.toLocaleString() || '-'}
                </TableCell>
                <TableCell>
                  {log.postUrl ? (
                    <a
                      href={log.postUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-sm text-accent hover:underline flex items-center gap-1"
                    >
                      <ExternalLink className="h-3 w-3" />
                      View
                    </a>
                  ) : (
                    <span className="text-sm text-muted-foreground">-</span>
                  )}
                </TableCell>
                <TableCell className="text-sm text-muted-foreground max-w-xs truncate">
                  {log.notes || '-'}
                </TableCell>
              </TableRow>
            ))}
            {filteredLogs.length === 0 && (
              <TableRow>
                <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                  No publish logs found
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
      
      {/* Summary Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="p-4 bg-card border border-border rounded-lg">
          <p className="text-sm text-muted-foreground">Total Posts</p>
          <p className="text-2xl font-bold text-foreground">{filteredLogs.length}</p>
        </div>
        <div className="p-4 bg-card border border-border rounded-lg">
          <p className="text-sm text-muted-foreground">Total Reach</p>
          <p className="text-2xl font-bold text-foreground">
            {filteredLogs.reduce((sum, log) => sum + (log.reach || 0), 0).toLocaleString()}
          </p>
        </div>
        <div className="p-4 bg-card border border-border rounded-lg">
          <p className="text-sm text-muted-foreground">Total Clicks</p>
          <p className="text-2xl font-bold text-foreground">
            {filteredLogs.reduce((sum, log) => sum + (log.clicks || 0), 0).toLocaleString()}
          </p>
        </div>
        <div className="p-4 bg-card border border-border rounded-lg">
          <p className="text-sm text-muted-foreground">Avg. Click Rate</p>
          <p className="text-2xl font-bold text-foreground">
            {(() => {
              const totalReach = filteredLogs.reduce((sum, log) => sum + (log.reach || 0), 0);
              const totalClicks = filteredLogs.reduce((sum, log) => sum + (log.clicks || 0), 0);
              return totalReach > 0 ? `${((totalClicks / totalReach) * 100).toFixed(1)}%` : '-';
            })()}
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="p-4 bg-card border border-border rounded-lg">
          <p className="text-sm text-muted-foreground">Videos Posted (30d)</p>
          <p className="text-2xl font-bold text-foreground">{postedSummary?.totalPostedLast30Days ?? 0}</p>
        </div>
        <div className="p-4 bg-card border border-border rounded-lg">
          <p className="text-sm text-muted-foreground">Top Hook (30d)</p>
          <p className="text-2xl font-bold text-foreground">
            {postedSummary?.hookUsageLast30Days[0]
              ? `hk${postedSummary.hookUsageLast30Days[0].hookNumber} (${postedSummary.hookUsageLast30Days[0].count})`
              : '-'}
          </p>
        </div>
        <div className="p-4 bg-card border border-border rounded-lg">
          <p className="text-sm text-muted-foreground">Top Meat (30d)</p>
          <p className="text-2xl font-bold text-foreground">
            {postedSummary?.meatUsageLast30Days[0]
              ? `m${postedSummary.meatUsageLast30Days[0].meatNumber} (${postedSummary.meatUsageLast30Days[0].count})`
              : '-'}
          </p>
        </div>
        <div className="p-4 bg-card border border-border rounded-lg">
          <p className="text-sm text-muted-foreground">Top CTA (30d)</p>
          <p className="text-2xl font-bold text-foreground">
            {postedSummary?.ctaUsageLast30Days[0]
              ? `cta${postedSummary.ctaUsageLast30Days[0].ctaNumber} (${postedSummary.ctaUsageLast30Days[0].count})`
              : '-'}
          </p>
        </div>
      </div>

      <div className="border border-border rounded-lg overflow-hidden bg-card">
        <Table>
          <TableHeader>
            <TableRow className="bg-secondary/30 hover:bg-secondary/30">
              <TableHead>Filename</TableHead>
              <TableHead className="w-28">Platform</TableHead>
              <TableHead className="w-28">Hook</TableHead>
              <TableHead className="w-24">Meat</TableHead>
              <TableHead className="w-24">CTA</TableHead>
              <TableHead className="w-24">Variant</TableHead>
              <TableHead className="w-44">Posted At</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {postedVideos.map((video) => (
              <TableRow key={video.id} className="hover:bg-secondary/20">
                <TableCell className="font-mono text-xs">{video.filename}</TableCell>
                <TableCell>{video.platform}</TableCell>
                <TableCell>{video.hook_number ?? '-'}</TableCell>
                <TableCell>{video.meat_number ?? '-'}</TableCell>
                <TableCell>{video.cta_number ?? '-'}</TableCell>
                <TableCell>{video.variant ?? '-'}</TableCell>
                <TableCell className="text-sm text-muted-foreground">
                  {new Date(video.posted_at).toLocaleString()}
                </TableCell>
              </TableRow>
            ))}
            {postedVideos.length === 0 && (
              <TableRow>
                <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                  No posted video history found
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
};
