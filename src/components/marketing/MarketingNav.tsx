import React from 'react';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Megaphone, LayoutGrid, Send, FileText, Settings, Calendar } from 'lucide-react';

interface MarketingNavProps {
  activeTab: string;
  onTabChange: (tab: string) => void;
}

export const MarketingNav: React.FC<MarketingNavProps> = ({ activeTab, onTabChange }) => {
  return (
    <header className="border-b border-border bg-card/50 backdrop-blur-sm sticky top-0 z-40">
      <div className="container mx-auto px-4 py-3">
        <div className="flex items-center justify-between gap-4">
          {/* Logo / Title */}
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-primary/10 glow-primary">
              <Megaphone className="h-5 w-5 text-primary" />
            </div>
            <div>
              <h1 className="text-lg font-semibold text-foreground">Marketing</h1>
              <p className="text-xs text-muted-foreground">Content Ops</p>
            </div>
          </div>
          
          {/* Navigation Tabs */}
          <Tabs value={activeTab} onValueChange={onTabChange} className="flex-1 max-w-xl">
            <TabsList className="w-full bg-secondary/50 border border-border">
              <TabsTrigger 
                value="content-plan" 
                className="flex items-center gap-2 flex-1 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground"
              >
                <LayoutGrid className="h-4 w-4" />
                <span className="hidden sm:inline">Content Plan</span>
              </TabsTrigger>
              <TabsTrigger 
                value="publish-queue" 
                className="flex items-center gap-2 flex-1 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground"
              >
                <Send className="h-4 w-4" />
                <span className="hidden sm:inline">Queue</span>
              </TabsTrigger>
              <TabsTrigger 
                value="calendar" 
                className="flex items-center gap-2 flex-1 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground"
              >
                <Calendar className="h-4 w-4" />
                <span className="hidden sm:inline">Calendar</span>
              </TabsTrigger>
              <TabsTrigger 
                value="logs"
                className="flex items-center gap-2 flex-1 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground"
              >
                <FileText className="h-4 w-4" />
                <span className="hidden sm:inline">Logs</span>
              </TabsTrigger>
              <TabsTrigger 
                value="settings" 
                className="flex items-center gap-2 flex-1 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground"
              >
                <Settings className="h-4 w-4" />
                <span className="hidden sm:inline">Settings</span>
              </TabsTrigger>
            </TabsList>
          </Tabs>
          
          {/* Keyboard shortcuts hint */}
          <div className="hidden lg:flex items-center gap-2 text-xs text-muted-foreground">
            <kbd className="px-1.5 py-0.5 bg-secondary rounded text-xs font-mono">N</kbd>
            <span>New</span>
            <kbd className="px-1.5 py-0.5 bg-secondary rounded text-xs font-mono">/</kbd>
            <span>Search</span>
          </div>
        </div>
      </div>
    </header>
  );
};
