import { NextRequest, NextResponse } from 'next/server';

interface SessionData {
  id: string;
  timestamp: number;
  duration: number;
  avgFrequency: number;
  peakFrequency: number;
  transcriptionAccuracy: number;
  wordsTranscribed: number;
}

// In-memory storage for MVP (replace with Supabase later)
const sessions: Map<string, SessionData> = new Map();

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { action, session } = body;

    if (action === 'save') {
      const sessionId = crypto.randomUUID();
      const sessionData: SessionData = {
        id: sessionId,
        timestamp: Date.now(),
        ...session,
      };
      sessions.set(sessionId, sessionData);
      return NextResponse.json({ success: true, sessionId });
    }

    if (action === 'get') {
      const { sessionId } = body;
      const data = sessions.get(sessionId);
      if (!data) {
        return NextResponse.json({ error: 'Session not found' }, { status: 404 });
      }
      return NextResponse.json(data);
    }

    if (action === 'list') {
      const sessionList = Array.from(sessions.values())
        .sort((a, b) => b.timestamp - a.timestamp)
        .slice(0, 10);
      return NextResponse.json({ sessions: sessionList });
    }

    return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
  } catch (error) {
    console.error('Session API error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function GET(request: NextRequest) {
  const sessionList = Array.from(sessions.values())
    .sort((a, b) => b.timestamp - a.timestamp)
    .slice(0, 10);
  return NextResponse.json({ sessions: sessionList });
}
