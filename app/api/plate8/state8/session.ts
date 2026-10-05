import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseServer';

interface SessionData {
  id: string;
  timestamp: number;
  duration: number;
  avgFrequency: number;
  peakFrequency: number;
  transcriptionAccuracy: number;
  wordsTranscribed: number;
}

interface SessionDataFull extends SessionData {
  userId?: string;
  instrument?: string;
  status?: string;
  metadata?: Record<string, any>;
}

// In-memory storage for MVP (fallback cache during migration)
const sessions: Map<string, SessionData> = new Map();

/**
 * Phase 1 of migration: Dual-write strategy
 * - New sessions are written to both Map (cache) and Supabase (persistent)
 * - Reads first check Supabase, fallback to Map if not found
 * - Existing sessions remain in Map until migration phase 2
 *
 * Phase 2 (future): Switch reads to Supabase first
 * Phase 3 (future): Remove Map, keep only Supabase
 */

async function saveSessionToSupabase(
  sessionId: string,
  sessionData: SessionDataFull,
  userId: string = 'anonymous'
) {
  try {
    // Map in-memory format to Supabase schema
    const dbSession = {
      id: sessionId,
      user_id: userId,
      instrument: sessionData.instrument || 'state8',
      started_at: new Date(sessionData.timestamp).toISOString(),
      ended_at: null,
      duration_seconds: sessionData.duration,
      status: sessionData.status || 'recording',
      metadata: {
        avgFrequency: sessionData.avgFrequency,
        peakFrequency: sessionData.peakFrequency,
        transcriptionAccuracy: sessionData.transcriptionAccuracy,
        wordsTranscribed: sessionData.wordsTranscribed,
        ...sessionData.metadata,
      },
    };

    const { error } = await supabaseAdmin.from('sessions').insert([dbSession]);

    if (error) {
      console.error('Error saving session to Supabase:', error);
      // Don't throw - let Map cache handle it for now
      return false;
    }

    return true;
  } catch (error) {
    console.error('Supabase save error:', error);
    // Non-blocking - session still saved to Map
    return false;
  }
}

async function getSessionFromSupabase(sessionId: string) {
  try {
    const { data, error } = await supabaseAdmin
      .from('sessions')
      .select('*')
      .eq('id', sessionId)
      .single();

    if (error) {
      console.debug('Session not found in Supabase:', error.message);
      return null;
    }

    // Map Supabase format to in-memory format
    if (data) {
      return {
        id: data.id,
        timestamp: new Date(data.started_at).getTime(),
        duration: data.duration_seconds || 0,
        avgFrequency: data.metadata?.avgFrequency || 0,
        peakFrequency: data.metadata?.peakFrequency || 0,
        transcriptionAccuracy: data.metadata?.transcriptionAccuracy || 0,
        wordsTranscribed: data.metadata?.wordsTranscribed || 0,
      };
    }

    return null;
  } catch (error) {
    console.error('Supabase fetch error:', error);
    return null;
  }
}

async function listSessionsFromSupabase(limit = 10) {
  try {
    const { data, error } = await supabaseAdmin
      .from('sessions')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(limit);

    if (error) {
      console.debug('Error listing sessions from Supabase:', error.message);
      return [];
    }

    // Map Supabase format to in-memory format
    return (data || []).map((session) => ({
      id: session.id,
      timestamp: new Date(session.started_at).getTime(),
      duration: session.duration_seconds || 0,
      avgFrequency: session.metadata?.avgFrequency || 0,
      peakFrequency: session.metadata?.peakFrequency || 0,
      transcriptionAccuracy: session.metadata?.transcriptionAccuracy || 0,
      wordsTranscribed: session.metadata?.wordsTranscribed || 0,
    }));
  } catch (error) {
    console.error('Supabase list error:', error);
    return [];
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { action, session } = body;

    if (action === 'save') {
      const sessionId = crypto.randomUUID();
      const sessionData: SessionDataFull = {
        id: sessionId,
        timestamp: Date.now(),
        instrument: 'state8',
        status: 'recording',
        ...session,
      };

      // Phase 1: Write to both Map and Supabase (dual-write)
      // Save to in-memory cache first (always succeeds)
      sessions.set(sessionId, sessionData);

      // Save to Supabase in background (fire-and-forget for now)
      saveSessionToSupabase(sessionId, sessionData, 'anonymous');

      return NextResponse.json({ success: true, sessionId });
    }

    if (action === 'get') {
      const { sessionId } = body;

      // Phase 1: Try Supabase first, fallback to Map
      let data = await getSessionFromSupabase(sessionId);

      // Fallback to in-memory cache
      if (!data) {
        data = sessions.get(sessionId);
      }

      if (!data) {
        return NextResponse.json({ error: 'Session not found' }, { status: 404 });
      }

      return NextResponse.json(data);
    }

    if (action === 'list') {
      // Phase 1: Try Supabase first, fallback to Map
      let sessionList = await listSessionsFromSupabase(10);

      // Fallback to in-memory cache
      if (sessionList.length === 0) {
        sessionList = Array.from(sessions.values())
          .sort((a, b) => b.timestamp - a.timestamp)
          .slice(0, 10);
      }

      return NextResponse.json({ sessions: sessionList });
    }

    return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
  } catch (error) {
    console.error('Session API error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function GET(request: NextRequest) {
  // Phase 1: Try Supabase first, fallback to Map
  let sessionList = await listSessionsFromSupabase(10);

  // Fallback to in-memory cache
  if (sessionList.length === 0) {
    sessionList = Array.from(sessions.values())
      .sort((a, b) => b.timestamp - a.timestamp)
      .slice(0, 10);
  }

  return NextResponse.json({ sessions: sessionList });
}
