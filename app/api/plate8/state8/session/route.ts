import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseServer';
import { recordRead } from '@/lib/sessionMonitoring';

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
 * Phase 2C of migration: Supabase-first reads with monitoring
 * - New sessions write to both Map (cache) and Supabase (persistent)
 * - Reads prioritize Supabase (authoritative source)
 * - Fallback to Map only if Supabase fails or returns no data
 * - All reads logged to monitoring dashboard for observability
 * - Target: 95%+ of reads from Supabase within 1 week
 *
 * After 1 week of stable >95% Supabase adoption:
 * Phase 3 (future): Remove Map entirely, keep only Supabase
 */

async function saveSessionToSupabase(
  sessionId: string,
  sessionData: SessionDataFull,
  userId: string
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

async function getSessionFromSupabase(
  sessionId: string,
  recordMetrics = true
) {
  const startTime = Date.now();

  try {
    const { data, error } = await supabaseAdmin
      .from('sessions')
      .select('*')
      .eq('id', sessionId)
      .single();

    const latencyMs = Date.now() - startTime;

    if (error) {
      if (recordMetrics) {
        recordRead({
          action: 'get',
          source: 'supabase',
          latencyMs,
          success: false,
          errorMessage: error.message,
          fallbackUsed: false,
        });
      }
      console.debug('Session not found in Supabase:', error.message);
      return null;
    }

    // Map Supabase format to in-memory format
    if (data) {
      if (recordMetrics) {
        recordRead({
          action: 'get',
          source: 'supabase',
          latencyMs,
          success: true,
          fallbackUsed: false,
        });
      }

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
    const latencyMs = Date.now() - startTime;
    if (recordMetrics) {
      recordRead({
        action: 'get',
        source: 'supabase',
        latencyMs,
        success: false,
        errorMessage: error instanceof Error ? error.message : String(error),
        fallbackUsed: false,
      });
    }
    console.error('Supabase fetch error:', error);
    return null;
  }
}

async function listSessionsFromSupabase(
  limit = 10,
  recordMetrics = true
) {
  const startTime = Date.now();

  try {
    const { data, error } = await supabaseAdmin
      .from('sessions')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(limit);

    const latencyMs = Date.now() - startTime;

    if (error) {
      if (recordMetrics) {
        recordRead({
          action: 'list',
          source: 'supabase',
          latencyMs,
          success: false,
          errorMessage: error.message,
          fallbackUsed: false,
        });
      }
      console.debug('Error listing sessions from Supabase:', error.message);
      return [];
    }

    // Map Supabase format to in-memory format
    const result = (data || []).map((session) => ({
      id: session.id,
      timestamp: new Date(session.started_at).getTime(),
      duration: session.duration_seconds || 0,
      avgFrequency: session.metadata?.avgFrequency || 0,
      peakFrequency: session.metadata?.peakFrequency || 0,
      transcriptionAccuracy: session.metadata?.transcriptionAccuracy || 0,
      wordsTranscribed: session.metadata?.wordsTranscribed || 0,
    }));

    if (recordMetrics) {
      recordRead({
        action: 'list',
        source: 'supabase',
        latencyMs,
        success: true,
        fallbackUsed: false,
      });
    }

    return result;
  } catch (error) {
    const latencyMs = Date.now() - startTime;
    if (recordMetrics) {
      recordRead({
        action: 'list',
        source: 'supabase',
        latencyMs,
        success: false,
        errorMessage: error instanceof Error ? error.message : String(error),
        fallbackUsed: false,
      });
    }
    console.error('Supabase list error:', error);
    return [];
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { action, session } = body;

    if (action === 'save') {
      // Deliberate system actor for unauthenticated State8 sessions.
      // Must reference a real row in users(id) (seeded by migration 002).
      const systemUserId = process.env.STATE8_SYSTEM_USER_ID;
      if (!systemUserId) {
        console.error('STATE8_SYSTEM_USER_ID is not configured');
        return NextResponse.json(
          { error: 'Server misconfigured: STATE8_SYSTEM_USER_ID not set' },
          { status: 500 }
        );
      }

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
      saveSessionToSupabase(sessionId, sessionData, systemUserId);

      return NextResponse.json({ success: true, sessionId });
    }

    if (action === 'get') {
      const { sessionId } = body;

      // Phase 2C: Try Supabase first, fallback to Map with monitoring
      let data = await getSessionFromSupabase(sessionId);

      // Fallback to in-memory cache if Supabase fails
      if (!data) {
        const mapData = sessions.get(sessionId);
        if (mapData) {
          // Record fallback usage
          recordRead({
            action: 'get',
            source: 'map',
            latencyMs: 0, // Map is in-memory, negligible latency
            success: true,
            fallbackUsed: true,
          });
          data = mapData;
        }
      }

      if (!data) {
        return NextResponse.json({ error: 'Session not found' }, { status: 404 });
      }

      return NextResponse.json(data);
    }

    if (action === 'list') {
      // Phase 2C: Try Supabase first, fallback to Map with monitoring
      let sessionList = await listSessionsFromSupabase(10);

      // Fallback to in-memory cache if Supabase returns empty
      if (sessionList.length === 0) {
        const mapSessions = Array.from(sessions.values())
          .sort((a, b) => b.timestamp - a.timestamp)
          .slice(0, 10);

        if (mapSessions.length > 0) {
          // Record fallback usage
          recordRead({
            action: 'list',
            source: 'map',
            latencyMs: 0, // Map is in-memory, negligible latency
            success: true,
            fallbackUsed: true,
          });
          sessionList = mapSessions;
        }
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
  // Phase 2C: Try Supabase first, fallback to Map with monitoring
  let sessionList = await listSessionsFromSupabase(10);

  // Fallback to in-memory cache if Supabase returns empty
  if (sessionList.length === 0) {
    const mapSessions = Array.from(sessions.values())
      .sort((a, b) => b.timestamp - a.timestamp)
      .slice(0, 10);

    if (mapSessions.length > 0) {
      // Record fallback usage
      recordRead({
        action: 'list',
        source: 'map',
        latencyMs: 0, // Map is in-memory, negligible latency
        success: true,
        fallbackUsed: true,
      });
      sessionList = mapSessions;
    }
  }

  return NextResponse.json({ sessions: sessionList });
}
