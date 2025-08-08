export interface LinkedInCredentials {
  email: string;
  password: string;
}

export interface OpenAIConfig {
  apiKey: string;
}

export interface CrawlSession {
  id: string;
  createdAt: string;
  mode: 'first_connections' | 'friends_of_friends';
  status: 'pending' | 'running' | 'completed' | 'failed';
  progress: number;
  totalConnections?: number;
  processedConnections?: number;
  error?: string;
}

export interface Connection {
  id: string;
  crawlSessionId: string;
  name: string;
  headline: string;
  profileUrl: string;
  company?: string;
  companyUrl?: string;
  companyLogoUrl?: string;
  connectionDegree: 1 | 2;
  mutualConnection?: string;
  location?: string;
  createdAt: string;
}

export interface Company {
  id: string;
  name: string;
  linkedinUrl: string;
  logoUrl?: string;
  description?: string;
  industry?: string;
  size?: string;
  location?: string;
  website?: string;
  createdAt: string;
}

export interface CompanyConnection {
  id: string;
  companyId: string;
  connectionId: string;
  crawlSessionId: string;
  connectionPath: string; // e.g., "You -> John Smith" or "You -> Jane Doe -> John Smith"
  createdAt: string;
}

export interface CrawlSettings {
  rateLimit: number; // milliseconds between requests
  maxConnections?: number;
  headless: boolean;
}