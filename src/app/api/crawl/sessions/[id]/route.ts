import { NextRequest, NextResponse } from 'next/server';
import { getDatabase } from '@/lib/database';

interface RouteParams {
  params: {
    id: string;
  };
}

export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    const db = getDatabase();
    const session = db.getCrawlSession(params.id);
    
    if (!session) {
      return NextResponse.json(
        { error: 'Session not found' },
        { status: 404 }
      );
    }

    return NextResponse.json(session);
  } catch (error) {
    console.error('Failed to fetch crawl session:', error);
    return NextResponse.json(
      { error: 'Failed to fetch crawl session' },
      { status: 500 }
    );
  }
}

export async function DELETE(request: NextRequest, { params }: RouteParams) {
  try {
    const db = getDatabase();
    db.deleteCrawlSession(params.id);
    
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Failed to delete crawl session:', error);
    return NextResponse.json(
      { error: 'Failed to delete crawl session' },
      { status: 500 }
    );
  }
}