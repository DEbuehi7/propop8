// lib/dance8/moves/grid.ts
//
// The song's bars and beats in song seconds, from the cue map (the person's
// edited grid, not a fresh guess): bar 0's downbeat at firstDownbeatSec, then
// the tempo segments.

import { barToSec } from "../authoring/validateCueMap";
import type { CueMap } from "../contracts/scene";

export interface GridBeat {
  beat: number;
  bar: number;
  beatInBar: number;
  songSec: number;
  beatSec: number;
}

export interface SongGrid {
  bars: number;
  barStart(bar: number): number;
  beatsPerBar(bar: number): number;
  beatSec(bar: number): number;
  /** The bar and fractional beat at a song second; null before bar 0 or after the last bar. */
  at(songSec: number): { bar: number; beatInBar: number; beatSec: number } | null;
  /** Every beat whose start lies in [fromSec, toSec). */
  beats(fromSec: number, toSec: number): GridBeat[];
  /** The beat nearest a song second, with the distance in beats. */
  nearest(songSec: number): { beat: GridBeat; offBeats: number } | null;
}

export function songGrid(map: Pick<CueMap, "tempo" | "firstDownbeatSec">, bars: number): SongGrid {
  const fdb = map.firstDownbeatSec ?? 0;
  const starts = Array.from({ length: bars + 1 }, (_, b) => fdb + barToSec(map.tempo, b));
  const seg = (bar: number) => [...map.tempo].reverse().find((t) => t.startBar <= bar) ?? map.tempo[0];
  const beatsPerBar = (bar: number) => seg(bar).beatsPerBar;
  const beatSec = (bar: number) => 60 / seg(bar).bpm;
  const firstBeatOf: number[] = [0];
  for (let b = 0; b < bars; b++) firstBeatOf.push(firstBeatOf[b] + beatsPerBar(b));
  const barAt = (s: number) => {
    if (s < starts[0] || s >= starts[bars]) return -1;
    let lo = 0, hi = bars - 1;
    while (lo < hi) { const m = (lo + hi + 1) >> 1; if (starts[m] <= s) lo = m; else hi = m - 1; }
    return lo;
  };
  const beatAt = (bar: number, k: number): GridBeat => ({
    beat: firstBeatOf[bar] + k, bar, beatInBar: k, songSec: Math.round((starts[bar] + k * beatSec(bar)) * 1e6) / 1e6, beatSec: beatSec(bar),
  });
  return {
    bars,
    barStart: (b) => starts[Math.max(0, Math.min(bars, b))],
    beatsPerBar,
    beatSec,
    at(s) {
      const b = barAt(s);
      return b < 0 ? null : { bar: b, beatInBar: (s - starts[b]) / beatSec(b), beatSec: beatSec(b) };
    },
    beats(from, to) {
      const out: GridBeat[] = [];
      for (let b = Math.max(0, barAt(Math.max(from, starts[0]))); b >= 0 && b < bars && starts[b] < to; b++) {
        for (let k = 0; k < beatsPerBar(b); k++) {
          const g = beatAt(b, k);
          if (g.songSec >= from && g.songSec < to) out.push(g);
        }
      }
      return out;
    },
    nearest(s) {
      const b = barAt(s);
      if (b < 0) return null;
      const k = Math.round((s - starts[b]) / beatSec(b));
      const g = k >= beatsPerBar(b) ? (b + 1 < bars ? beatAt(b + 1, 0) : beatAt(b, beatsPerBar(b) - 1)) : beatAt(b, k);
      return { beat: g, offBeats: (s - g.songSec) / g.beatSec };
    },
  };
}
