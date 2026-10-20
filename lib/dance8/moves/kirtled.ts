// lib/dance8/moves/kirtled.ts
//
// The owner's dance against the song's Kirtled plan (song-following mode,
// D8-06/D8-17): at each chord change, did a move of the same word land
// within a beat of it? And the floor light: every stomp (DO) flashes the
// triangle under the performer, as a light cue only (no sound, D8-08).
// Pure and deterministic.

import type { CueMap } from "../contracts/scene";
import type { KirtledPlan } from "../contracts/harmony";
import type { MoveTrack, MoveWordId } from "../contracts/moves";
import { skateTricks } from "../harmony/skateTricks";
import { bestTake } from "./skaters";

export interface KirtledChange {
  /** Bar-clock seconds, like the Kirtled plan. */
  atSec: number;
  songSec: number;
  bar: number;
  beat: number;
  /** The song's word at this change (HOLD: the chord is held). */
  word: "RA" | "LA" | "KA" | "TI" | "HOLD";
  takeId: string | null;
  /** Your words within a beat of the change. */
  yours: MoveWordId[];
  /** null where no take reads this change. */
  match: boolean | null;
}

export interface KirtledDance {
  changes: KirtledChange[];
  covered: number;
  matched: number;
  lights: { songSec: number; bar: number; beatInBar: number; kind: "stomp"; takeId: string }[];
}

const SAME: Record<KirtledChange["word"], MoveWordId> = { RA: "RA", LA: "LA", KA: "KA", TI: "TI", HOLD: "FREEZE" };

export function kirtledDance(plan: KirtledPlan, tracks: MoveTrack[], map: Pick<CueMap, "tempo" | "firstDownbeatSec">): KirtledDance {
  const origin = map.firstDownbeatSec ?? 0;
  const beat = 60 / map.tempo[0].bpm, bar = map.tempo[0].beatsPerBar * beat;
  const changes = skateTricks(plan, { minSec: 0 }).tricks.map((t): KirtledChange => {
    const songSec = Math.round((t.atSec + origin) * 1e6) / 1e6;
    const take = bestTake(tracks, songSec - beat, songSec + beat);
    const yours = take ? [...new Set(take.words.filter((w) => Math.abs(w.songSec - songSec) <= beat + 1e-9).map((w) => w.word))] : [];
    return { atSec: t.atSec, songSec, bar: t.atBar, beat: t.atBeat, word: t.cue, takeId: take?.takeId ?? null, yours, match: take ? yours.includes(SAME[t.cue]) : null };
  });
  // Lights from the take that reads each bar best.
  const lights: KirtledDance["lights"] = [];
  const seen = new Set<string>();
  for (const t of tracks) for (const w of t.words.filter((x) => x.word === "DO")) {
    const bt = bestTake(tracks, w.songSec - bar / 2, w.songSec + bar / 2);
    const key = `${w.bar}:${Math.round(w.beatInBar * 4)}`;
    if (bt?.takeId !== t.takeId || seen.has(key)) continue;
    seen.add(key);
    lights.push({ songSec: w.songSec, bar: w.bar, beatInBar: w.beatInBar, kind: "stomp", takeId: t.takeId });
  }
  lights.sort((a, b) => a.songSec - b.songSec);
  return { changes, covered: changes.filter((c) => c.match !== null).length, matched: changes.filter((c) => c.match).length, lights };
}
