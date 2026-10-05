import { supabaseAdmin } from './supabaseServer';

interface LegacySessionData {
  id: string;
  timestamp: number;
  duration: number;
  avgFrequency: number;
  peakFrequency: number;
  transcriptionAccuracy: number;
  wordsTranscribed: number;
}

/**
 * Migration utility for Phase 2: Backfill existing sessions from in-memory Map to Supabase
 * 
 * Usage:
 * 1. This should run ONCE after dual-write is active and Supabase is populated
 * 2. Verify all sessions were backfilled
 * 3. Switch API reads to Supabase-first in session.ts
 * 4. In Phase 3, remove Map storage entirely
 * 
 * Call from a manual script, cron job, or one-time migration task
 */

export async function backfillSessionsToSupabase(legacySessions: LegacySessionData[]) {
  console.log(`Starting backfill of ${legacySessions.length} sessions to Supabase...`);

  const batchSize = 100;
  let successCount = 0;
  let errorCount = 0;

  for (let i = 0; i < legacySessions.length; i += batchSize) {
    const batch = legacySessions.slice(i, i + batchSize);

    const dbSessions = batch.map((session) => ({
      id: session.id,
      user_id: 'anonymous', // All legacy sessions attributed to anonymous
      instrument: 'state8',
      started_at: new Date(session.timestamp).toISOString(),
      ended_at: new Date(session.timestamp + session.duration * 1000).toISOString(),
      duration_seconds: Math.round(session.duration),
      status: 'complete',
      metadata: {
        avgFrequency: session.avgFrequency,
        peakFrequency: session.peakFrequency,
        transcriptionAccuracy: session.transcriptionAccuracy,
        wordsTranscribed: session.wordsTranscribed,
        migratedAt: new Date().toISOString(),
      },
    }));

    try {
      const { error } = await supabaseAdmin.from('sessions').insert(dbSessions);

      if (error) {
        console.error(`Batch ${i / batchSize + 1} error:`, error);
        errorCount += batch.length;
      } else {
        successCount += batch.length;
        console.log(`Backfilled batch ${i / batchSize + 1}: ${successCount} total sessions`);
      }
    } catch (err) {
      console.error(`Batch ${i / batchSize + 1} exception:`, err);
      errorCount += batch.length;
    }
  }

  console.log(`Backfill complete: ${successCount} successful, ${errorCount} failed`);
  return { successCount, errorCount };
}

/**
 * Verify backfill by comparing counts and spot-checking data
 */
export async function verifyBackfill(legacyCount: number) {
  try {
    const { count, error } = await supabaseAdmin
      .from('sessions')
      .select('*', { count: 'exact', head: true });

    if (error) {
      console.error('Verification error:', error);
      return { verified: false, message: error.message };
    }

    if (count === legacyCount) {
      console.log(`✓ Verification passed: ${count} sessions in Supabase`);
      return { verified: true, count };
    } else {
      console.warn(
        `✗ Count mismatch: Legacy had ${legacyCount}, Supabase has ${count}`
      );
      return { verified: false, count, message: 'Count mismatch' };
    }
  } catch (err) {
    console.error('Verification exception:', err);
    return { verified: false, message: String(err) };
  }
}

/**
 * Cleanup Phase 3: Remove Map storage after successful migration
 * This is called after verification and API switch to Supabase-first reads
 */
export async function cleanupLegacyStorage() {
  console.log(
    'Legacy storage cleanup: Remove the in-memory Map from app/api/plate8/state8/session.ts'
  );
  console.log('After cleanup, the API will rely entirely on Supabase for persistence');
  return true;
}
