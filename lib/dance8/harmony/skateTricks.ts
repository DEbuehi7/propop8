// lib/dance8/harmony/skateTricks.ts
//
// Skaters play Kirtled (canon D8-16): one trick per chord change, landing on
// it, chosen by the Kirtled plan's move word:
//   RA floor carve, LA kickflip sweep, KA handplant roll, TI (and any leap)
//   ollie leap, a held chord board freeze.
// Big moves stay slower than the beat (D8-03): a trick needs MIN_TRICK_SEC
// since the last one, and faster chord changes show as floor light only.
// Pure and deterministic; times are bar-clock seconds like the Kirtled plan.

import { KIRTLED_SKATE_TRICKS } from "../../canon/vocab";
import type { KirtledPlan } from "../contracts/harmony";

export type SkateTrick = (typeof KIRTLED_SKATE_TRICKS)[number]["trick"];
export type TrickCue = (typeof KIRTLED_SKATE_TRICKS)[number]["cue"];

/** Shortest time between two tricks. One bar at 96 BPM; a 4/4 bar at 92 BPM is 2.6 s. */
export const MIN_TRICK_SEC = 2.5;
/**
 * Trick clips are two bars long with the landing exactly one bar in, so a
 * chord change on any beat of a bar can be landed inside a one-bar shot.
 */
export function trickClipShape(barSec: number): { landingSec: number; minClipSec: number } {
  const r3 = (x: number) => Math.round(x * 1000) / 1000;
  return { landingSec: r3(barSec), minClipSec: r3(2 * barSec) };
}

export interface TrickEvent {
  eventId: string;
  atBar: number;
  atBeat: number;
  /** Bar-clock seconds of the chord change the trick lands on. */
  atSec: number;
  cue: TrickCue;
  trick: SkateTrick;
}

const TRICK: Record<TrickCue, SkateTrick> = Object.fromEntries(KIRTLED_SKATE_TRICKS.map((t) => [t.cue, t.trick])) as Record<TrickCue, SkateTrick>;

export function skateTricks(plan: KirtledPlan, opts: { minSec?: number } = {}): { tricks: TrickEvent[]; skipped: number } {
  const minSec = opts.minSec ?? MIN_TRICK_SEC;
  const tricks: TrickEvent[] = [];
  let skipped = 0;
  let last = -Infinity;
  const stances = [...plan.stances].sort((a, b) => a.startSec - b.startSec || a.eventId.localeCompare(b.eventId));
  for (const st of stances) {
    let cue: TrickCue | null = null;
    const leap = plan.leaps.find((l) => l.eventId === st.eventId);
    if (leap) cue = "TI";
    else if (st.hold) cue = st.anchor ? "HOLD" : null; // nothing to hold before the first chord
    else {
      const moves = plan.moves.filter((m) => m.eventId === st.eventId).sort((a, b) => a.atSec - b.atSec);
      const landing = moves[moves.length - 1];
      cue = landing ? landing.word === "RA" || landing.word === "LA" || landing.word === "KA" ? landing.word : null : null;
    }
    if (!cue) continue;
    if (st.startSec - last < minSec - 1e-9) {
      skipped++;
      continue;
    }
    tricks.push({ eventId: st.eventId, atBar: st.startBar, atBeat: st.startBeat, atSec: st.startSec, cue, trick: TRICK[cue] });
    last = st.startSec;
  }
  return { tricks, skipped };
}
