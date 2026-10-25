// lib/stuttr/cast.ts
//
// Who sings which section (step 2 of the reviewed Producer plan). A private
// cast file in the song's library folder, <song>/cast.json, names the lead
// voice and the backing voices for every section of the song's Dance8 cue map.
// The Suno lyric file is never changed. From the cast come:
//   - the runs each voice is converted for: only the sections it sings, so no
//     credits go on the rest;
//   - the master, which puts each voice back at its own time;
//   - the singer of each sung line in the cue map, so lip-sync shots are per singer.
// A run starts and ends at the quietest eighth note within a beat of the
// section's bar line, so a pickup note isn't cut in half. Pure: no files.

import type { SongAnalysis } from "./analysis";
import { voiceKey } from "./library";

export const CAST_FILE = "cast.json";
export const CAST_SCHEMA = 1 as const;

/** Where the cast and the cue map it refers to live, relative to the library root. */
export const castRel = (trackId: string) => `${trackId}/${CAST_FILE}`;
export const cuemapRel = (trackId: string) => `${trackId}/dance8/${trackId}.cuemap.json`;
export const analysisRel = (trackId: string) => `${trackId}/analysis/${trackId}.analysis.json`;

export interface CastSection {
  /** A cue id from the song's cue map (intro, verse-1, chorus-1...). */
  id: string;
  /** The lead voice in this section, or null where nobody sings the lead. */
  lead: string | null;
  /** Backing voices layered in this section; "suno" keeps Suno's own backing vocals; [] none. */
  backing: string[] | "suno";
}

export interface CastFile {
  schemaVersion: typeof CAST_SCHEMA;
  trackId: string;
  lang: string;
  sections: CastSection[];
}

export interface CastCue {
  id: string;
  startBar: number;
  endBar: number;
}

/** The suno pseudo-voice: Suno's own backing vocals, kept for a run of sections. */
export const SUNO_BACKING = "suno";

export interface CastRun {
  role: "vocals" | "backing_vocals";
  /** A voice name, or "suno" for Suno's own backing vocals. */
  voice: string;
  /** Its first section id, or "first--last" when it spans several. Names the take. */
  key: string;
  sections: string[];
  /** Song seconds, three decimals. */
  startSec: number;
  endSec: number;
  /** Backing layer gain: 1/sqrt(the most voices layered in any of its sections); 1 for the lead. */
  gain: number;
}

type Grid = Pick<SongAnalysis, "firstDownbeatSec" | "beatSec" | "beatsPerBar">;

const r3 = (x: number) => Math.round(x * 1000) / 1000;
const NAME_OK = /^[A-Za-z0-9][A-Za-z0-9 ._()-]*$/;

/** Problems with a cast against the cue map's sections; empty when it can be used. */
export function validateCast(cast: CastFile, cues: CastCue[], trackId: string): string[] {
  const out: string[] = [];
  if (cast.schemaVersion !== CAST_SCHEMA) out.push(`schemaVersion must be ${CAST_SCHEMA}`);
  if (cast.trackId !== trackId) out.push(`trackId is "${cast.trackId}", not "${trackId}"`);
  if (typeof cast.lang !== "string" || !/^[a-z]{2,3}$/i.test(cast.lang)) out.push(`lang must be a language code such as "en"`);
  if (!Array.isArray(cast.sections)) return [...out, "sections must be a list"];
  const known = new Set(cues.map((q) => q.id));
  const seen = new Set<string>();
  const voiceOk = (v: unknown, where: string) => {
    if (typeof v !== "string" || !NAME_OK.test(v) || !voiceKey(v)) out.push(`${where}: "${String(v)}" is not a voice name`);
    else if (voiceKey(v) === SUNO_BACKING) out.push(`${where}: "suno" stands alone as "backing": "suno", not inside a list`);
  };
  for (const s of cast.sections) {
    if (!known.has(s.id)) out.push(`section "${s.id}" is not in the cue map (sections: ${[...known].join(", ")})`);
    if (seen.has(s.id)) out.push(`section "${s.id}" is listed twice`);
    seen.add(s.id);
    if (s.lead !== null) voiceOk(s.lead, `${s.id} lead`);
    if (s.backing !== SUNO_BACKING) {
      if (!Array.isArray(s.backing)) out.push(`${s.id} backing must be a list of voices, [] or "suno"`);
      else {
        for (const v of s.backing) voiceOk(v, `${s.id} backing`);
        const keys = s.backing.map((v) => voiceKey(String(v)));
        if (new Set(keys).size !== keys.length) out.push(`${s.id} backing names a voice twice`);
      }
    }
  }
  for (const q of cues) if (!seen.has(q.id)) out.push(`section "${q.id}" is missing; list every section of the cue map`);
  return out;
}

/**
 * The song second to change singers at a section's first bar: the middle of
 * the quietest eighth note within a beat of the bar line (ties: closest to the
 * line, then earlier). Without loudness data, the bar line itself.
 */
export function sectionEdgeSec(eighthDb: number[] | null, bar: number, g: Grid): number {
  const eighth = g.beatSec / 2;
  const line = bar * g.beatsPerBar * 2;
  const at = (k: number) => g.firstDownbeatSec + k * eighth;
  if (!eighthDb) return r3(at(line));
  let best = -1;
  let bestDb = Infinity;
  let bestDist = Infinity;
  for (let k = line - 2; k <= line + 1; k++) {
    if (k < 0 || k >= eighthDb.length) continue;
    const db = Number.isFinite(eighthDb[k]) || eighthDb[k] === -Infinity ? eighthDb[k] : Infinity;
    const dist = Math.abs(k + 0.5 - line);
    if (db < bestDb || (db === bestDb && dist < bestDist)) {
      best = k;
      bestDb = db;
      bestDist = dist;
    }
  }
  return r3(best < 0 ? at(line) : at(best + 0.5));
}

/**
 * Every run of sections each voice sings, lead and backing, in song order.
 * Neighbouring runs share their edge exactly, so they never overlap or leave
 * a gap. The first section starts at 0 and the last ends at the song's end.
 */
export function castRuns(cast: CastFile, cues: CastCue[], a: Pick<SongAnalysis, "firstDownbeatSec" | "beatSec" | "beatsPerBar" | "eighthDb">, songSec: number): CastRun[] {
  const order = [...cues].sort((x, y) => x.startBar - y.startBar);
  const byId = new Map(cast.sections.map((s) => [s.id, s]));
  const firstBar = order.length ? order[0].startBar : 0;
  const lastBar = order.length ? order[order.length - 1].endBar : 0;
  const edge = (bar: number, db: number[] | null) =>
    bar <= firstBar ? 0 : bar >= lastBar ? r3(songSec) : Math.min(r3(songSec), Math.max(0, sectionEdgeSec(db, bar, a)));
  const runs: CastRun[] = [];
  const collect = (role: CastRun["role"], voiceOf: (s: CastSection) => string[], gainOf: (s: CastSection) => number) => {
    const db = role === "vocals" ? a.eighthDb.lead : a.eighthDb.backing;
    const voices = [...new Set(order.flatMap((q) => (byId.get(q.id) ? voiceOf(byId.get(q.id)!) : [])))];
    for (const v of voices) {
      let cur: { from: CastCue; to: CastCue; ids: string[]; gain: number } | null = null;
      const flush = () => {
        if (!cur) return;
        const startSec = edge(cur.from.startBar, db);
        const endSec = edge(cur.to.endBar, db);
        if (endSec - startSec >= 0.05) {
          const key = cur.ids.length === 1 ? cur.ids[0] : `${cur.ids[0]}--${cur.ids[cur.ids.length - 1]}`;
          runs.push({ role, voice: v, key, sections: cur.ids, startSec, endSec, gain: cur.gain });
        }
        cur = null;
      };
      for (const q of order) {
        const s = byId.get(q.id);
        const sings = !!s && voiceOf(s).includes(v);
        if (!sings) { flush(); continue; }
        if (cur && cur.to.endBar === q.startBar) {
          cur.to = q;
          cur.ids.push(q.id);
          cur.gain = Math.min(cur.gain, gainOf(s));
        } else {
          flush();
          cur = { from: q, to: q, ids: [q.id], gain: gainOf(s) };
        }
      }
      flush();
    }
  };
  collect("vocals", (s) => (s.lead ? [s.lead] : []), () => 1);
  collect(
    "backing_vocals",
    (s) => (s.backing === SUNO_BACKING ? [SUNO_BACKING] : s.backing),
    (s) => (s.backing === SUNO_BACKING || s.backing.length <= 1 ? 1 : r3(1 / Math.sqrt(s.backing.length))),
  );
  const roleRank = (r: CastRun) => (r.role === "vocals" ? 0 : 1);
  return runs.sort((x, y) => roleRank(x) - roleRank(y) || x.startSec - y.startSec || x.voice.localeCompare(y.voice));
}

/** A starter cast: every section, the given lead where the lead stem sings, Suno's backing where the backing stem sings. */
export function starterCast(
  trackId: string, cues: CastCue[], a: Pick<SongAnalysis, "eighthDb" | "beatsPerBar">, lead: string, lang = "en", sungDb = -40,
): CastFile {
  const per = a.beatsPerBar * 2;
  const sings = (db: number[] | null, q: CastCue) => !!db && db.slice(q.startBar * per, q.endBar * per).some((x) => x > sungDb);
  return {
    schemaVersion: CAST_SCHEMA, trackId, lang,
    sections: [...cues].sort((x, y) => x.startBar - y.startBar).map((q) => ({
      id: q.id,
      lead: sings(a.eighthDb.lead, q) ? lead : null,
      backing: sings(a.eighthDb.backing, q) ? SUNO_BACKING : [],
    })),
  };
}

/** One line per run, for the cast summary. */
export function runLines(runs: CastRun[]): string[] {
  const clock = (s: number) => `${Math.floor(s / 60)}:${(s % 60).toFixed(1).padStart(4, "0")}`;
  return runs.map((r) => `  ${r.role === "vocals" ? "lead   " : "backing"} ${r.voice === SUNO_BACKING ? "Suno's own" : r.voice}: ${r.sections.join(", ")} (${clock(r.startSec)}-${clock(r.endSec)})`);
}
