// lib/dance8/authoring/regrid.ts
//
// Moves a cue map onto a corrected beat grid (dance8 plan --regrid). When a
// song's tempo turns out to be wrong (EDO was tracked at 119.476 BPM; the
// owner verified 94), the sections, scenes and cameras the owner chose stay;
// only their bars change, so each section keeps its place in the song. Every
// boundary is converted to song time on the old grid and back to the nearest
// bar on the new one. Sung phrases widen to whole bars (an earlier start and a
// later end), so a mouth that sings is never shown outside a lip-synced shot.
// Pure: no files.

import type { CueMap, VocalPhrase } from "../contracts/scene";
import { barToSec } from "./validateCueMap";
import type { ShotBrief } from "./shotBriefs";

export interface NewGrid {
  bpm: number;
  beatsPerBar: number;
  /** Song time of bar 0 on the new grid. */
  firstDownbeatSec: number;
  /** Whole bars in the song on the new grid. */
  bars: number;
}

export interface RegridReport {
  from: { tempo: CueMap["tempo"]; firstDownbeatSec: number };
  to: { bpm: number; beatsPerBar: number; firstDownbeatSec: number };
  cues: { id: string; oldBars: [number, number]; newBars: [number, number]; oldSec: [number, number]; newSec: [number, number] }[];
  vocals: { id: string; oldBars: [number, number]; newBars: [number, number]; measured: [number, number] | null }[];
  notes: string[];
}

/** A phrase boundary may sit this far into a bar before it counts as the next bar. */
const SLACK = 0.15;
const r3 = (n: number) => Math.round(n * 1000) / 1000;

export function regridCueMap(old: CueMap, grid: NewGrid, measured: readonly VocalPhrase[] = []): { map: CueMap; report: RegridReport } {
  if (!(grid.bpm > 0 && grid.beatsPerBar > 0 && grid.bars > 0)) throw new Error("the new grid needs a tempo, a time signature and at least one bar");
  const origin = old.firstDownbeatSec ?? 0;
  const songSec = (bar: number) => origin + barToSec(old.tempo, bar);
  const barSec = (grid.beatsPerBar * 60) / grid.bpm;
  const newBarAt = (sec: number) => (sec - grid.firstDownbeatSec) / barSec;
  const newSec = (bar: number) => r3(grid.firstDownbeatSec + bar * barSec);
  const clamp = (b: number) => Math.max(0, Math.min(grid.bars, b));
  const notes: string[] = [];

  // Sections: each boundary to its nearest new bar; a section never shrinks to nothing.
  const rawEnd = old.cues.length ? Math.round(newBarAt(songSec(old.cues[old.cues.length - 1].endBar))) : 0;
  if (rawEnd > grid.bars) notes.push(`the last section ran ${rawEnd - grid.bars} bar(s) past the song's ${grid.bars} on the new grid; it now stops at bar ${grid.bars}`);
  const cues = old.cues.map((q) => ({ ...q, startBar: clamp(Math.round(newBarAt(songSec(q.startBar)))), endBar: clamp(Math.round(newBarAt(songSec(q.endBar)))) }));
  for (let i = 0; i < cues.length; i++) {
    const q = cues[i];
    const prev = cues[i - 1];
    if (prev && q.startBar < prev.endBar) q.startBar = prev.endBar;
    if (q.endBar <= q.startBar) {
      notes.push(`${q.id} was shorter than a bar on the new grid; it keeps one bar and the sections after it move up`);
      q.endBar = q.startBar + 1;
    }
  }
  const last = cues[cues.length - 1];
  if (last && last.endBar > grid.bars) notes.push(`short sections pushed the end ${last.endBar - grid.bars} bar(s) past the song's ${grid.bars}; shorten a section`);

  // Sung phrases keep their ids and voices. Moved by song time they widen to
  // whole bars; where the vocal stem, measured on the new grid, sings a run
  // inside that span, the phrase takes the measured bars instead (the old
  // bars were themselves rounded to the wrong grid).
  const overlap = (a: [number, number], b: { startBar: number; endBar: number }) => Math.min(a[1], b.endBar) - Math.max(a[0], b.startBar);
  const widened: [number, number][] = (old.vocals ?? []).map((v) => {
    const s = clamp(Math.floor(newBarAt(songSec(v.startBar)) + SLACK));
    const e = clamp(Math.ceil(newBarAt(songSec(v.endBar)) - SLACK));
    return [s, Math.max(e, s + 1)];
  });
  // Each measured run belongs to the phrase it overlaps most.
  const owned = widened.map(() => [] as VocalPhrase[]);
  for (const m of measured) {
    let best = -1;
    widened.forEach((w, i) => { if (overlap(w, m) > 0 && (best < 0 || overlap(w, m) > overlap(widened[best], m))) best = i; });
    if (best >= 0) owned[best].push(m);
  }
  const fitted: [number, number][] = widened.map((w, i) => (owned[i].length
    ? [Math.min(...owned[i].map((m) => m.startBar)), Math.max(...owned[i].map((m) => m.endBar))]
    : w));
  // Never let two phrases overlap; where measured runs would, the widened bars stand.
  for (let i = 1; i < fitted.length; i++) {
    if (fitted[i][0] < fitted[i - 1][1]) { fitted[i - 1] = widened[i - 1]; fitted[i] = widened[i]; }
    if (fitted[i][0] < fitted[i - 1][1]) fitted[i] = [fitted[i - 1][1], Math.max(fitted[i][1], fitted[i - 1][1] + 1)];
  }
  const vocals: VocalPhrase[] | undefined = old.vocals?.map((v, i) => ({ ...v, startBar: fitted[i][0], endBar: fitted[i][1] }));
  const vocalReport = (old.vocals ?? []).map((v, i) => {
    const meas: [number, number] | null = owned[i].length ? fitted[i] : null;
    if (!owned[i].length) notes.push(`${v.id} (bars ${fitted[i][0]}-${fitted[i][1]}): the vocal stem has no sung run there on the new grid; check by ear`);
    return { id: v.id, oldBars: [v.startBar, v.endBar] as [number, number], newBars: fitted[i], measured: meas };
  });

  const map: CueMap = {
    ...old,
    version: old.version + 1,
    tempo: [{ startBar: 0, bpm: grid.bpm, beatsPerBar: grid.beatsPerBar }],
    firstDownbeatSec: grid.firstDownbeatSec,
    cues,
    ...(vocals ? { vocals } : {}),
    // The bars changed, so whatever was approved needs a look again.
    approvalStatus: "draft",
  };
  if (old.approvalStatus !== "draft") {
    delete map.approvedBy;
    delete map.approvedAt;
    notes.push(`the cue map was ${old.approvalStatus}; it is a draft again until you check the new bars`);
  }
  const report: RegridReport = {
    from: { tempo: old.tempo, firstDownbeatSec: origin },
    to: { bpm: grid.bpm, beatsPerBar: grid.beatsPerBar, firstDownbeatSec: grid.firstDownbeatSec },
    cues: old.cues.map((q, i) => ({
      id: q.id, oldBars: [q.startBar, q.endBar], newBars: [cues[i].startBar, cues[i].endBar],
      oldSec: [r3(songSec(q.startBar)), r3(songSec(q.endBar))], newSec: [newSec(cues[i].startBar), newSec(cues[i].endBar)],
    })),
    vocals: vocalReport,
    notes,
  };
  return { map, report };
}

/**
 * Old shot ids to new ones, matched by kind, section, camera and voice (in
 * order when a section has several). B-roll ids carry no bar number, so they
 * stay; lip-sync ids end in the bar they start on, so they change with it.
 */
export function shotRenames(before: readonly ShotBrief[], after: readonly ShotBrief[]): { renamed: [string, string][]; gone: string[]; added: string[] } {
  const key = (b: ShotBrief) => `${b.kind}|${b.cueId}|${b.camera}|${b.voice ?? ""}`;
  const pool = new Map<string, string[]>();
  for (const b of after) pool.set(key(b), [...(pool.get(key(b)) ?? []), b.id]);
  const used = new Set<string>();
  const renamed: [string, string][] = [];
  const gone: string[] = [];
  for (const b of before) {
    const next = pool.get(key(b))?.shift();
    if (next === undefined) { gone.push(b.id); continue; }
    used.add(next);
    if (next !== b.id) renamed.push([b.id, next]);
  }
  return { renamed, gone, added: after.filter((b) => !used.has(b.id)).map((b) => b.id) };
}
