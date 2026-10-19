// lib/dance8/authoring/plan.ts
//
// First draft of a song's cue map and harmony timeline from Stuttr's analysis
// (lib/stuttr/analysis.ts) and the lyrics. Pure and deterministic: the same
// analysis and lyrics give the same files. Everything it writes is a draft for
// a person to check by ear and approve (GOV-14); it never decides.
//
//   Sung phrases: runs of sung eighth notes (louder than VOICED_DB), split at
//                 gaps of a beat or more, rounded out to whole bars.
//   Sections:     choruses where the backing vocals sing (runs merged across
//                 gaps of up to two bars), intro before the first vocal,
//                 outro after the last, verses in between.
//   Lyrics:       lines spread over the lead phrases in order, in proportion
//                 to each phrase's sung length. An estimate: lines can land
//                 one phrase early or late.
//   Chords:       one event per change; a half bar read with less than
//                 MIN_CHORD_FIT becomes N.C. (the Kirtled dancers hold).

import { VOICED_DB, type SongAnalysis } from "../../stuttr/analysis";
import type { HarmonyEvent, HarmonyTimeline, KeySegment } from "../contracts/harmony";
import type { AspectRatio, CameraShot, Cue, CueMap, VocalPhrase } from "../contracts/scene";
import type { MusicSection } from "../contracts/signal";

export const MIN_CHORD_FIT = 0.75;
export const PHRASE_GAP_EIGHTHS = 2;
export const CHORUS_MERGE_BARS = 2;
export const STAND_IN_CLIP_ID = "placeholder-black";
export const PLANNER = "dance8-plan-1";

const SHOTS: Record<"intro" | "verse" | "chorus" | "outro", { cameras: CameraShot[]; shotBars: number }> = {
  intro: { cameras: ["drone_wide", "wide"], shotBars: 2 },
  verse: { cameras: ["medium", "tracking"], shotBars: 2 },
  chorus: { cameras: ["wide", "close", "tracking"], shotBars: 1 },
  outro: { cameras: ["wide", "drone_wide"], shotBars: 4 },
};

/** Runs of sung eighths as [start, end) eighth indices; a gap of `gap` or more eighths ends a run. */
export function sungRuns(eighthDb: number[], thresholdDb = VOICED_DB, gap = PHRASE_GAP_EIGHTHS): [number, number][] {
  const runs: [number, number][] = [];
  let i = 0;
  while (i < eighthDb.length) {
    if (!(eighthDb[i] > thresholdDb)) { i++; continue; }
    const s = i;
    let end = i + 1;
    let j = end;
    while (j < eighthDb.length) {
      if (eighthDb[j] > thresholdDb) { end = ++j; continue; }
      let k = j;
      while (k < eighthDb.length && !(eighthDb[k] > thresholdDb)) k++;
      if (k - j >= gap || k === eighthDb.length) break;
      j = k;
    }
    runs.push([s, end]);
    i = end;
  }
  return runs;
}

/** Sung lines of a lyrics file: bracketed stage directions ([Verse 1 | ...]) are left out. */
export function lyricLines(text: string): string[] {
  return text
    .split(/\r?\n/)
    .map((l) => l.replace(/\[[^\]]*\]/g, "").replace(/\s+/g, " ").trim())
    .filter((l) => l.length > 0);
}

/**
 * Lyric lines grouped by their section headers into alternating runs of hook
 * lines ([Hook], [Chorus], [Refrain]) and other lines ([Intro], [Verse], ...).
 */
export function lyricGroups(text: string): { chorus: boolean; lines: string[] }[] {
  const groups: { chorus: boolean; lines: string[] }[] = [];
  let chorus = false;
  for (const raw of text.split(/\r?\n/)) {
    const header = /^\s*\[([^\]|]*)/.exec(raw);
    if (header && /^\s*\[[^\]]*\]\s*$/.test(raw) && /^(intro|verse|pre|hook|chorus|refrain|bridge|outro|break|freeze|interlude|drop)/i.test(header[1].trim())) {
      chorus = /^(hook|chorus|refrain)/i.test(header[1].trim());
    }
    const line = raw.replace(/\[[^\]]*\]/g, "").replace(/\s+/g, " ").trim();
    if (!line) continue;
    const g = groups[groups.length - 1];
    if (g && g.chorus === chorus) g.lines.push(line);
    else groups.push({ chorus, lines: [line] });
  }
  return groups;
}

/** Spreads lines over phrases in order, in proportion to each phrase's length. */
export function spreadLines(lengths: number[], lines: string[]): string[][] {
  const out = lengths.map(() => [] as string[]);
  const total = lengths.reduce((a, b) => a + b, 0);
  if (!total || !lines.length) return out;
  const ends: number[] = [];
  lengths.reduce((acc, d, k) => (ends[k] = acc + d), 0);
  lines.forEach((line, i) => {
    const pos = ((i + 0.5) / lines.length) * total;
    const k = ends.findIndex((e) => e > pos);
    out[k < 0 ? lengths.length - 1 : k].push(line);
  });
  return out;
}

/** "Eb" -> Eb major, "Cm" -> C minor. */
export function parseKey(s: string): KeySegment | null {
  const m = /^([A-Ga-g])([#b]?)(m|min|minor)?$/.exec(s.trim());
  if (!m) return null;
  const base: Record<string, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
  const tonic = (base[m[1].toUpperCase()] + (m[2] === "#" ? 1 : m[2] === "b" ? 11 : 0)) % 12;
  return { startBar: 0, startBeat: 0, tonic, quality: m[3] ? "min" : "maj" };
}

export interface PlanInput {
  analysis: SongAnalysis;
  lyrics?: string;
  leadVoice?: string;
  backingVoice?: string;
  key?: KeySegment;
  aspect?: AspectRatio;
}

export interface PlanDraft {
  map: CueMap;
  harmony: HarmonyTimeline;
  notes: string[];
}

export function planSong(inp: PlanInput): PlanDraft {
  const a = inp.analysis;
  const notes: string[] = [...a.warnings];
  const lead = inp.leadVoice ?? "Lead";
  const backing = inp.backingVoice ?? "Backing";
  const bars = a.bars;
  const toBars = ([s, e]: [number, number]): [number, number] => [Math.floor(s / 8), Math.min(bars, Math.ceil(e / 8))];
  const leadRuns = a.eighthDb.lead ? sungRuns(a.eighthDb.lead) : [];
  const backRuns = a.eighthDb.backing ? sungRuns(a.eighthDb.backing) : [];

  const leadBars = leadRuns.map(toBars);
  const backBars = backRuns.map(toBars);

  // Sections.
  const all = [...leadBars, ...backBars];
  const first = all.length ? Math.min(...all.map((v) => v[0])) : bars;
  const last = all.length ? Math.max(...all.map((v) => v[1])) : bars;
  const choruses: [number, number][] = [];
  for (const [bs, be] of backBars) {
    const prev = choruses[choruses.length - 1];
    if (prev && bs - prev[1] <= CHORUS_MERGE_BARS) prev[1] = Math.max(prev[1], be);
    else choruses.push([bs, be]);
  }
  const blocks: { section: "intro" | "verse" | "chorus" | "outro"; startBar: number; endBar: number }[] = [];
  if (first > 0) blocks.push({ section: "intro", startBar: 0, endBar: first });
  let at = Math.min(first, bars);
  for (const [cs, ce] of choruses) {
    const s = Math.max(cs, at);
    const e = Math.min(ce, last);
    if (e <= s) continue;
    if (s > at) blocks.push({ section: "verse", startBar: at, endBar: s });
    blocks.push({ section: "chorus", startBar: s, endBar: e });
    at = e;
  }
  if (last > at) blocks.push({ section: "verse", startBar: at, endBar: last });
  if (bars > Math.max(last, at)) blocks.push({ section: "outro", startBar: Math.max(last, at), endBar: bars });
  if (!choruses.length) notes.push("no backing vocals: no choruses were marked; edit the sections in the cue map if the song has them");

  // Lyrics: hook lines go to the lead phrases inside choruses, other lines to
  // the rest, block by block, when the song and the lyrics have the same
  // pattern of hooks; otherwise spread over all phrases.
  const lengths = leadRuns.map(([s, e]) => e - s);
  const texts: string[][] = lengths.map(() => []);
  const groups = inp.lyrics ? lyricGroups(inp.lyrics) : [];
  const lineCount = groups.reduce((n, g) => n + g.lines.length, 0);
  const inChorus = (bar: number) => blocks.some((b) => b.section === "chorus" && bar >= b.startBar && bar < b.endBar);
  const segs: { chorus: boolean; phrases: number[] }[] = [];
  leadBars.forEach(([sb], i) => {
    const c = inChorus(sb);
    const g = segs[segs.length - 1];
    if (g && g.chorus === c) g.phrases.push(i);
    else segs.push({ chorus: c, phrases: [i] });
  });
  const aligned = groups.length > 0 && groups.length === segs.length && groups.every((g, i) => g.chorus === segs[i].chorus);
  if (aligned) {
    groups.forEach((g, i) => {
      const idx = segs[i].phrases;
      spreadLines(idx.map((k) => lengths[k]), g.lines).forEach((ls, j) => texts[idx[j]].push(...ls));
    });
  } else if (lineCount) {
    spreadLines(lengths, groups.flatMap((g) => g.lines)).forEach((ls, k) => texts[k].push(...ls));
  }
  if (!lineCount) notes.push("no lyrics file: phrases have no caption text");
  else if (aligned) notes.push(`${lineCount} lyric lines matched to verses and hooks, then spread by phrase length; check where each line lands by ear`);
  else notes.push(`${lineCount} lyric lines spread over ${leadRuns.length} sung phrases by length (the lyric sections did not line up with the detected choruses); check by ear`);

  const vocals: VocalPhrase[] = [
    ...leadBars.map(([startBar, endBar], i) => {
      const text = texts[i].join(" ");
      return { id: `lead-${i + 1}`, voice: lead, startBar, endBar, ...(text ? { text } : {}) };
    }),
    ...backBars.map(([startBar, endBar], i) => ({ id: `backing-${i + 1}`, voice: backing, startBar, endBar })),
  ].sort((x, y) => x.startBar - y.startBar || (x.voice === lead ? 0 : 1) - (y.voice === lead ? 0 : 1) || x.id.localeCompare(y.id, "en", { numeric: true }));

  const count: Record<string, number> = {};
  const cues: Cue[] = blocks.map((b) => {
    const n = (count[b.section] = (count[b.section] ?? 0) + 1);
    const id = b.section === "intro" || b.section === "outro" ? b.section : `${b.section}-${n}`;
    const sceneId = b.section === "verse" ? `verse-${n}` : b.section;
    const shots = SHOTS[b.section];
    return {
      id, section: b.section as MusicSection, startBar: b.startBar, endBar: b.endBar, sceneId,
      cameras: shots.cameras, shotBars: Math.max(1, Math.min(shots.shotBars, b.endBar - b.startBar)),
    };
  });
  notes.push("scene names are placeholders (intro, verse-1, chorus, ...); rename each sceneId to a place, then run plan again to refresh the shot list");

  const map: CueMap = {
    id: `cuemap-${a.trackId}`, schemaVersion: 1, version: 1, trackId: a.trackId, analysisProfileId: a.analyzer,
    aspect: inp.aspect ?? "9:16",
    tempo: [{ startBar: 0, bpm: a.bpm, beatsPerBar: a.beatsPerBar }],
    firstDownbeatSec: a.firstDownbeatSec,
    cues, fallbackClipId: STAND_IN_CLIP_ID, maxDriftScore: 0.25, vocals, approvalStatus: "draft",
  };

  // Harmony.
  const events: HarmonyEvent[] = [];
  let prev = "";
  for (const c of a.chords) {
    const symbol = c.fit >= MIN_CHORD_FIT ? c.chord : "N.C.";
    if (symbol === prev) continue;
    events.push({ id: `h${events.length + 1}`, startBar: c.bar, startBeat: c.half * 2, symbol });
    prev = symbol;
  }
  const unsure = a.chords.filter((c) => c.fit < MIN_CHORD_FIT).length;
  if (unsure) notes.push(`${unsure} of ${a.chords.length} half bars had no clear chord and are N.C. (the dancers hold there)`);
  if (!inp.key) notes.push("no key given: Kirtled moves take the shortest way; pass --key (e.g. Eb or Cm) to keep them in key");
  const harmony: HarmonyTimeline = {
    id: `harmony-${a.trackId}`, schemaVersion: 1, trackId: a.trackId, analysisProfileId: a.analyzer,
    ...(inp.key ? { keys: [inp.key] } : {}), events, approvalStatus: "draft",
  };
  return { map, harmony, notes };
}
