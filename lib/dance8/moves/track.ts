// lib/dance8/moves/track.ts
//
// A filmed take → the dance on the song's beat grid (canon D8-17), and a
// plain-language readout per section for the person to check.

import type { MusicSection } from "../contracts/signal";
import type { CueMap } from "../contracts/scene";
import type { BodyZone, MovementLevel } from "../contracts/motion";
import type { CaptureSync, MoveTrack, MoveWordId, PoseCapture } from "../contracts/moves";
import { KIRTLED_BODY_MOVES } from "../../canon/vocab";
import { bodySeries } from "./body";
import { beatFeatures, speeds } from "./beats";
import { songGrid } from "./grid";
import { detectWords } from "./words";

export const MOVES_ANALYZER = "dance8-moves-1";

export function buildMoveTrack(
  cap: PoseCapture, sync: CaptureSync, map: Pick<CueMap, "tempo" | "firstDownbeatSec" | "cues" | "trackId">, createdAt: string,
): MoveTrack {
  const bars = Math.max(1, ...map.cues.map((c) => c.endBar));
  const grid = songGrid(map, bars);
  const body = bodySeries(cap);
  const sp = speeds(body);
  const beats = beatFeatures(body, sp, grid, sync);
  const words = detectWords(body, sp, grid, sync);
  return {
    schemaVersion: 1,
    analyzer: MOVES_ANALYZER,
    trackId: map.trackId,
    takeId: cap.takeId,
    source: { type: "recorded", createdBy: "owner", createdAt: cap.capturedAt, recordingSessionId: cap.takeId, license: "proprietary" },
    sync,
    beats,
    words,
    coverage: {
      fromBar: beats.length ? beats[0].bar : 0,
      toBar: beats.length ? beats[beats.length - 1].bar : 0,
      beats: beats.length,
      knownBeats: beats.filter((x) => x.status === "known").length,
    },
    approvalStatus: "draft",
    createdAt,
  };
}

export interface SectionReadout {
  cueId: string;
  section: MusicSection;
  startBar: number;
  endBar: number;
  beats: number;
  knownBeats: number;
  energy: number | null;
  level: MovementLevel | null;
  zones: BodyZone[];
  words: Partial<Record<MoveWordId, number>>;
}

const mean = (xs: number[]) => (xs.length ? xs.reduce((a, c) => a + c, 0) / xs.length : NaN);

/** Per section of the cue map: mean energy, usual level, the zones that lead most often, and the words. */
export function sectionReadout(track: MoveTrack, map: Pick<CueMap, "cues">): SectionReadout[] {
  return map.cues.map((c) => {
    const bs = track.beats.filter((b) => b.bar >= c.startBar && b.bar < c.endBar);
    const known = bs.filter((b) => b.status === "known");
    const tally = <T extends string>(xs: T[]) => { const m = new Map<T, number>(); for (const x of xs) m.set(x, (m.get(x) ?? 0) + 1); return [...m].sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1)); };
    const levels = tally(known.map((b) => b.level).filter((l): l is MovementLevel => !!l));
    const zones = tally(known.flatMap((b) => b.zones));
    const words: Partial<Record<MoveWordId, number>> = {};
    for (const w of track.words) if (w.bar >= c.startBar && w.bar < c.endBar) words[w.word] = (words[w.word] ?? 0) + 1;
    const e = mean(known.map((b) => b.energy ?? NaN).filter(Number.isFinite));
    return {
      cueId: c.id, section: c.section, startBar: c.startBar, endBar: c.endBar, beats: bs.length, knownBeats: known.length,
      energy: Number.isFinite(e) ? Math.round(e * 100) / 100 : null,
      level: levels.length ? levels[0][0] : null,
      zones: zones.filter(([, k]) => k >= known.length * 0.25).slice(0, 2).map(([z]) => z),
      words,
    };
  });
}

const mmss = (s: number) => `${s < 0 ? "-" : ""}${Math.floor(Math.abs(s) / 60)}:${(Math.abs(s) % 60).toFixed(1).padStart(4, "0")}`;
const LEVEL_WORD: Record<MovementLevel, string> = { floor: "on the floor", low: "low", mid: "standing", high: "up high" };

export function readoutLines(track: MoveTrack, map: Pick<CueMap, "cues">): string[] {
  const s = track.sync;
  const syncLine = s.method === "manual"
    ? `synced by hand: the video starts at song ${mmss(s.songAtCapture0)}`
    : `synced by ear: the video starts at song ${mmss(s.songAtCapture0)} (match ${s.r} vs ${s.rNext} elsewhere${s.driftMs !== null ? `, halves agree within ${Math.abs(s.driftMs)} ms` : ""})`;
  const cov = track.coverage;
  const lines = [
    `take ${track.takeId}: ${syncLine}`,
    `covers bars ${cov.fromBar}-${cov.toBar}; ${cov.knownBeats} of ${cov.beats} beats readable${cov.beats && cov.knownBeats / cov.beats < 0.8 ? " (keep your whole body in frame, in good light)" : ""}`,
  ];
  const counts = KIRTLED_BODY_MOVES.map((m) => [m.word, track.words.filter((w) => w.word === m.word).length] as const);
  lines.push(`moves: ${counts.map(([w, k]) => `${k} ${w}`).join(", ")}`);
  for (const r of sectionReadout(track, map)) {
    if (!r.beats) continue;
    const ws = Object.entries(r.words).map(([w, k]) => `${k} ${w}`).join(", ");
    lines.push(`  ${r.cueId} (bars ${r.startBar}-${r.endBar}): ` + (r.knownBeats
      ? `energy ${r.energy}, mostly ${r.level ? LEVEL_WORD[r.level] : "?"}, ${r.zones.length ? r.zones.join(" + ") + " lead" : "no zone leads"}${ws ? `; ${ws}` : ""}`
      : "not readable"));
  }
  return lines;
}

/** Every word with its bar and beat (counting beats from 1, as musicians do; a hair before a barline rounds to the next bar). */
export function wordLines(track: MoveTrack, map: Pick<CueMap, "tempo">): string[] {
  const perBar = (bar: number) => ([...map.tempo].reverse().find((t) => t.startBar <= bar) ?? map.tempo[0]).beatsPerBar;
  return track.words.map((w) => {
    let bar = w.bar, beat = Math.round(w.beatInBar * 10) / 10;
    if (beat >= perBar(bar)) { bar += 1; beat = 0; }
    return `  bar ${bar} beat ${(beat + 1).toFixed(1)}  ${w.word.padEnd(6)} ${w.move.padEnd(6)} ${w.detail}`;
  });
}
