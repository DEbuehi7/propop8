// lib/dance8/render/score.ts
//
// The visual score: one checked edit list (render/edit.ts) written out as every
// layout state, cell, transition and event, each with its evidence, so the
// playable page, the rendered video and the review read the same timeline
// (nothing is re-timed by hand in a second place). Pure: inputs in, score out.
//
// One clock. Every time here is song seconds from the master's first sample;
// bars and beats count from the first downbeat (firstDownbeatSec), so
// songSec = firstDownbeatSec + bars and beats. Plan files that keep seconds
// from bar 0 (the Kirtled plan's startSec and atSec) are converted here and
// nowhere else.
//
// Evidence decides what may draw (D8-25): the owner-verified beat grid draws
// pulses; measured energy draws light, never a beat; measured body points draw
// the trace; draft move words, draft lyrics timing and the draft chords are
// listed but HOLD (draw nothing claim-like) until a person approves them.

import { LAYOUT_STATE, type EditList } from "../contracts/edit";
import type { HarmonyTimeline } from "../contracts/harmony";
import type { MoveTrack } from "../contracts/moves";
import type { VisualClipLibrary } from "../contracts/scene";
import type { Footfall } from "../moves/trace";
import { gridSec, framePlan, type EditResolution } from "./edit";
import type { LyricTiming } from "./grid";

export const VISUAL_SCORE_SCHEMA = "dance8.visual-score.v1";

export type Evidence = "verified" | "measured" | "draft" | "estimated" | "hold";

export interface ScoreEvent {
  songSec: number;
  bar: number;
  beat: number;
  kind: "downbeat" | "beat" | "energy_peak" | "vocal_line" | "footfall" | "move_word" | "chord";
  evidence: Evidence;
  /** What the picture may do with it. */
  draws: "pulse" | "light" | "trace" | "ring" | "lyric" | "nothing";
  /** 0-1 where the source gives one (a peak's strength, a model's visibility), else null. */
  confidence: number | null;
  detail: string;
}

export interface ScoreCell {
  cell: string;
  slot: string;
  rect: { x: number; y: number; w: number; h: number };
  role: "singer face" | "singer" | "dancer" | "dance8 trace" | "kirtled" | "story" | "lyrics" | "empty";
  shows: { kind: string; from: number; to: number; what: string; approval: string; evidence: string }[];
}

export interface ScoreState {
  block: string;
  state: (typeof LAYOUT_STATE)[keyof typeof LAYOUT_STATE];
  layout: string;
  start: number;
  land: number;
  end: number;
  transition: string | null;
  primary: string | null;
  lyrics: string | null;
  why: string;
  sung: boolean;
  cells: ScoreCell[];
}

export interface ScoreInput {
  edit: EditList;
  editSha256: string;
  res: EditResolution;
  library: VisualClipLibrary;
  lyrics: LyricTiming | null;
  /** The verified grid's record (who and when), if the song's analysis has one. */
  gridVerified?: { by: string; at: string } | null;
  /** Energy peaks from Stuttr's saved feature track (song seconds, 0-1 strength, the band that leads). */
  peaks?: { songSec: number; strength: number; band: "low" | "mid" | "high" }[];
  featuresSource?: { file: string; sha256: string } | null;
  motion?: Record<string, { track: MoveTrack; footfalls: Footfall[]; poseModel: string }>;
  harmony?: HarmonyTimeline | null;
  /** Frames per second of the baked plan; 0 leaves it out. */
  planFps?: number;
}

const r3 = (n: number) => Math.round(n * 1000) / 1000;

/** Bar and beat (from the first downbeat) of a song second, on a single-tempo grid. */
function barBeat(res: Pick<EditResolution, "tempo" | "firstDownbeatSec">, t: number): { bar: number; beat: number } {
  const seg = res.tempo[0];
  const beats = ((t - res.firstDownbeatSec) * seg.bpm) / 60;
  const bar = Math.floor(beats / seg.beatsPerBar + 1e-9);
  return { bar, beat: r3(beats - bar * seg.beatsPerBar) };
}

export function buildScore(inp: ScoreInput) {
  const { edit, res, library, lyrics } = inp;
  const seg = res.tempo[0];
  const beatSec = 60 / seg.bpm;
  const clipById = new Map(library.clips.map((c) => [c.id, c]));
  const lines = lyrics?.lines ?? [];
  const sungIn = (a: number, b: number) => lines.some((l) => l.start < b && l.end > a);

  // States: one per block, from the start of its transition to the start of the next.
  const states: ScoreState[] = res.blocks.map((b, i) => {
    const end = res.blocks[i + 1]?.start ?? res.endSec;
    const cells: ScoreCell[] = Object.entries(b.cells).map(([cell, slot]) => {
      const list = (res.content[cell] ?? []).filter((e) => e.t0 < end && e.t1 > b.start);
      const shows = list.map((e) => {
        if (e.kind === "story") {
          const s = res.sources[e.source];
          const what = s?.still ? `still ${s.still}` : `clip ${s?.clip?.id}`;
          const approval = s?.still ? (s.approved ? "approved" : "not approved") : (clipById.get(s?.clip?.id ?? "")?.approvalStatus ?? "unknown");
          return { kind: "story", from: e.t0, to: e.t1, what, approval, evidence: "picture" };
        }
        if (e.kind === "take") {
          const tk = edit.takes[e.take];
          return { kind: "take", from: e.t0, to: e.t1, what: `${tk.role} take "${e.take}", view ${e.view}`, approval: tk.standIn ? "stand-in" : "performer", evidence: "picture" };
        }
        if (e.kind === "trace") {
          const m = inp.motion?.[e.take];
          return { kind: "trace", from: e.t0, to: e.t1, what: `body points of take "${e.take}" (${m?.poseModel ?? "pose model"})`, approval: m ? `moves ${m.track.approvalStatus}` : "no motion", evidence: "measured" };
        }
        if (e.kind === "kirtled") {
          return { kind: "kirtled", from: e.t0, to: e.t1, what: `Kirtled ${e.view}${e.take ? ` lit by take "${e.take}"` : ""}`, approval: e.view === "studio" || e.view === "pattern" ? "drawn from the canon geometry" : "drawn stand-in, not the built instrument", evidence: "verified grid; chords HOLD" };
        }
        return { kind: e.kind, from: e.t0, to: e.t1, what: "lyrics", approval: lyrics?.status ?? "none", evidence: "draft" };
      });
      const first = list[0];
      const role: ScoreCell["role"] = !first ? "empty"
        : first.kind === "take" ? (edit.takes[first.take]?.role === "singer" ? (edit.views[first.view]?.shows === "face" ? "singer face" : "singer") : "dancer")
        : first.kind === "trace" ? "dance8 trace" : first.kind === "kirtled" ? "kirtled" : first.kind === "story" ? "story" : "lyrics";
      const rect = res.slots[b.layout][slot]!;
      return { cell, slot, rect: { x: r3(rect.x), y: r3(rect.y), w: r3(rect.w), h: r3(rect.h) }, role, shows };
    });
    return {
      block: b.id, state: LAYOUT_STATE[b.layout], layout: b.layout, start: b.start, land: b.land, end: r3(end),
      transition: b.transition, primary: b.primary ?? null, lyrics: b.lyrics, why: b.why, sung: sungIn(b.start, end), cells,
    };
  });

  // Events, all on the song clock.
  const events: ScoreEvent[] = [];
  const verified = inp.gridVerified ? `verified by ${inp.gridVerified.by} (${inp.gridVerified.at.slice(0, 10)})` : "grid not verified";
  for (let k = 0; ; k++) {
    const t = res.firstDownbeatSec + k * beatSec;
    if (t > res.endSec) break;
    const down = k % seg.beatsPerBar === 0;
    events.push({ songSec: r3(t), bar: Math.floor(k / seg.beatsPerBar), beat: k % seg.beatsPerBar, kind: down ? "downbeat" : "beat",
      evidence: inp.gridVerified ? "verified" : "hold", draws: inp.gridVerified ? "pulse" : "nothing", confidence: null, detail: `${seg.bpm} BPM grid, ${verified}` });
  }
  for (const p of inp.peaks ?? []) {
    const bb = barBeat(res, p.songSec);
    events.push({ songSec: r3(p.songSec), ...bb, kind: "energy_peak", evidence: "measured", draws: "light", confidence: r3(p.strength),
      detail: `${p.band}-band energy peak from the saved feature track; light only, never a beat (D8-25)` });
  }
  for (const l of lines) {
    const bb = barBeat(res, l.start);
    const ev: Evidence = l.timing === "aligned" ? "draft" : "estimated";
    events.push({ songSec: r3(l.start), ...bb, kind: "vocal_line", evidence: ev, draws: "lyric", confidence: null,
      detail: `${l.section ?? ""}: line to ${r3(l.end)} s (${l.timing === "aligned" ? "forced alignment to the vocal stem" : "spread by syllables"}; lyric timing ${lyrics?.status ?? "none"})` });
  }
  for (const [take, m] of Object.entries(inp.motion ?? {})) {
    for (const f of m.footfalls) {
      if (f.songSec < 0 || f.songSec > res.endSec) continue;
      events.push({ songSec: r3(f.songSec), ...barBeat(res, f.songSec), kind: "footfall", evidence: "measured", draws: "ring", confidence: null,
        detail: `take "${take}": ${f.foot} foot down (impact ${f.impact} torso lengths a second)` });
    }
    const approved = m.track.approvalStatus === "approved";
    for (const w of m.track.words) {
      events.push({ songSec: r3(w.songSec), ...barBeat(res, w.songSec), kind: "move_word", evidence: approved ? "verified" : "draft", draws: approved ? "trace" : "nothing", confidence: null,
        detail: `take "${take}": ${w.word} (${w.move}) ${w.detail}${approved ? "" : "; HOLD until the move track is approved (D8-17, D8-25)"}` });
    }
  }
  const h = inp.harmony;
  if (h) for (const e of h.events) {
    const t = gridSec(res, e.startBar, e.startBeat);
    const ok = h.approvalStatus === "approved" || !!e.approvedBy;
    events.push({ songSec: r3(t), bar: e.startBar, beat: e.startBeat, kind: "chord", evidence: ok ? "verified" : e.symbol === "N.C." ? "hold" : "draft",
      draws: ok ? "light" : "nothing", confidence: null,
      detail: `${e.symbol === "N.C." ? "no chord read (unresolved)" : `${e.symbol} read from the mix`}; harmony ${h.approvalStatus}${ok ? "" : ": HOLD, no note names drawn"}` });
  }
  events.sort((a, b) => a.songSec - b.songSec || a.kind.localeCompare(b.kind));

  // The baked plan: what is on screen, frame by frame, for players that must match the render exactly.
  let plan: { fps: number; cells: string[]; frames: number[][][] } | null = null;
  if (inp.planFps) {
    const cells = [...new Set(res.blocks.flatMap((b) => Object.keys(b.cells)))];
    const idx = new Map(cells.map((c, i) => [c, i]));
    const frames: number[][][] = [];
    const n = Math.round(res.endSec * inp.planFps);
    const q = (v: number) => Math.round(v * 10) / 10;
    for (let k = 0; k < n; k++) {
      const fp = framePlan(res, k / inp.planFps);
      frames.push(fp.layers.flatMap((layer, li) => layer.cells.map((c) => {
        const cl = c.clip ?? c.rect;
        return [idx.get(c.cell)!, li, q(c.rect.x), q(c.rect.y), q(c.rect.w), q(c.rect.h), q(cl.x), q(cl.y), q(cl.w), q(cl.h), Math.round(c.alpha * 1000) / 1000, Math.round(layer.alpha * 1000) / 1000, Math.round(c.now * 1000) / 1000];
      })));
    }
    plan = { fps: inp.planFps, cells, frames };
  }

  const counts = (k: ScoreEvent["kind"]) => events.filter((e) => e.kind === k).length;
  return {
    schema: VISUAL_SCORE_SCHEMA,
    trackId: edit.trackId,
    edit: { id: edit.id, sha256: inp.editSha256 },
    clock: {
      timeBase: "song seconds from the master's first sample; bars from the first downbeat",
      bpm: seg.bpm, beatsPerBar: seg.beatsPerBar, firstDownbeatSec: res.firstDownbeatSec, beatSec: r3(beatSec), barSec: r3(beatSec * seg.beatsPerBar),
      endSec: res.endSec, grid: verified, width: res.width, height: res.height,
    },
    states,
    events,
    summary: {
      states: Object.fromEntries(Object.values(LAYOUT_STATE).map((s) => [s, states.filter((x) => x.state === s).length])),
      events: { beats: counts("beat") + counts("downbeat"), energyPeaks: counts("energy_peak"), vocalLines: counts("vocal_line"), footfalls: counts("footfall"), moveWords: counts("move_word"), chords: counts("chord") },
      harmony: h ? { status: h.approvalStatus, events: h.events.length, unresolved: h.events.filter((e) => e.symbol === "N.C.").length, draws: h.approvalStatus === "approved" ? "light" : "nothing (HOLD)" } : null,
      features: inp.featuresSource ?? null,
      metrics: res.metrics,
    },
    plan,
  };
}

export type VisualScore = ReturnType<typeof buildScore>;

const esc = (v: unknown) => { const s = v === null || v === undefined ? "" : String(v); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };

/** One time-sorted table: a row per layout state and a row per event. */
export function scoreCsv(s: VisualScore): string {
  const head = ["song_sec", "bar", "beat", "row", "layout_state", "block", "transition", "cells", "kind", "evidence", "draws", "confidence", "detail"];
  const bb = (t: number) => {
    const beats = ((t - s.clock.firstDownbeatSec) * s.clock.bpm) / 60, bar = Math.floor(beats / s.clock.beatsPerBar + 1e-9);
    return [bar, r3(beats - bar * s.clock.beatsPerBar)];
  };
  const rows: (string | number | null)[][] = [];
  for (const st of s.states) {
    const [bar, beat] = bb(st.land);
    rows.push([r3(st.land), bar, beat, "state", st.state, st.block, st.transition, st.cells.map((c) => `${c.cell}:${c.role}`).join(" | "), st.layout, st.sung ? "sung" : "instrumental", "", "", st.why]);
  }
  for (const e of s.events) rows.push([e.songSec, e.bar, e.beat, "event", "", "", "", "", e.kind, e.evidence, e.draws, e.confidence, e.detail]);
  rows.sort((a, b) => Number(a[0]) - Number(b[0]) || (a[3] === "state" ? -1 : 1));
  return [head, ...rows].map((r) => r.map(esc).join(",")).join("\n") + "\n";
}
