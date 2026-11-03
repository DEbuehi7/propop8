import { NextResponse } from 'next/server';
import { AUDIOBOOK_URL_ENV, loadAudiobook } from '@/lib/late8/load';

/**
 * The published Late8 audiobook's manifest, for the player on /plate8/late8.
 * Public by decision (tests/routeAuth.test.ts): it takes no input, reads one
 * fixed URL from the environment, and returns what R2 already serves
 * publicly. Only approved chapters with cleared rights are ever published
 * (lib/stuttr/audiobookCommands.ts, canon STU-02).
 */
export async function GET() {
  const state = await loadAudiobook(process.env[AUDIOBOOK_URL_ENV]);
  return NextResponse.json(state, { headers: { 'cache-control': 'public, max-age=60' } });
}
