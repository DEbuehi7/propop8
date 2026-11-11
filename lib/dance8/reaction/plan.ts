// lib/dance8/reaction/plan.ts
//
// Turns a saved feature track, the editor's windows and any verified events
// into a reaction track: what each window may draw, every event with its
// provenance, and every HOLD. Pure and deterministic: the same inputs give the
// same track. Fails closed: a bad or mismatched feature file makes nothing
// renderable, so the edit falls back to the untouched source footage.

import { readFeatures, validateFeatures, type VisualFeatureTrack } from "../../stuttr/visualFeatures";
import {
  DEFAULT_ZONES, FAMILIES, INTENSITIES, REACTION_LIMITS, REACTION_RENDERER, REACTION_TRACK_SCHEMA, VERIFIED_KINDS,
  type Family, type Hold, type PlannedWindow, type ReactionEvent, type ReactionTrack, type VerifiedEventInput, type WindowSpec,
} from "./contracts";

/** FNV-1a, so a window's default seed comes from its names and never from a clock. */
export function seedOf(text: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}

/** Which verified kinds each family can show. */
const SHOWS: Record<Family, readonly (typeof VERIFIED_KINDS)[number][]> = {
  GENOME_LOOM: ["lyric_chop"],
  ALGORITHMIC_CYPHER: ["chord_change", "move_word", "beat"],
  RESONANCE_CHAMBER: [],
};

const HOLD_REASON: Record<(typeof VERIFIED_KINDS)[number], string> = {
  chord_change: "no verified chord-change times: landing rings are held (D8-16)",
  move_word: "no synced, verified dance take: move words are held (D8-17)",
  beat: "no verified beat grid: beat marks are held",
  lyric_chop: "no verified lyric-chop markers: chop knots are held",
};

/** Onset-like peaks: local maxima above `floor`, at least `gapFrames` apart, strongest first on ties. */
export function onsetPeaks(onset: Float64Array, from: number, to: number, floor = 0.45, gapFrames = 4): number[] {
  const cands: number[] = [];
  for (let k = Math.max(from, 1); k < Math.min(to, onset.length - 1); k++) {
    if (onset[k] >= floor && onset[k] > onset[k - 1] && onset[k] >= onset[k + 1]) cands.push(k);
  }
  cands.sort((a, b) => onset[b] - onset[a] || a - b);
  const kept: number[] = [];
  for (const k of cands) if (kept.every((j) => Math.abs(j - k) >= gapFrames)) kept.push(k);
  return kept.sort((a, b) => a - b);
}

export interface PlanInput {
  songId: string;
  featuresText: string;
  featuresSha256: string;
  /** When given, the feature file must have measured this audio. */
  expectSourceSha256?: string;
  windows: WindowSpec[];
  events?: VerifiedEventInput[];
  reducedMotion?: boolean;
}

export function planReactionTrack(inp: PlanInput): { track: ReactionTrack; features: VisualFeatureTrack | null } {
  const holds: Hold[] = [];
  const events: ReactionEvent[] = [];
  const windows: PlannedWindow[] = [];
  let parsed: unknown = null;
  try { parsed = JSON.parse(inp.featuresText); } catch { /* reported below */ }
  const { track: features, errors } = validateFeatures(parsed);
  let featuresOk = !!features;
  if (!features) holds.push({ window: null, kind: "features", reason: `the feature file is not usable: ${errors.join("; ") || "not JSON"}` });
  if (features && inp.expectSourceSha256 && features.source.sha256 !== inp.expectSourceSha256) {
    featuresOk = false;
    holds.push({ window: null, kind: "features", reason: `the feature file measured audio ${features.source.sha256.slice(0, 12)}…, not the expected ${inp.expectSourceSha256.slice(0, 12)}…` });
  }
  const fps = features?.fps ?? { num: 24, den: 1 };
  const rate = fps.num / fps.den;
  const values = features && featuresOk ? readFeatures(features) : null;
  const ids = new Set<string>();

  for (const w of inp.windows) {
    const problem =
      ids.has(w.id) ? "the window id is used twice"
      : !(FAMILIES as readonly string[]).includes(w.family) ? `unknown family ${w.family}`
      : !(w.musicEndSec > w.musicStartSec) || w.musicStartSec < 0 ? "the window must end after it starts, at or after 0 s"
      : features && w.musicEndSec > features.frames / rate + 1e-6 ? `the window ends after the song (${(features.frames / rate).toFixed(3)} s)`
      : w.intensity && !(w.intensity in INTENSITIES) ? `unknown intensity ${w.intensity}`
      : null;
    ids.add(w.id);
    const startFrame = Math.round(w.musicStartSec * rate);
    const endFrame = Math.round(w.musicEndSec * rate);
    const pw: PlannedWindow = {
      id: w.id, family: w.family, scene: w.scene ?? null, musicStartSec: w.musicStartSec, musicEndSec: w.musicEndSec,
      startFrame, frames: Math.max(0, endFrame - startFrame),
      snapShiftSec: Math.round((startFrame / rate - w.musicStartSec) * 1e6) / 1e6,
      intensity: w.intensity ?? "low", zone: w.zone ?? DEFAULT_ZONES[w.family] ?? DEFAULT_ZONES.GENOME_LOOM,
      seed: (w.seed ?? seedOf(`${inp.songId}/${w.id}/${w.family}`)) >>> 0, geometry: "CONCEPTUAL",
      renderable: !problem && featuresOk,
    };
    windows.push(pw);
    if (problem) { holds.push({ window: w.id, kind: "window", reason: problem }); continue; }
    if (!values || !features) continue;

    const base = { window: w.id, family: w.family, clock: "MUSIC" as const, sourceSha256: features.source.sha256, visualSeed: pw.seed, reviewer: null, label: null };
    events.push({
      ...base, id: `${w.id}/energy`, kind: "energy_envelope", musicalTimeSec: startFrame / rate, durationSec: pw.frames / rate, frame: startFrame,
      evidenceState: "MEASURED", note: "loudness and band energy measured from the audio; drives brightness and size only",
    });
    if (!inp.reducedMotion && w.family !== "RESONANCE_CHAMBER") {
      for (const k of onsetPeaks(values.onset, startFrame, endFrame)) {
        events.push({
          ...base, id: `${w.id}/onset-${k}`, kind: "onset_like", musicalTimeSec: Math.round((k / rate) * 1e6) / 1e6, durationSec: Math.round((0.6) * 1e6) / 1e6, frame: k,
          evidenceState: "MEASURED", note: "an energy peak, not a verified beat; drawn as light only (D8-03)",
        });
      }
    }
    for (const kind of SHOWS[w.family]) {
      const mine = (inp.events ?? []).filter((e) => e.kind === kind && e.musicSec >= w.musicStartSec && e.musicSec < w.musicEndSec);
      const verified = mine.filter((e) => e.evidence?.state === "VERIFIED" && !!e.evidence.reviewer?.trim());
      if (!verified.length) {
        holds.push({ window: w.id, kind, reason: mine.length ? `${mine.length} ${kind} event(s) lack a VERIFIED state and a named reviewer, so none are drawn` : HOLD_REASON[kind] });
        continue;
      }
      if (verified.length < mine.length) holds.push({ window: w.id, kind, reason: `${mine.length - verified.length} ${kind} event(s) lack a VERIFIED state and a named reviewer and are not drawn` });
      for (const e of verified) {
        const frame = Math.round(e.musicSec * rate);
        events.push({
          ...base, id: `${w.id}/${kind}-${frame}`, kind, musicalTimeSec: e.musicSec, durationSec: 0.5, frame,
          evidenceState: "VERIFIED", reviewer: e.evidence.reviewer!.trim(), label: e.label ?? null,
          note: kind === "move_word" ? "a verified move word; its text goes to the caption file, never into the picture (GOV-23)" : "verified by a named person",
        });
      }
    }
  }
  events.sort((a, b) => a.frame - b.frame || a.id.localeCompare(b.id));
  return {
    features: featuresOk ? features : null,
    track: {
      schema: REACTION_TRACK_SCHEMA, renderer: REACTION_RENDERER, songId: inp.songId,
      features: { sha256: inp.featuresSha256, sourceSha256: features?.source.sha256 ?? "", analyzer: features?.schema ?? "" },
      fps, reducedMotion: !!inp.reducedMotion, windows, events, holds, uiStatus: "DRAFT", limits: REACTION_LIMITS,
    },
  };
}

/**
 * Reads windows from JSON ({windows: [...]}) or from the CSV the proof package
 * uses (visual_family, song_start_s, song_end_s, source_scene columns).
 */
export function parseWindows(text: string, name: string): WindowSpec[] {
  const t = text.trim();
  if (t.startsWith("{") || t.startsWith("[")) {
    const raw = JSON.parse(t) as { windows?: WindowSpec[] } | WindowSpec[];
    return Array.isArray(raw) ? raw : raw.windows ?? [];
  }
  const [head, ...rows] = t.replace(/^﻿/, "").split(/\r?\n/).filter((l) => l.trim());
  const cols = head.split(",").map((c) => c.trim());
  const at = (r: string[], c: string) => r[cols.indexOf(c)]?.trim();
  for (const c of ["visual_family", "song_start_s", "song_end_s"]) if (!cols.includes(c)) throw new Error(`${name}: needs a ${c} column`);
  return rows.map((line, i) => {
    const r = line.split(",");
    const family = at(r, "visual_family") as Family;
    const scene = at(r, "source_scene") || undefined;
    return { id: `${String(i + 1).padStart(2, "0")}-${family.toLowerCase().replace(/_/g, "-")}${scene ? `-${scene.toLowerCase()}` : ""}`, family, scene, musicStartSec: Number(at(r, "song_start_s")), musicEndSec: Number(at(r, "song_end_s")) };
  });
}
