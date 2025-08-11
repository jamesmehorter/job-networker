'use client';

import { useState, useEffect } from 'react';
import Image from 'next/image';
import { ExternalLink, Building, User, Users, Search } from 'lucide-react';
import { CrawlSession } from '@/types';

interface CompanyConnection {
  id: string;
  connectionPath: string;
  createdAt: string;
  companyId: string;
  companyName: string;
  companyLinkedInUrl: string;
  companyLogoUrl?: string;
  companyDescription?: string;
  connectionId: string;
  connectionName: string;
  connectionHeadline?: string;
  connectionProfileUrl?: string;
  connectionProfileImageUrl?: string;
  connectionSource?: string;
  connectionDegree: 1 | 2;
}

interface ConnectionsListProps {
  selectedSession: CrawlSession | null;
}

export default function ConnectionsList({ selectedSession }: ConnectionsListProps) {
  const [connections, setConnections] = useState<CompanyConnection[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [filteredConnections, setFilteredConnections] = useState<CompanyConnection[]>([]);

  useEffect(() => {
    if (selectedSession?.id) {
      fetchConnections(selectedSession.id);
    } else {
      setConnections([]);
      setFilteredConnections([]);
    }
  }, [selectedSession]);

  useEffect(() => {
    // Filter connections based on search term
    if (!searchTerm.trim()) {
      setFilteredConnections(connections);
    } else {
      const filtered = connections.filter(connection =>
        connection.companyName.toLowerCase().includes(searchTerm.toLowerCase()) ||
        connection.connectionName.toLowerCase().includes(searchTerm.toLowerCase()) ||
        connection.connectionHeadline?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        connection.companyDescription?.toLowerCase().includes(searchTerm.toLowerCase())
      );
      setFilteredConnections(filtered);
    }
  }, [connections, searchTerm]);

  const fetchConnections = async (sessionId: string) => {
    setLoading(true);
    try {
      const response = await fetch(`/api/crawl/sessions/${sessionId}/connections`);
      if (response.ok) {
        const data = await response.json();
        setConnections(data);
      } else {
        console.error('Failed to fetch connections');
        setConnections([]);
      }
    } catch (error) {
      console.error('Error fetching connections:', error);
      setConnections([]);
    } finally {
      setLoading(false);
    }
  };

  const groupConnectionsByCompany = () => {
    const grouped = filteredConnections.reduce((acc: Record<string, { company: { id: string; name: string; linkedInUrl: string; logoUrl?: string; description?: string }; connections: CompanyConnection[] }>, connection) => {
      const companyId = connection.companyId;
      if (!acc[companyId]) {
        acc[companyId] = {
          company: {
            id: connection.companyId,
            name: connection.companyName,
            linkedInUrl: connection.companyLinkedInUrl,
            logoUrl: connection.companyLogoUrl,
            description: connection.companyDescription
          },
          connections: []
        };
      }
      acc[companyId].connections.push(connection);
      return acc;
    }, {} as Record<string, { company: { id: string; name: string; linkedInUrl: string; logoUrl?: string; description?: string }; connections: CompanyConnection[] }>);

    return Object.values(grouped).sort((a, b) => (a.company.name as string).localeCompare(b.company.name as string));
  };

  const getConnectionPathDisplay = (connectionPath: string) => {
    return connectionPath.replace('You ->', '').trim();
  };

  const getConnectionDegreeIcon = (degree: number) => {
    return degree === 1 ? <User className="h-4 w-4" /> : <Users className="h-4 w-4" />;
  };

  if (!selectedSession) {
    return (
      <div className="text-center py-12 bg-gray-50 rounded-lg border border-dashed border-gray-300">
        <Building className="mx-auto h-12 w-12 text-gray-400 mb-4" />
        <h3 className="text-lg font-medium text-gray-900 mb-2">Select a crawl session</h3>
        <p className="text-gray-600">Choose a crawl session from the history to view company connections.</p>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="animate-pulse space-y-4">
        <div className="h-8 bg-gray-200 rounded w-1/3"></div>
        {[...Array(5)].map((_, i) => (
          <div key={i} className="border rounded-lg p-4">
            <div className="flex items-start space-x-4">
              <div className="h-12 w-12 bg-gray-200 rounded-lg"></div>
              <div className="flex-1 space-y-2">
                <div className="h-4 bg-gray-200 rounded w-1/2"></div>
                <div className="h-3 bg-gray-200 rounded w-3/4"></div>
                <div className="h-3 bg-gray-200 rounded w-1/3"></div>
              </div>
            </div>
          </div>
        ))}
      </div>
    );
  }

  const groupedConnections = groupConnectionsByCompany();

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold">
          Company Connections
          {filteredConnections.length > 0 && (
            <span className="ml-2 text-sm font-normal text-gray-600">
              ({filteredConnections.length} connection{filteredConnections.length !== 1 ? 's' : ''} 
              {groupedConnections.length > 0 && ` at ${groupedConnections.length} compan${groupedConnections.length !== 1 ? 'ies' : 'y'}`})
            </span>
          )}
        </h2>
        
        {connections.length > 0 && (
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
            <input
              type="text"
              placeholder="Search companies or connections..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-10 pr-4 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 w-64"
            />
          </div>
        )}
      </div>

      {groupedConnections.length === 0 ? (
        <div className="text-center py-12 bg-gray-50 rounded-lg border border-dashed border-gray-300">
          {connections.length === 0 ? (
            <>
              <Building className="mx-auto h-12 w-12 text-gray-400 mb-4" />
              <h3 className="text-lg font-medium text-gray-900 mb-2">No connections found</h3>
              <p className="text-gray-600">
                {selectedSession.status === 'completed' 
                  ? 'This crawl session completed but found no company connections.'
                  : selectedSession.status === 'running'
                  ? 'Crawl is still in progress. Connections will appear here as they are discovered.'
                  : 'This crawl session has not completed successfully.'
                }
              </p>
            </>
          ) : (
            <>
              <Search className="mx-auto h-12 w-12 text-gray-400 mb-4" />
              <h3 className="text-lg font-medium text-gray-900 mb-2">No matches found</h3>
              <p className="text-gray-600">Try adjusting your search terms.</p>
            </>
          )}
        </div>
      ) : (
        <div className="space-y-4">
          {groupedConnections.map(({ company, connections: companyConnections }) => (
            <div key={company.id} className="border rounded-lg bg-white shadow-sm">
              <div className="border-b bg-gray-50 px-6 py-4">
                <div className="flex items-start justify-between">
                  <div className="flex items-start space-x-4">
                    {company.logoUrl && (
                      <Image
                        src={company.logoUrl}
                        alt={`${company.name} logo`}
                        width={48}
                        height={48}
                        className="h-12 w-12 rounded-lg object-contain bg-white border"
                        onError={(e) => {
                          const target = e.target as HTMLImageElement;
                          target.style.display = 'none';
                        }}
                      />
                    )}
                    <div>
                      <div className="flex items-center gap-2">
                        <h3 className="text-lg font-semibold text-gray-900">{company.name}</h3>
                        <a
                          href={company.linkedInUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-blue-600 hover:text-blue-800 transition-colors"
                          title="View on LinkedIn"
                        >
                          <ExternalLink className="h-4 w-4" />
                        </a>
                      </div>
                      {company.description && (
                        <p className="text-sm text-gray-600 mt-1 max-w-2xl leading-relaxed">{company.description}</p>
                      )}
                      <div className="flex items-center gap-1 mt-2">
                        <Building className="h-4 w-4 text-gray-400" />
                        <span className="text-sm text-gray-600">
                          {companyConnections.length} connection{companyConnections.length !== 1 ? 's' : ''}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              <div className="p-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                  {companyConnections.map((connection) => (
                    <div key={connection.id} className="bg-white border border-gray-200 rounded-lg p-4 hover:shadow-lg transition-all duration-200 hover:border-blue-300">
                      <div className="flex flex-col items-center text-center space-y-3">
                        {/* Large Profile Photo */}
                        <div className="flex-shrink-0">
                          {connection.connectionProfileImageUrl ? (
                            <div className="relative">
                              <Image
                                src={connection.connectionProfileImageUrl}
                                alt={`${connection.connectionName} profile`}
                                width={80}
                                height={80}
                                className="w-20 h-20 rounded-full object-cover border-3 border-gray-200 shadow-sm"
                                onError={(e) => {
                                  const target = e.target as HTMLImageElement;
                                  const parent = target.parentElement;
                                  if (parent) {
                                    parent.innerHTML = `<div class="w-20 h-20 bg-gradient-to-br from-blue-500 to-blue-600 rounded-full flex items-center justify-center text-white font-bold text-lg shadow-sm">${connection.connectionName.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase()}</div>`;
                                  }
                                }}
                              />
                            </div>
                          ) : (
                            <div className="w-20 h-20 bg-gradient-to-br from-blue-500 to-blue-600 rounded-full flex items-center justify-center text-white font-bold text-lg shadow-sm">
                              {connection.connectionName.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase()}
                            </div>
                          )}
                        </div>
                        
                        {/* Name */}
                        <div className="min-w-0 w-full">
                          <h4 className="font-semibold text-gray-900 text-base leading-tight">
                            {connection.connectionName}
                          </h4>
                        </div>
                        
                        {/* Connection Source Badge */}
                        {connection.connectionSource && (
                          <div className="w-full">
                            <span className="inline-block text-xs px-3 py-1 bg-green-100 text-green-800 rounded-full font-medium">
                              {connection.connectionSource.replace(/\d+\s+(people|person|connection)\s+/i, '').replace(/^(from|at)\s+/i, '').trim()}
                            </span>
                          </div>
                        )}
                        
                        {/* LinkedIn Link */}
                        {connection.connectionProfileUrl && (
                          <div className="w-full">
                            <a
                              href={connection.connectionProfileUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center gap-1 text-blue-600 hover:text-blue-800 transition-colors text-sm font-medium hover:underline"
                              title="View LinkedIn Profile"
                            >
                              <ExternalLink className="h-3 w-3" />
                              View Profile
                            </a>
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}