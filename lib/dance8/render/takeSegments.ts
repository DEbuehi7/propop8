// lib/dance8/render/takeSegments.ts
//
// Which parts of a take a checked edit list actually shows, cut into pieces a
// video generator can perform (Kling Motion Control: one continuous reference,
// 3 s at least; 30 s at most with the reference's own orientation, 10 s with the
// character image's). The generated pieces later go back on the song clock at
// exactly these times, so the edit list's cells, crops and timing stay as they
// are and only the performer changes. Pure and deterministic.

import type { EditList } from "../contracts/edit";
import type { EditResolution } from "./edit";

export interface TakeWindow { from: number; to: number }

export interface TakeSegment {
  /** "<take>-NN", in song order. */
  id: string;
  take: string;
  /** Song seconds the piece covers (whole seconds long), handles included. */
  songIn: number;
  songOut: number;
  /** The same span in the take's own file (song + the take's songAt0Sec, applied once). */
  takeIn: number;
  takeOut: number;
  lengthSec: number;
  /** Seconds shared with the piece before (cross-faded when assembled); 0 for the first piece of a window. */
  overlapSec: number;
}

export interface SegmentOptions {
  /** Longest piece the generator takes (30 for Kling Motion Control with video orientation, 10 with image orientation). */
  maxSec: number;
  /** Shortest piece it takes (Kling: 3 s). */
  minSec?: number;
  /** Extra time each side of what is shown, so a cut never lands on a piece's first or last frame. */
  handleSec?: number;
  /** Shown spans closer than this become one piece: a short gap is cheaper to generate than a new piece. */
  mergeGapSec?: number;
  /** Shared seconds between two pieces of one span, cross-faded on assembly. */
  overlapSec?: number;
  /** Preferred cut times inside a long span (the edges of sung lines, downbeats); a cut snaps to the latest one that fits. */
  cuts?: readonly number[];
}

const r3 = (n: number) => Math.round(n * 1000) / 1000;

/** The spans where `take` is on screen: its own cells, and the trace and Kirtled floor cells drawn from its body. */
export function takeWindows(res: EditResolution, edit: EditList, take: string, o: Pick<SegmentOptions, "handleSec" | "mergeGapSec"> = {}): TakeWindow[] {
  const handle = o.handleSec ?? 0.5, gap = o.mergeGapSec ?? 3;
  const spans: TakeWindow[] = [];
  for (const list of Object.values(res.content)) for (const e of list) {
    const uses = e.kind === "take" ? e.take === take : e.kind === "trace" ? e.take === take : e.kind === "kirtled" && e.view === "floor" ? e.take === take : false;
    if (uses) spans.push({ from: Math.max(0, e.t0 - handle), to: Math.min(res.endSec, e.t1 + handle) });
  }
  void edit;
  spans.sort((a, b) => a.from - b.from);
  const out: TakeWindow[] = [];
  for (const s of spans) {
    const last = out.at(-1);
    if (last && s.from - last.to < gap) last.to = Math.max(last.to, s.to);
    else out.push({ ...s });
  }
  return out.map((w) => ({ from: r3(w.from), to: r3(w.to) }));
}

/**
 * Cuts each span into pieces no longer than maxSec, every piece a whole number
 * of seconds (a short span grows to minSec), neighbours sharing overlapSec.
 * A cut lands on the latest preferred cut time that keeps the piece within
 * maxSec, so a sung line is not split mid-word when it can be helped.
 */
export function splitWindows(windows: readonly TakeWindow[], take: string, songAt0Sec: number, endSec: number, o: SegmentOptions): TakeSegment[] {
  const min = o.minSec ?? 3, ov = o.overlapSec ?? 0.5, max = o.maxSec;
  if (!(max >= min + ov)) throw new Error(`maxSec (${max}) must be at least minSec + overlapSec (${min + ov})`);
  const cuts = [...(o.cuts ?? [])].sort((a, b) => a - b);
  const pieces: { a: number; b: number; overlap: number }[] = [];
  for (const w of windows) {
    let s = w.from, overlap = 0;
    while (w.to - s > max) {
      const latest = s + max - ov, earliest = s + min;
      const snap = cuts.filter((c) => c >= earliest && c <= latest).at(-1);
      // Never leave a last piece shorter than minSec.
      let c = snap ?? latest;
      if (w.to - c < min) c = w.to - min;
      pieces.push({ a: s, b: c + ov, overlap });
      s = c; overlap = ov;
    }
    pieces.push({ a: s, b: w.to, overlap });
  }
  const segs = pieces.map((p, i) => {
    // Whole seconds: grow the end (or, at the song's end, the start).
    const len = Math.max(min, Math.ceil(p.b - p.a - 1e-6));
    let a = p.a, b = p.a + len;
    if (b > endSec) { b = endSec; a = Math.max(0, b - len); }
    return {
      id: `${take}-${String(i + 1).padStart(2, "0")}`, take,
      songIn: r3(a), songOut: r3(b), takeIn: r3(a + songAt0Sec), takeOut: r3(b + songAt0Sec), lengthSec: r3(b - a), overlapSec: 0,
    };
  });
  // What two neighbours actually share once lengths are whole seconds; the assembly cross-fades exactly that.
  for (let i = 1; i < segs.length; i++) segs[i].overlapSec = r3(Math.max(0, segs[i - 1].songOut - segs[i].songIn));
  return segs;
}
