'use client';

import { useState } from 'react';
import { LinkedInCredentials, OpenAIConfig, CrawlSession } from '@/types';
import AuthManager from '@/components/auth/AuthManager';
import CrawlHistory from '@/components/crawl/CrawlHistory';
import ConnectionsList from '@/components/connections/ConnectionsList';
import CrawlSettings from '@/components/crawl/CrawlSettings';
import { Network, Settings } from 'lucide-react';

export default function Home() {
  const [credentials, setCredentials] = useState<LinkedInCredentials | null>(null);
  const [, setOpenAIConfig] = useState<OpenAIConfig | null>(null);
  const [selectedSession, setSelectedSession] = useState<CrawlSession | null>(null);
  const [activeTab, setActiveTab] = useState<'connections' | 'settings'>('connections');

  const handleStartCrawl = async (mode: 'first_connections' | 'friends_of_friends') => {
    if (!credentials) {
      alert('Please configure your LinkedIn credentials first.');
      return;
    }

    try {
      // Create new crawl session
      const createResponse = await fetch('/api/crawl/sessions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode }),
      });

      if (!createResponse.ok) {
        throw new Error('Failed to create crawl session');
      }

      const { sessionId } = await createResponse.json();

      // Start the crawl
      const startResponse = await fetch('/api/crawl/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId, credentials }),
      });

      if (!startResponse.ok) {
        throw new Error('Failed to start crawl');
      }

      // Refresh the sessions list by triggering a re-render
      window.location.reload();
    } catch (error) {
      console.error('Error starting crawl:', error);
      alert(`Failed to start crawl: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  };

  const handleDeleteSession = (sessionId: string) => {
    if (selectedSession?.id === sessionId) {
      setSelectedSession(null);
    }
  };

  const isConfigured = credentials && credentials.email && credentials.password;

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white shadow-sm border-b">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center gap-3">
              <Network className="h-8 w-8 text-blue-600" />
              <h1 className="text-xl font-semibold text-gray-900">LinkedIn Job Connection Finder</h1>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setActiveTab('connections')}
                className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
                  activeTab === 'connections'
                    ? 'bg-blue-100 text-blue-700'
                    : 'text-gray-500 hover:text-gray-700 hover:bg-gray-100'
                }`}
              >
                Connections
              </button>
              <button
                onClick={() => setActiveTab('settings')}
                className={`px-4 py-2 rounded-md text-sm font-medium transition-colors flex items-center gap-2 ${
                  activeTab === 'settings'
                    ? 'bg-blue-100 text-blue-700'
                    : 'text-gray-500 hover:text-gray-700 hover:bg-gray-100'
                }`}
              >
                <Settings className="h-4 w-4" />
                Settings
              </button>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {activeTab === 'settings' ? (
          <div className="space-y-8">
            <AuthManager
              onCredentialsChange={setCredentials}
              onOpenAIConfigChange={setOpenAIConfig}
            />
            <CrawlSettings />
          </div>
        ) : (
          <>
            {!isConfigured ? (
              <div className="text-center py-12">
                <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-6 max-w-md mx-auto">
                  <div className="flex items-center justify-center w-12 h-12 mx-auto bg-yellow-100 rounded-full mb-4">
                    <Settings className="h-6 w-6 text-yellow-600" />
                  </div>
                  <h3 className="text-lg font-medium text-gray-900 mb-2">Configuration Required</h3>
                  <p className="text-gray-600 mb-4">
                    Please configure your LinkedIn credentials in the Settings tab before starting a crawl.
                  </p>
                  <button
                    onClick={() => setActiveTab('settings')}
                    className="inline-flex items-center px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 transition-colors"
                  >
                    <Settings className="h-4 w-4 mr-2" />
                    Go to Settings
                  </button>
                </div>
              </div>
            ) : (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                <div>
                  <CrawlHistory
                    onSelectSession={setSelectedSession}
                    onDeleteSession={handleDeleteSession}
                    onStartNewCrawl={handleStartCrawl}
                    selectedSessionId={selectedSession?.id}
                  />
                </div>
                <div>
                  <ConnectionsList selectedSession={selectedSession} />
                </div>
              </div>
            )}
          </>
        )}
      </main>
    </div>
  );
}