import React, { useState, useRef, useCallback } from 'react';
import { ContentOpsProvider } from '@/contexts/ContentOpsContext';
import { MarketingNav } from '@/components/marketing/MarketingNav';
import { ContentPlanTab } from '@/components/marketing/ContentPlanTab';
import { PublishQueueTab } from '@/components/marketing/PublishQueueTab';
import { LogsTab } from '@/components/marketing/LogsTab';
import { SettingsTab } from '@/components/marketing/SettingsTab';
import { useKeyboardShortcuts } from '@/hooks/use-keyboard-shortcuts';

const MarketingContent: React.FC = () => {
  const [activeTab, setActiveTab] = useState('content-plan');
  const [showNewContentModal, setShowNewContentModal] = useState(false);
  const searchInputRef = useRef<HTMLInputElement>(null);
  
  const handleNewContent = useCallback(() => {
    setActiveTab('content-plan');
    setShowNewContentModal(true);
  }, []);
  
  const handleFocusSearch = useCallback(() => {
    searchInputRef.current?.focus();
  }, []);
  
  useKeyboardShortcuts({
    'n': handleNewContent,
    '/': handleFocusSearch,
  });
  
  return (
    <div className="min-h-screen bg-background">
      <MarketingNav activeTab={activeTab} onTabChange={setActiveTab} />
      
      <main className="container mx-auto px-4 py-6">
        {activeTab === 'content-plan' && (
          <ContentPlanTab 
            showNewModal={showNewContentModal}
            onCloseNewModal={() => setShowNewContentModal(false)}
            searchInputRef={searchInputRef}
          />
        )}
        {activeTab === 'publish-queue' && <PublishQueueTab />}
        {activeTab === 'logs' && <LogsTab />}
        {activeTab === 'settings' && <SettingsTab />}
      </main>
    </div>
  );
};

const Marketing: React.FC = () => {
  return (
    <ContentOpsProvider>
      <MarketingContent />
    </ContentOpsProvider>
  );
};

export default Marketing;
