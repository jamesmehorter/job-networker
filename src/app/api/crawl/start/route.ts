import { NextRequest, NextResponse } from 'next/server';
import { getDatabase } from '@/lib/database';
import { LinkedInCrawler } from '@/lib/linkedin-crawler';
import { StorageManager } from '@/lib/storage';

// Store active crawlers to manage them
const activeCrawlers = new Map<string, LinkedInCrawler>();

export async function POST(request: NextRequest) {
  try {
    const { sessionId, credentials } = await request.json();
    
    if (!sessionId || !credentials) {
      return NextResponse.json(
        { error: 'Session ID and credentials are required' },
        { status: 400 }
      );
    }

    const db = getDatabase();
    const session = db.getCrawlSession(sessionId);
    
    if (!session) {
      return NextResponse.json(
        { error: 'Session not found' },
        { status: 404 }
      );
    }

    if (session.status === 'running') {
      return NextResponse.json(
        { error: 'Session is already running' },
        { status: 400 }
      );
    }

    // Get crawl settings
    const settings = StorageManager.getCrawlSettings();
    
    // Create crawler
    const crawler = new LinkedInCrawler(settings);
    activeCrawlers.set(sessionId, crawler);

    // Start crawl in the background
    startCrawlProcess(sessionId, session.mode as 'first_connections' | 'friends_of_friends', credentials, crawler);
    
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Failed to start crawl:', error);
    return NextResponse.json(
      { error: 'Failed to start crawl' },
      { status: 500 }
    );
  }
}

async function startCrawlProcess(
  sessionId: string, 
  mode: 'first_connections' | 'friends_of_friends', 
  credentials: { email: string; password: string }, 
  crawler: LinkedInCrawler
) {
  const db = getDatabase();
  
  try {
    // Update session to running
    db.updateCrawlSession(sessionId, { status: 'running', progress: 0 });

    // Initialize crawler
    await crawler.initialize();
    
    // Login to LinkedIn
    const loginSuccess = await crawler.login(credentials);
    if (!loginSuccess) {
      throw new Error('LinkedIn login failed');
    }

    db.updateCrawlSession(sessionId, { progress: 5 });

    // Progress callback
    const onProgress = (progress: number) => {
      db.updateCrawlSession(sessionId, { progress: Math.round(progress) });
    };

    // Start appropriate crawl
    if (mode === 'first_connections') {
      await crawler.crawlFirstDegreeConnections(sessionId, onProgress);
    } else {
      await crawler.crawlFriendsOfFriends(sessionId, onProgress);
    }

    // Mark as completed
    db.updateCrawlSession(sessionId, { 
      status: 'completed', 
      progress: 100 
    });

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error(`Crawl failed for session ${sessionId}:`, errorMessage);
    console.error('Full error object:', error);
    
    db.updateCrawlSession(sessionId, { 
      status: 'failed', 
      error: errorMessage
    });
  } finally {
    // Clean up
    await crawler.close();
    activeCrawlers.delete(sessionId);
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const { sessionId } = await request.json();
    
    if (!sessionId) {
      return NextResponse.json(
        { error: 'Session ID is required' },
        { status: 400 }
      );
    }

    const crawler = activeCrawlers.get(sessionId);
    if (crawler) {
      await crawler.close();
      activeCrawlers.delete(sessionId);
      
      // Update session status
      const db = getDatabase();
      db.updateCrawlSession(sessionId, { 
        status: 'failed', 
        error: 'Cancelled by user'
      });
    }
    
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Failed to stop crawl:', error);
    return NextResponse.json(
      { error: 'Failed to stop crawl' },
      { status: 500 }
    );
  }
}