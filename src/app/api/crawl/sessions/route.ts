import { NextRequest, NextResponse } from 'next/server';
import { getDatabase } from '@/lib/database';

export async function GET() {
  try {
    const db = getDatabase();
    const sessions = db.getAllCrawlSessions();
    return NextResponse.json(sessions);
  } catch (error) {
    console.error('Failed to fetch crawl sessions:', error);
    return NextResponse.json(
      { error: 'Failed to fetch crawl sessions' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const { mode } = await request.json();
    
    if (!mode || !['first_connections', 'friends_of_friends'].includes(mode)) {
      return NextResponse.json(
        { error: 'Invalid crawl mode' },
        { status: 400 }
      );
    }

    const db = getDatabase();
    const sessionId = db.createCrawlSession({
      mode,
      status: 'pending',
      progress: 0,
      processedConnections: 0
    });

    return NextResponse.json({ sessionId });
  } catch (error) {
    console.error('Failed to create crawl session:', error);
    return NextResponse.json(
      { error: 'Failed to create crawl session' },
      { status: 500 }
    );
  }
}