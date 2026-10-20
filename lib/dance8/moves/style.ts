// lib/dance8/moves/style.ts
//
// The rule for which motion pairs with which music, learned from the owner's
// own takes (canon D8-17): for each kind of section, at a tempo band, how
// hard he dances, at what level, with which body zones leading, and which
// Kirtled moves he reaches for, per bar. Within a song his takes give the
// rules directly; across songs they add up to a style profile that gives
// rules for a song he has not danced to. The rules are a Gate 1 MappingBundle
// for the motion scorer, always a draft for him to approve. Plain counting
// and averages, no model (GOV-14).

import type { MappingBundle, MappingRule } from "../contracts/mapping";
import type { BodyZone, MovementLevel } from "../contracts/motion";
import type { MoveTrack, MoveWordId } from "../contracts/moves";
import type { CueMap } from "../contracts/scene";
import type { MusicSection } from "../contracts/signal";
import { MOVES_ANALYZER } from "./track";

/** Under 90 BPM is slow, 120 and over fast. */
export const TEMPO_BANDS = { slow: 90, fast: 120 } as const;
export type TempoBand = "slow" | "mid" | "fast";
export const tempoBand = (bpm: number): TempoBand => (bpm < TEMPO_BANDS.slow ? "slow" : bpm >= TEMPO_BANDS.fast ? "fast" : "mid");
const BAND_BPM: Record<TempoBand, [number, number]> = { slow: [40, TEMPO_BANDS.slow], mid: [TEMPO_BANDS.slow, TEMPO_BANDS.fast], fast: [TEMPO_BANDS.fast, 240] };
/** A move counts as part of the style at one every four bars or more. */
export const MOVE_RATE_MIN = 0.25;
/** The clip tags each move asks for (the Gate 1 motion library's vocabulary). */
export const MOVE_TAG: Record<MoveWordId, string> = { DO: "stomp", RA: "travel", LA: "level_change", KA: "turn", TI: "jump", FREEZE: "freeze" };
const WORDS: MoveWordId[] = ["DO", "RA", "LA", "KA", "TI", "FREEZE"];
const ZONES: BodyZone[] = ["head", "arms", "torso", "hips", "legs", "feet"];

export interface StyleCell {
  section: MusicSection;
  tempo: TempoBand;
  /** Known beats behind this cell. */
  beats: number;
  energy: number;
  level: MovementLevel;
  zones: BodyZone[];
  /** Moves per bar. */
  perBar: Record<MoveWordId, number>;
  songs: string[];
}

export interface StyleProfile {
  schemaVersion: 1;
  analyzer: string;
  builtAt: string;
  songs: { trackId: string; bpm: number; takes: number; knownBeats: number }[];
  cells: StyleCell[];
}

interface Tally { beats: number; energy: number; levels: Map<MovementLevel, number>; zones: Map<BodyZone, number>; words: Map<MoveWordId, number>; bars: number; songs: Set<string> }
const fresh = (): Tally => ({ beats: 0, energy: 0, levels: new Map(), zones: new Map(), words: new Map(), bars: 0, songs: new Set() });
const top = <T>(m: Map<T, number>) => [...m].sort((a, b) => b[1] - a[1] || String(a[0]).localeCompare(String(b[0])));

function tallySong(into: (section: MusicSection) => Tally, trackId: string, map: CueMap, tracks: MoveTrack[]) {
  for (const cue of map.cues) {
    const t = into(cue.section);
    let bars = 0;
    for (const tr of tracks) {
      const bs = tr.beats.filter((b) => b.bar >= cue.startBar && b.bar < cue.endBar && b.status === "known");
      if (!bs.length) continue;
      t.songs.add(trackId);
      t.beats += bs.length;
      for (const b of bs) {
        t.energy += b.energy ?? 0;
        if (b.level) t.levels.set(b.level, (t.levels.get(b.level) ?? 0) + 1);
        for (const z of b.zones) t.zones.set(z, (t.zones.get(z) ?? 0) + 1);
      }
      bars += bs.length / (map.tempo[0].beatsPerBar || 4);
      for (const w of tr.words) if (w.bar >= cue.startBar && w.bar < cue.endBar && bs.some((b) => b.bar === w.bar)) t.words.set(w.word, (t.words.get(w.word) ?? 0) + 1);
    }
    t.bars += bars;
  }
}

function cellOf(section: MusicSection, tempo: TempoBand, t: Tally): StyleCell {
  const r2 = (x: number) => Math.round(x * 100) / 100;
  return {
    section, tempo, beats: t.beats, energy: r2(t.energy / t.beats),
    level: (top(t.levels)[0]?.[0] ?? "mid") as MovementLevel,
    zones: top(t.zones).filter(([, k]) => k >= t.beats * 0.25).slice(0, 2).map(([z]) => z).filter((z) => ZONES.includes(z)),
    perBar: Object.fromEntries(WORDS.map((w) => [w, t.bars ? r2((t.words.get(w) ?? 0) / t.bars) : 0])) as Record<MoveWordId, number>,
    songs: [...t.songs].sort(),
  };
}

/** Every song's takes, added up by section kind and tempo band. */
export function styleProfile(songs: { trackId: string; map: CueMap; tracks: MoveTrack[] }[], builtAt: string): StyleProfile {
  const cells = new Map<string, Tally>();
  for (const s of songs) {
    const band = tempoBand(s.map.tempo[0].bpm);
    tallySong((section) => { const k = `${section}|${band}`; if (!cells.has(k)) cells.set(k, fresh()); return cells.get(k)!; }, s.trackId, s.map, s.tracks);
  }
  return {
    schemaVersion: 1, analyzer: MOVES_ANALYZER, builtAt,
    songs: songs.filter((s) => s.tracks.length).map((s) => ({ trackId: s.trackId, bpm: s.map.tempo[0].bpm, takes: s.tracks.length, knownBeats: s.tracks.reduce((a, t) => a + t.coverage.knownBeats, 0) })),
    cells: [...cells].filter(([, t]) => t.beats > 0).map(([k, t]) => { const [section, tempo] = k.split("|"); return cellOf(section as MusicSection, tempo as TempoBand, t); })
      .sort((a, b) => a.section.localeCompare(b.section) || a.tempo.localeCompare(b.tempo)),
  };
}

function ruleOf(c: StyleCell, bpmRange: [number, number]): MappingRule {
  const tags = [`level:${c.level}`, `energy:${c.energy < 1 / 3 ? "low" : c.energy < 2 / 3 ? "mid" : "high"}`];
  const moves = WORDS.filter((w) => c.perBar[w] >= MOVE_RATE_MIN).map((w) => MOVE_TAG[w]);
  tags.push(...(moves.length ? moves : ["groove"]));
  return { id: `dance-${c.section}-${c.tempo}`, sections: [c.section], bpmRange, preferredZones: c.zones, preferredTags: tags, weight: 1 };
}

export interface BundleVersions { motionLibraryVersion: number; transitionGraphVersion: number; runtimePolicyVersion: number }

/**
 * The rules for one song: from its own takes when there are any, otherwise
 * from the profile's cells at the song's tempo band (then the nearest band).
 */
export function danceRules(
  map: CueMap, from: { tracks: MoveTrack[] } | { profile: StyleProfile }, versions: BundleVersions, createdAt: string,
): MappingBundle & { source: "takes" | "profile" } {
  const bpm = map.tempo[0].bpm, band = tempoBand(bpm);
  let rules: MappingRule[];
  if ("tracks" in from) {
    rules = styleProfile([{ trackId: map.trackId, map, tracks: from.tracks }], createdAt).cells.map((c) => ruleOf(c, [Math.round(bpm - 8), Math.round(bpm + 8)]));
  } else {
    const order: TempoBand[] = band === "mid" ? ["mid", "slow", "fast"] : band === "slow" ? ["slow", "mid", "fast"] : ["fast", "mid", "slow"];
    const sections = [...new Set(map.cues.map((c) => c.section))];
    rules = sections.flatMap((s) => {
      const cell = order.map((b) => from.profile.cells.find((c) => c.section === s && c.tempo === b)).find(Boolean);
      return cell ? [ruleOf(cell, BAND_BPM[band])] : [];
    });
  }
  return {
    id: `${map.trackId}-dance-rules`, schemaVersion: 1, version: 1, trackId: map.trackId, analysisProfileId: map.analysisProfileId,
    ...versions, rules, generatedBy: "human", generatorVersion: MOVES_ANALYZER, approvalStatus: "draft", createdAt,
    source: "tracks" in from ? "takes" : "profile",
  };
}

export function styleLines(p: StyleProfile): string[] {
  const words = (c: StyleCell) => WORDS.filter((w) => c.perBar[w] > 0).map((w) => `${w} ${c.perBar[w]}/bar`).join(", ") || "groove";
  return [
    `your style from ${p.songs.length} song${p.songs.length === 1 ? "" : "s"} (${p.songs.reduce((a, s) => a + s.takes, 0)} takes)`,
    ...p.cells.map((c) => `  ${c.section} at ${c.tempo} tempo: energy ${c.energy}, mostly ${c.level}, ${c.zones.join(" + ") || "no zone"} lead; ${words(c)} (${c.beats} beats, ${c.songs.join(", ")})`),
  ];
}
