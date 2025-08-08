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
    const connections = db.getCompanyConnectionsBySession(params.id);
    
    return NextResponse.json(connections);
  } catch (error) {
    console.error('Failed to fetch session connections:', error);
    return NextResponse.json(
      { error: 'Failed to fetch session connections' },
      { status: 500 }
    );
  }
}