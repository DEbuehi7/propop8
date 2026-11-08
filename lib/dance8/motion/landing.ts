// lib/dance8/motion/landing.ts
//
// Freedom of choice: where the song departs from its own rhythm (./beatFeel),
// each dancer chooses which hit to land on, and the flow rules keep every
// choice in range. Where the song is steady there is nothing to choose and
// everyone lands on the beat.
//
//   on    on the grid beat (always offered)
//   with  with the music's own hit, early or late (a push or a drag)
//   and   on the "and", where a syncopated accent moved
//   hold  through a dropped beat: no hit, the move carries on
//
// Flow rules (FLOW_RULES below, each tested; locked as canon D8-19):
//   1. The one is shared: on the first count of every phrase the whole cast
//      lands together, on the beat or with its hit, never on the "and".
//   2. A landing always leaves room for the next count: at least half a count
//      before the next beat (and before a shared one), so no move is squeezed
//      faster than the beat allows (D8-03).
//   3. Never two holds in a row.
//   4. Everyone landing on the same count lands within half a count of each
//      other.
//
// The choice is seeded, not random: the same plan, feel and variation number
// give the same choices every time (D8-01, GOV-14); another variation number
// gives another set of choices under the same rules. The choir and the skater
// take fewer liberties than the soloist and the breaker, and a dancer who just
// took a liberty is less likely to repeat it straight away, so choices
// alternate. Landing changes timing only: what each role does on a count, and
// the skaters' tricks on chord changes (D8-16), are unchanged.

import { SHIFT_MIN_SEC, type BeatFeel } from "./beatFeel";
import type { CuePlan, PerformerMove, PlannedCount, Role } from "./rhythm";

export type Landing = "on" | "with" | "and" | "hold";

/** How far below the next count's beat a landing must stay, in counts. */
export const MIN_GAP_COUNTS = 0.5;
/** How far apart the landings on one count may be, in counts. */
export const ENSEMBLE_SPREAD_COUNTS = 0.5;
/** How much each role leans toward the alternatives (1 = as much as the music offers). */
export const ROLE_FREEDOM: Record<Role, number> = { soloist: 1, breaker: 1, choir: 0.5, skater: 0.5 };
/** A liberty just taken counts this much the next time it is offered. */
export const REPEAT_DAMPING = 0.5;

export const FLOW_RULES = [
  "The one is shared: the first count of every phrase lands together, on the beat or with its hit.",
  "A landing leaves at least half a count before the next beat.",
  "Never two holds in a row.",
  "Landings on the same count are within half a count of each other.",
] as const;

export const LANDING_TEXT: Record<Landing, string> = {
  on: "on the beat", with: "with the hit", and: "on the and", hold: "holds through",
};

interface Option { landing: Landing; hitSec: number | null; weight: number }

const EPS = 1e-6;
const r3 = (x: number) => Math.round(x * 1000) / 1000;

/** A stable number in [0, 1) for a key: the seeded "choice". */
export function unit(key: string): number {
  let h = 2166136261;
  for (let i = 0; i < key.length; i++) { h ^= key.charCodeAt(i); h = Math.imul(h, 16777619); }
  h ^= h >>> 13; h = Math.imul(h, 0x5bd1e995); h ^= h >>> 15;
  return (h >>> 0) / 4294967296;
}

/** What the music offers on one count. `shared` is the one: no "and". */
export function offered(feel: BeatFeel | undefined, gridSec: number, shared: boolean): Option[] {
  const dropped = feel?.kind === "dropped";
  const out: Option[] = [{ landing: "on", hitSec: gridSec, weight: dropped ? 0.5 : 1 }];
  if (!feel || feel.kind === "unknown") return out;
  if (dropped) out.push({ landing: "hold", hitSec: null, weight: 1 });
  else if (feel.hitSec !== null && feel.shiftMs !== null && Math.abs(feel.shiftMs) >= SHIFT_MIN_SEC * 1000) {
    // The bigger the shift, the stronger its pull (0.5 to 1.5).
    out.push({ landing: "with", hitSec: feel.hitSec, weight: 0.5 + Math.min(1, Math.abs(feel.shiftMs) / 100) });
  }
  if (!shared && feel.kind === "syncopated" && feel.andSec !== null) {
    out.push({ landing: "and", hitSec: feel.andSec, weight: Math.min(1.5, feel.andRatio ?? 1) });
  }
  return out;
}

function pick(options: Option[], u: number): Option {
  const total = options.reduce((s, o) => s + o.weight, 0);
  let acc = 0;
  for (const o of options) {
    acc += o.weight / total;
    if (u < acc - EPS) return o;
  }
  return options[options.length - 1];
}

interface Slot { cue: number; k: number; count: PlannedCount; countSec: number }

interface DancerState { lastHit: number | null; lastHeld: boolean; lastLiberty: Landing | null }

export interface LandingOptions {
  /** Which set of choices (0 = the first). Same number, same choices. */
  variation?: number;
}

/**
 * The plans with each count's feel and each active dancer's landing.
 * `feel` is keyed by beat index. Counts with no feel are "on" for everyone.
 */
export function applyLandings(plans: readonly CuePlan[], feel: ReadonlyMap<number, BeatFeel>, opts: LandingOptions = {}): CuePlan[] {
  const variation = opts.variation ?? 0;
  const out: CuePlan[] = plans.map((p) => ({ ...p, counts: p.counts.map((c) => ({ ...c, moves: c.moves.map((m) => ({ ...m })) })) }));
  // One timeline across cues, so the rules hold across a cue change too.
  const slots: Slot[] = out.flatMap((p, cue) => p.counts.map((count, k) => ({ cue, k, count, countSec: (p.beatsPerCount * 60) / p.bpm })))
    .sort((a, b) => a.count.timeSec - b.count.timeSec);

  // Rule 1 first: the one's shared landing depends only on the music and the variation.
  const shared = new Map<Slot, Option>();
  for (const s of slots) {
    s.count.feel = feel.get(s.count.beat);
    if (s.count.count === 1) shared.set(s, pick(offered(s.count.feel, s.count.timeSec, true), unit(`${variation}|one|${s.count.beat}`)));
  }

  const state = new Map<string, DancerState>();
  slots.forEach((s, i) => {
    const next = slots[i + 1];
    const nextShared = next ? shared.get(next) : undefined;
    const landed: number[] = [];
    for (const m of s.count.moves) {
      const st = state.get(m.id) ?? { lastHit: null, lastHeld: false, lastLiberty: null };
      if (!m.active) {
        // Resting this count (call and response, or the wave not yet here): no landing, and the hold chain breaks.
        st.lastHeld = false;
        state.set(m.id, st);
        continue;
      }
      const fixed = shared.get(s);
      let choice: Option;
      if (fixed) choice = fixed;
      else {
        const all = offered(s.count.feel, s.count.timeSec, false);
        const ok = all.filter((o) => {
          if (o.landing === "hold") return !st.lastHeld && !(nextShared?.landing === "hold");
          const h = o.hitSec as number;
          if (st.lastHit !== null && h - st.lastHit < MIN_GAP_COUNTS * s.countSec - EPS) return false; // rule 2, backwards
          if (next && next.count.timeSec - h < MIN_GAP_COUNTS * s.countSec - EPS) return false; // rule 2, to the next beat
          if (nextShared?.hitSec != null && nextShared.hitSec - h < MIN_GAP_COUNTS * s.countSec - EPS) return false; // rule 2, to a shared one
          return landed.every((x) => Math.abs(x - h) <= ENSEMBLE_SPREAD_COUNTS * s.countSec + EPS); // rule 4
        });
        const pool = (ok.length ? ok : all.filter((o) => o.landing === "on")).map((o) => ({
          ...o,
          weight: o.landing === "on" ? o.weight : o.weight * ROLE_FREEDOM[m.role] * (o.landing === st.lastLiberty ? REPEAT_DAMPING : 1),
        }));
        choice = pool.length > 1 ? pick(pool, unit(`${variation}|${m.id}|${s.count.beat}`)) : pool[0];
        if (all.length > 1) st.lastLiberty = choice.landing === "on" ? null : choice.landing;
      }
      setLanding(m, choice);
      if (choice.hitSec !== null) { st.lastHit = choice.hitSec; landed.push(choice.hitSec); }
      st.lastHeld = choice.landing === "hold";
      state.set(m.id, st);
    }
  });
  return out;
}

function setLanding(m: PerformerMove, o: Option): void {
  m.landing = o.landing;
  m.hitSec = o.hitSec === null ? null : r3(o.hitSec);
}

export interface FeelSummary {
  counts: number;
  byKind: Record<string, number>;
  /** Landings chosen on counts where the music offered a choice, per role. */
  choices: Record<Role, Partial<Record<Landing, number>>>;
}

export function feelSummary(plans: readonly CuePlan[]): FeelSummary {
  const byKind: Record<string, number> = {};
  const choices: FeelSummary["choices"] = { soloist: {}, choir: {}, breaker: {}, skater: {} };
  let counts = 0;
  for (const p of plans) for (const c of p.counts) {
    counts++;
    const k = c.feel?.kind ?? "unknown";
    byKind[k] = (byKind[k] ?? 0) + 1;
    if (k === "steady" || k === "unknown") continue;
    for (const m of c.moves) if (m.landing) choices[m.role][m.landing] = (choices[m.role][m.landing] ?? 0) + 1;
  }
  return { counts, byKind, choices };
}
