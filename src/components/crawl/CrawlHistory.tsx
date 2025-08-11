'use client';

import { useState, useEffect } from 'react';
import { Trash2, Calendar, Users, Building, Play, AlertCircle, ChevronDown, ChevronRight } from 'lucide-react';
import { CrawlSession } from '@/types';

interface CrawlHistoryProps {
  onSelectSession: (session: CrawlSession) => void;
  onDeleteSession: (sessionId: string) => void;
  onStartNewCrawl: (mode: 'first_connections' | 'friends_of_friends') => void;
  selectedSessionId?: string;
  refreshTrigger?: number;
}

export default function CrawlHistory({ 
  onSelectSession, 
  onDeleteSession, 
  onStartNewCrawl, 
  selectedSessionId,
  refreshTrigger 
}: CrawlHistoryProps) {
  const [sessions, setSessions] = useState<CrawlSession[]>([]);
  const [loading, setLoading] = useState(true);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [expandedErrors, setExpandedErrors] = useState<Set<string>>(new Set());

  useEffect(() => {
    fetchSessions();
  }, [refreshTrigger]);

  useEffect(() => {
    // Set up polling only when we have active sessions
    const hasActiveSessions = sessions.some(s => s.status === 'running' || s.status === 'pending');
    
    if (!hasActiveSessions) {
      return; // No interval needed if no active sessions
    }

    console.log('Setting up polling for running sessions');
    const interval = setInterval(() => {
      console.log('Polling for session updates');
      fetchSessions();
    }, 3000);
    
    return () => {
      console.log('Clearing polling interval');
      clearInterval(interval);
    };
  }, [sessions.filter(s => s.status === 'running' || s.status === 'pending').length]); // Only re-run when number of active sessions changes

  const fetchSessions = async () => {
    try {
      const response = await fetch('/api/crawl/sessions');
      if (response.ok) {
        const data = await response.json();
        setSessions(data);
      }
    } catch (error) {
      console.error('Failed to fetch sessions:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (sessionId: string) => {
    if (!confirm('Are you sure you want to delete this crawl session? This will remove all associated data.')) {
      return;
    }

    setDeletingId(sessionId);
    try {
      const response = await fetch(`/api/crawl/sessions/${sessionId}`, {
        method: 'DELETE',
      });

      if (response.ok) {
        setSessions(sessions.filter(s => s.id !== sessionId));
        onDeleteSession(sessionId);
      } else {
        throw new Error('Failed to delete session');
      }
    } catch (error) {
      console.error('Failed to delete session:', error);
      alert('Failed to delete session. Please try again.');
    } finally {
      setDeletingId(null);
    }
  };

  const getStatusColor = (status: CrawlSession['status']) => {
    switch (status) {
      case 'completed':
        return 'bg-green-100 text-green-800 border-green-200';
      case 'running':
        return 'bg-blue-100 text-blue-800 border-blue-200';
      case 'failed':
        return 'bg-red-100 text-red-800 border-red-200';
      case 'pending':
        return 'bg-yellow-100 text-yellow-800 border-yellow-200';
      default:
        return 'bg-gray-100 text-gray-800 border-gray-200';
    }
  };

  const getModeDisplay = (mode: CrawlSession['mode']) => {
    return mode === 'first_connections' ? '1st Connections' : 'Friends of Friends';
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const toggleErrorExpansion = (sessionId: string) => {
    setExpandedErrors(prev => {
      const newSet = new Set(prev);
      if (newSet.has(sessionId)) {
        newSet.delete(sessionId);
      } else {
        newSet.add(sessionId);
      }
      return newSet;
    });
  };

  if (loading) {
    return (
      <div className="animate-pulse space-y-4">
        {[...Array(3)].map((_, i) => (
          <div key={i} className="h-24 bg-gray-200 rounded-lg"></div>
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold">Crawl History</h2>
        <div className="flex gap-2">
          <button
            onClick={() => onStartNewCrawl('first_connections')}
            className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 transition-colors flex items-center gap-2"
          >
            <Play className="h-4 w-4" />
            1st Connections
          </button>
          <button
            onClick={() => onStartNewCrawl('friends_of_friends')}
            className="px-4 py-2 bg-purple-600 text-white rounded-md hover:bg-purple-700 focus:outline-none focus:ring-2 focus:ring-purple-500 focus:ring-offset-2 transition-colors flex items-center gap-2"
          >
            <Play className="h-4 w-4" />
            Friends of Friends
          </button>
        </div>
      </div>

      {sessions.length === 0 ? (
        <div className="text-center py-12 bg-gray-50 rounded-lg border border-dashed border-gray-300">
          <Building className="mx-auto h-12 w-12 text-gray-400 mb-4" />
          <h3 className="text-lg font-medium text-gray-900 mb-2">No crawl sessions yet</h3>
          <p className="text-gray-600 mb-6">Start your first crawl to discover company connections in your LinkedIn network.</p>
          <div className="flex gap-2 justify-center">
            <button
              onClick={() => onStartNewCrawl('first_connections')}
              className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 transition-colors flex items-center gap-2"
            >
              <Play className="h-4 w-4" />
              Start First Connections Crawl
            </button>
            <button
              onClick={() => onStartNewCrawl('friends_of_friends')}
              className="px-4 py-2 bg-purple-600 text-white rounded-md hover:bg-purple-700 focus:outline-none focus:ring-2 focus:ring-purple-500 focus:ring-offset-2 transition-colors flex items-center gap-2"
            >
              <Play className="h-4 w-4" />
              Start Friends of Friends Crawl
            </button>
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          {sessions.map((session) => (
            <div
              key={session.id}
              className={`border rounded-lg p-4 cursor-pointer transition-all ${
                selectedSessionId === session.id
                  ? 'border-blue-500 bg-blue-50 shadow-md'
                  : 'border-gray-200 bg-white hover:border-gray-300 hover:shadow-sm'
              }`}
              onClick={() => onSelectSession(session)}
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-4">
                  <div className="flex flex-col">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-gray-900">
                        {getModeDisplay(session.mode)}
                      </span>
                      <span className={`px-2 py-1 text-xs font-medium rounded-md border ${getStatusColor(session.status)}`}>
                        {session.status}
                      </span>
                    </div>
                    <div className="flex items-center gap-4 mt-1 text-sm text-gray-600">
                      <div className="flex items-center gap-1">
                        <Calendar className="h-3 w-3" />
                        {formatDate(session.createdAt)}
                      </div>
                      {session.totalConnections && (
                        <div className="flex items-center gap-1">
                          <Users className="h-3 w-3" />
                          {session.processedConnections || 0}/{session.totalConnections} processed
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  {session.status === 'running' && (
                    <div className="flex items-center gap-2">
                      <div className="w-32 bg-gray-200 rounded-full h-2">
                        <div
                          className="bg-blue-600 h-2 rounded-full transition-all animate-pulse"
                          style={{ width: `${session.progress}%` }}
                        ></div>
                      </div>
                      <span className="text-sm text-gray-600">{session.progress}%</span>
                      <div className="animate-spin rounded-full h-3 w-3 border-b-2 border-blue-600"></div>
                    </div>
                  )}
                  
                  {session.status === 'failed' && session.error && (
                    <div className="text-red-600 text-sm">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          toggleErrorExpansion(session.id);
                        }}
                        className="flex items-center gap-1 hover:text-red-700 transition-colors"
                      >
                        <AlertCircle className="h-4 w-4" />
                        {expandedErrors.has(session.id) ? (
                          <ChevronDown className="h-3 w-3" />
                        ) : (
                          <ChevronRight className="h-3 w-3" />
                        )}
                        <span className={expandedErrors.has(session.id) ? '' : 'max-w-48 truncate'}>
                          {expandedErrors.has(session.id) ? 'Error Details' : session.error}
                        </span>
                      </button>
                      {expandedErrors.has(session.id) && (
                        <div className="mt-2 p-3 bg-red-50 border border-red-200 rounded text-xs font-mono text-red-800 whitespace-pre-wrap">
                          {session.error}
                        </div>
                      )}
                    </div>
                  )}

                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleDelete(session.id);
                    }}
                    disabled={deletingId === session.id}
                    className="p-1 text-gray-400 hover:text-red-600 focus:outline-none focus:text-red-600 transition-colors"
                    title="Delete session"
                  >
                    {deletingId === session.id ? (
                      <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-red-600"></div>
                    ) : (
                      <Trash2 className="h-4 w-4" />
                    )}
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}