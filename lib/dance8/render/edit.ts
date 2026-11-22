// lib/dance8/render/edit.ts
//
// Checks an edit list (contracts/edit.ts) against the song's cue map, clip
// library and lyric timing, resolves every time to song seconds, and says what
// is on screen at any moment (framePlan), so the renderer (editPipeline.ts),
// the playable page and the tests all share one account of the cut.
//
// The rules (docs/DANCE8_OCULAR_DIRECTOR.md, "Edit lists"), approved by the
// owner on the EDO v2 draft:
//   1. One placement per story clip: a clip is listed once, with one mapping
//      from song time to clip time, so no frame of it can show twice. Clips
//      named as too alike (`similar`) never both appear.
//   2. A clip shorter than its window is slowed, at most 15% (frames repeat).
//   3. Every landing is on the eighth-note grid; geometric changes take half a
//      beat and dissolves one beat, ending on the landing.
//   4. A layout changes only at a musical edge: within one beat of the voice
//      entering or leaving (a lyric phrase, a section start, a sung cue), or
//      where a cue section starts.
//   5. While the voice sings, the singer's face is on screen at least 95% of
//      the time (a take whose role is singer, in a view that shows the face).
//   6. The gold triangle at each landing never flashes more than three times a
//      second (D8-25), and the frame pulse is on the downbeat only.
//   7. A final uses approved clips, approved lyric timing, no stand-in takes
//      and no drawn instrument stand-ins, and every principal has a view of its
//      own (the completeness rule, shared with grid plans).
// Pure and deterministic: the same edit and inputs give the same answer.

import type { CueMap, VisualClip, VisualClipLibrary } from "../contracts/scene";
import { FRAME_SIZE } from "../contracts/scene";
import type { CropBox, EditBackdrop, EditContent, EditLayout, EditList, EditSlot, EditTake, EditTime, EditTransition, StillView, TakeView } from "../contracts/edit";
import { EDIT_SLOTS } from "../contracts/edit";
import type { PrincipalList } from "../contracts/instrument";
import { barToSec } from "../authoring/validateCueMap";
import { checkPrincipals, type GridIssue, type LyricTiming, type Rect } from "./grid";

export const MAX_STRETCH = 1.15;
export const MIN_LIP_SYNC = 0.95;
export const GEOMETRY_BEATS = 0.5;
export const DISSOLVE_BEATS = 1;
/** How long the gold triangle at a landing lasts, and the least time between two (three a second at most, D8-25). */
export const ACCENT_SEC = 0.8;
export const MIN_ACCENT_GAP_SEC = 1 / 3;
/** Sung lines closer than this run together as one phrase. */
export const PHRASE_GAP_SEC = 2;

export type EditMap = Pick<CueMap, "trackId" | "tempo" | "firstDownbeatSec" | "maxDriftScore" | "vocals" | "cues">;

const EPS = 1e-6;
const round6 = (n: number) => Math.round(n * 1e6) / 1e6;
const clamp01 = (x: number) => (x < 0 ? 0 : x > 1 ? 1 : x);

// ---------- the grid ----------

function segmentAt(tempo: CueMap["tempo"], bar: number) {
  let seg = tempo[0];
  for (const s of tempo) if (s.startBar <= bar) seg = s;
  return seg;
}
/** The tempo segment sounding at song second t. */
function segmentAtSec(map: Pick<CueMap, "tempo" | "firstDownbeatSec">, t: number) {
  const o = map.firstDownbeatSec ?? 0;
  let seg = map.tempo[0];
  for (const s of map.tempo) if (o + barToSec(map.tempo, s.startBar) <= t + EPS) seg = s;
  return seg;
}
/** Song seconds of a bar and beat on the cue map's grid. */
export function gridSec(map: Pick<CueMap, "tempo" | "firstDownbeatSec">, bar: number, beat = 0): number {
  const seg = segmentAt(map.tempo, bar);
  return round6((map.firstDownbeatSec ?? 0) + barToSec(map.tempo, bar) + (beat * 60) / seg.bpm);
}
export function beatSec(map: Pick<CueMap, "tempo" | "firstDownbeatSec">, t: number): number {
  return 60 / segmentAtSec(map, t).bpm;
}
/** Seconds in the bar sounding at song second t. */
export function barLength(map: Pick<CueMap, "tempo" | "firstDownbeatSec">, t: number): number {
  const seg = segmentAtSec(map, t);
  return (seg.beatsPerBar * 60) / seg.bpm;
}
/** Where song second t falls in its bar, 0 (the downbeat) to under 1. */
export function barPhase(map: Pick<CueMap, "tempo" | "firstDownbeatSec">, t: number): number {
  const seg = segmentAtSec(map, t);
  const start = (map.firstDownbeatSec ?? 0) + barToSec(map.tempo, seg.startBar);
  const bar = (seg.beatsPerBar * 60) / seg.bpm;
  const x = (t - start) / bar;
  return x - Math.floor(x);
}
/** Seconds from t to the nearest eighth note of the grid. */
export function offGrid(map: Pick<CueMap, "tempo" | "firstDownbeatSec">, t: number): number {
  const seg = segmentAtSec(map, t);
  const start = (map.firstDownbeatSec ?? 0) + barToSec(map.tempo, seg.startBar);
  const half = 30 / seg.bpm;
  const x = (t - start) / half;
  return Math.abs(x - Math.round(x)) * half;
}

// ---------- layouts ----------

/**
 * Cell rectangles for each layout. Landscape: a square primary on the left,
 * two cells stacked on the right. Portrait: the square on top, two side by
 * side below. Near square: the primary two thirds wide. A margin and gutters
 * keep the gold frames apart.
 */
export function editSlots(width: number, height: number): Record<EditLayout, Partial<Record<EditSlot, Rect>>> {
  const short = Math.min(width, height);
  const m = Math.round(short / 60);
  const g = Math.round(short / 90);
  let three: Partial<Record<EditSlot, Rect>>;
  if (width >= height * 1.3) {
    const big = height - 2 * m;
    const x = m + big + g;
    const h = (big - g) / 2;
    three = { big: { x: m, y: m, w: big, h: big }, tr: { x, y: m, w: width - x - m, h }, br: { x, y: m + h + g, w: width - x - m, h } };
  } else if (height >= width * 1.3) {
    const big = width - 2 * m;
    const y = m + big + g;
    const w = (big - g) / 2;
    three = { big: { x: m, y: m, w: big, h: big }, tr: { x: m, y, w, h: height - y - m }, br: { x: m + w + g, y, w, h: height - y - m } };
  } else {
    const bw = ((width - 2 * m - g) * 2) / 3;
    const x = m + bw + g;
    const h = (height - 2 * m - g) / 2;
    three = { big: { x: m, y: m, w: bw, h: height - 2 * m }, tr: { x, y: m, w: width - x - m, h }, br: { x, y: m + h + g, w: width - x - m, h } };
  }
  const cw = (width - 2 * m - 2 * g) / 3;
  const ch = (height - 2 * m - 2 * g) / 3;
  const nine: Partial<Record<EditSlot, Rect>> = {};
  for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++) nine[`r${r}c${c}` as EditSlot] = { x: m + c * (cw + g), y: m + r * (ch + g), w: cw, h: ch };
  const qw = (width - 2 * m - g) / 2, qh = (height - 2 * m - g) / 2;
  const quad: Partial<Record<EditSlot, Rect>> = {};
  for (let r = 0; r < 2; r++) for (let c = 0; c < 2; c++) quad[`q${r * 2 + c}` as EditSlot] = { x: m + c * (qw + g), y: m + r * (qh + g), w: qw, h: qh };
  // eight: the big cell of "three", and the space beside it as two columns of four (landscape) or two rows of four.
  const big = three.big!, eight: Partial<Record<EditSlot, Rect>> = { big };
  const side: Rect = width >= height ? { x: big.x + big.w + g, y: m, w: width - (big.x + big.w + g) - m, h: height - 2 * m } : { x: m, y: big.y + big.h + g, w: width - 2 * m, h: height - (big.y + big.h + g) - m };
  const [cols, rows] = side.w >= side.h ? [4, 2] : [2, 4];
  const ew = (side.w - (cols - 1) * g) / cols, eh = (side.h - (rows - 1) * g) / rows;
  for (let k = 0; k < 8; k++) eight[`e${k}` as EditSlot] = { x: side.x + (k % cols) * (ew + g), y: side.y + Math.floor(k / cols) * (eh + g), w: ew, h: eh };
  // inset: the whole frame, and beside the dancer a tall panel on the right, as in the Dance8 studio (landscape: 30% of
  // the width, the frame's height inside the margins); in portrait a band along the bottom.
  const pip: Rect = width >= height
    ? { x: width - Math.round(width * 0.3) - 2 * m, y: 2 * m, w: Math.round(width * 0.3), h: height - 4 * m }
    : { x: 2 * m, y: height - Math.round(height * 0.3) - 2 * m, w: width - 4 * m, h: Math.round(height * 0.3) };
  const inset: Partial<Record<EditSlot, Rect>> = { full: { x: 0, y: 0, w: width, h: height }, pip };
  return { one: { full: { x: 0, y: 0, w: width, h: height } }, three, quad, eight, nine, inset };
}

// ---------- resolved edit ----------

export interface ResolvedEditBlock {
  id: string;
  index: number;
  land: number;
  /** Start of the transition into this block (= land for a cut, content change or the first block). */
  start: number;
  layout: EditLayout;
  cells: Record<string, EditSlot>;
  transition: EditTransition | null;
  primary?: string;
  lyrics: "band" | "hook" | "cell" | null;
  acrostic?: string;
  now?: { at: number; cell: string }[];
  why: string;
}

export interface ResolvedSource {
  id: string;
  /** A clip of the clip library, or a still plate (its file, relative to <song>/dance8/). */
  clip?: VisualClip;
  still?: string;
  /** A still's move over its window. */
  move?: { from: StillView; to: StillView };
  approved?: boolean;
  origin: number;
  end: number;
  inSec: number;
  /** 1 or more: how much the clip is slowed to fill its window. */
  stretch: number;
  crop: CropBox;
}

export interface ResolvedBackdrop { source?: string; dim: number; push: number; then?: { source: string; t0: number; t1: number; dim: number } }

export type ResolvedContent = EditContent & { t0: number; t1: number; fadeInSec: number; fadeOutSec: number; backdropR?: ResolvedBackdrop };

export interface EditMetrics {
  sungSec: number;
  /** Share of sung time with the singer's face on screen, and with it filling at least a quarter of the frame. */
  faceOnScreenPct: number;
  faceQuarterFramePct: number;
  /** Share of sung time with the singer's face the largest picture on screen (or as large as any other). */
  faceLargestPct: number;
  bySection: Record<string, number>;
  layoutChanges: number;
  landings: number;
  landingsOnGrid: number;
  layoutChangesAtMusicalEdges: number;
  storyClipsUsed: number;
  stillsUsed: number;
  maxStretch: number;
}

export interface EditResolution {
  ok: boolean;
  errors: GridIssue[];
  warnings: GridIssue[];
  width: number;
  height: number;
  fps: number;
  endSec: number;
  totalFrames: number;
  tempo: CueMap["tempo"];
  firstDownbeatSec: number;
  blocks: ResolvedEditBlock[];
  sources: Record<string, ResolvedSource>;
  takes: Record<string, EditTake>;
  views: Record<string, TakeView>;
  content: Record<string, ResolvedContent[]>;
  slots: Record<EditLayout, Partial<Record<EditSlot, Rect>>>;
  /** Landing times of the gold triangle accents (every block after the first). */
  accents: number[];
  flares: number[];
  /** Song times where a vocal phrase or section starts or ends. */
  vocalEdges: number[];
  endCard: { text: string; at: number } | null;
  metrics: EditMetrics | null;
}

// ---------- what is on screen ----------

export interface PlannedCell {
  cell: string;
  rect: Rect;
  /** Visible part while the cell opens (null: all of it). */
  clip: Rect | null;
  alpha: number;
  /** 1 when the light is on this cell, falling to 0 when another has it (nine-view only). */
  now: number;
  layout: EditLayout;
  block: string;
  entry: ResolvedContent | null;
}
export interface FramePlan {
  kind: "steady" | EditTransition;
  /** One layer, or two for a dissolve (the second fading in with `alpha`). */
  layers: { alpha: number; cells: PlannedCell[] }[];
  progress: number;
  from: number;
  to: number;
}

export const ease = (p: number) => { const x = clamp01(p); return x < 0.5 ? 4 * x ** 3 : 1 - (-2 * x + 2) ** 3 / 2; };
const lerpRect = (a: Rect, b: Rect, e: number): Rect => ({ x: a.x + (b.x - a.x) * e, y: a.y + (b.y - a.y) * e, w: a.w + (b.w - a.w) * e, h: a.h + (b.h - a.h) * e });

/** The visible part of a cell `R` opening from the edge (or corner) it shares with the primary's rectangle `P`. */
export function openFrom(R: Rect, P: Rect, e: number): Rect {
  const dx = R.x >= P.x + P.w - 1 ? 1 : R.x + R.w <= P.x + 1 ? -1 : 0;
  const dy = R.y >= P.y + P.h - 1 ? 1 : R.y + R.h <= P.y + 1 ? -1 : 0;
  let x0 = R.x, x1 = R.x + R.w, y0 = R.y, y1 = R.y + R.h;
  if (dx === 1) x1 = R.x + R.w * e;
  else if (dx === -1) x0 = R.x + R.w * (1 - e);
  if (dy === 1) y1 = R.y + R.h * e;
  else if (dy === -1) y0 = R.y + R.h * (1 - e);
  if (dx === 0 && dy === 0) {
    const cx = R.x + R.w / 2, cy = R.y + R.h / 2;
    x0 = cx - (R.w * e) / 2; x1 = cx + (R.w * e) / 2; y0 = cy - (R.h * e) / 2; y1 = cy + (R.h * e) / 2;
  }
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
}

export function contentAt(res: Pick<EditResolution, "content">, cell: string, t: number): ResolvedContent | null {
  for (const e of res.content[cell] ?? []) if (e.t0 - EPS <= t && t < e.t1) return e;
  return null;
}

function nowWeights(b: ResolvedEditBlock, t: number): Record<string, number> {
  if (!b.now?.length) return {};
  const seq = b.now;
  let k = 0;
  seq.forEach((x, j) => { if (x.at <= t) k = j; });
  const has = (target: string, cell: string) => (target === "all" || target === cell ? 1 : 0);
  const cur = seq[k].cell, prev = k > 0 ? seq[k - 1].cell : cur;
  const r = clamp01((t - seq[k].at) / 0.2);
  const out: Record<string, number> = {};
  for (const cell of Object.keys(b.cells)) out[cell] = (1 - r) * has(prev, cell) + r * has(cur, cell);
  return out;
}

/** Which blocks are on screen at t, and how far through a transition. */
export function stateAt(res: Pick<EditResolution, "blocks">, t: number): { kind: FramePlan["kind"]; from: number; to: number; progress: number } {
  const bs = res.blocks;
  for (let i = bs.length - 1; i >= 0; i--) {
    const b = bs[i];
    if (t >= b.land - EPS) return { kind: "steady", from: i, to: i, progress: 1 };
    if (i > 0 && b.start < b.land - EPS && t >= b.start) return { kind: b.transition!, from: i - 1, to: i, progress: (t - b.start) / (b.land - b.start) };
  }
  return { kind: "steady", from: 0, to: 0, progress: 1 };
}

/** Everything on screen at song second t. */
export function framePlan(res: Pick<EditResolution, "blocks" | "content" | "slots">, t: number): FramePlan {
  const s = stateAt(res, t);
  const rect = (i: number, cell: string) => res.slots[res.blocks[i].layout][res.blocks[i].cells[cell]]!;
  const make = (i: number, cell: string, r: Rect, clip: Rect | null, alpha: number): PlannedCell => {
    const b = res.blocks[i];
    return { cell, rect: r, clip, alpha, now: nowWeights(b, t)[cell] ?? 1, layout: b.layout, block: b.id, entry: contentAt(res, cell, t) };
  };
  const steady = (i: number) => Object.keys(res.blocks[i].cells).map((c) => make(i, c, rect(i, c), null, 1));
  if (s.kind === "steady" || s.kind === "cut" || s.kind === "content") return { kind: s.kind, layers: [{ alpha: 1, cells: steady(s.to) }], progress: s.progress, from: s.from, to: s.to };
  const e = ease(s.progress);
  if (s.kind === "dissolve") return { kind: s.kind, layers: [{ alpha: 1, cells: steady(s.from) }, { alpha: e, cells: steady(s.to) }], progress: s.progress, from: s.from, to: s.to };
  const b0 = res.blocks[s.from], b1 = res.blocks[s.to];
  const prim = b1.primary && b0.cells[b1.primary] ? b1.primary : undefined;
  const P = prim ? rect(s.to, prim) : null;
  const cells: PlannedCell[] = [];
  for (const c of Object.keys(b0.cells)) if (!(c in b1.cells)) cells.push(make(s.from, c, rect(s.from, c), null, 1 - e));
  for (const c of Object.keys(b1.cells)) if (!(c in b0.cells)) { const R = rect(s.to, c); cells.push(make(s.to, c, R, openFrom(R, P ?? { x: R.x + R.w / 2, y: R.y + R.h / 2, w: 0, h: 0 }, e), 1)); }
  for (const c of Object.keys(b1.cells)) if (c in b0.cells) cells.push(make(s.to, c, lerpRect(rect(s.from, c), rect(s.to, c), e), null, 1));
  return { kind: "geometry", layers: [{ alpha: 1, cells }], progress: s.progress, from: s.from, to: s.to };
}

/** Where the camera looks on a still at song second t: its move, eased over the source's whole window. */
export function stillViewAt(src: Pick<ResolvedSource, "origin" | "end" | "move">, t: number): StillView {
  const m = src.move ?? { from: { x: 0.5, y: 0.5, zoom: 1 }, to: { x: 0.5, y: 0.5, zoom: 1.06 } };
  const e = ease((t - src.origin) / Math.max(1e-6, src.end - src.origin));
  return { x: m.from.x + (m.to.x - m.from.x) * e, y: m.from.y + (m.to.y - m.from.y) * e, zoom: m.from.zoom + (m.to.zoom - m.from.zoom) * e };
}

/** How visible a take's performer is at t (its fade in and out). */
export function performerAlpha(e: ResolvedContent, t: number): number {
  let m = 1;
  if (e.fadeInSec > 0) m *= clamp01((t - e.t0) / e.fadeInSec);
  if (e.fadeOutSec > 0) m *= clamp01((e.t1 - t) / e.fadeOutSec);
  return m;
}

// ---------- lyrics ----------

/** The line on screen at t and its opacity: up 0.2 s before it is sung, down 0.6 s after it ends or as the next arrives. */
export function lyricAt(lyrics: LyricTiming | null, t: number): { index: number; opacity: number } | null {
  if (!lyrics) return null;
  const L = lyrics.lines;
  for (let k = 0; k < L.length; k++) {
    const next = k + 1 < L.length ? L[k + 1].start : Infinity;
    const on = L[k].start - 0.2, off = Math.min(L[k].end + 0.6, next - 0.05);
    if (t >= on && t < off) return { index: k, opacity: clamp01((t - on) / 0.2) * clamp01((off - t) / 0.25) };
  }
  return null;
}
const letters = (s: string) => s.toLowerCase().replace(/[^a-zÀ-ɏ]/g, "");
/**
 * The line's words as shown, each with the time it is sung: aligned word times
 * are matched to the written words by letter position, so a stutter written
 * "B-B-Boats" takes the time of "boats". Lines with no word times get null.
 */
export function tokenTimes(line: LyricTiming["lines"][number]): { tokens: string[]; times: (number | null)[] } {
  const tokens = line.text.split(/\s+/).filter(Boolean);
  const words = line.words ?? [];
  if (!words.length) return { tokens, times: tokens.map(() => null) };
  const wl = words.map((w) => letters(w.w).length);
  const totW = wl.reduce((a, b) => a + b, 0) || 1;
  const tl = tokens.map((x) => letters(x).length);
  const totT = tl.reduce((a, b) => a + b, 0) || 1;
  const cum: number[] = [0];
  for (const n of wl) cum.push(cum[cum.length - 1] + n);
  let c = 0;
  const times = tl.map((n) => {
    const pos = (c / totT) * totW;
    let j = 0;
    while (j + 1 < words.length && cum[j + 1] <= pos) j++;
    c += n;
    return words[j].start;
  });
  return { tokens, times };
}
export const isCaps = (tok: string) => { const s = tok.replace(/[^A-Za-z]/g, ""); return s.length >= 2 && s === s.toUpperCase(); };
/** The first letters of a section's all-capital words, with the time each is sung. */
export function acrosticOf(lyrics: LyricTiming | null, section: string): { letter: string; sec: number }[] {
  const out: { letter: string; sec: number }[] = [];
  for (const l of lyrics?.lines ?? []) {
    if (l.section !== section) continue;
    const { tokens, times } = tokenTimes(l);
    tokens.forEach((tok, i) => { if (isCaps(tok)) out.push({ letter: tok.replace(/[^A-Za-z]/g, "")[0], sec: times[i] ?? l.start }); });
  }
  return out;
}

// ---------- the check ----------

/**
 * Checks `edit` and resolves it. A final (o.approved) refuses what a draft
 * only warns about. Metrics are computed when the edit checks out.
 */
export function resolveEdit(
  edit: EditList,
  map: EditMap,
  library: VisualClipLibrary,
  o: { fps: number; approved?: boolean; lyrics?: LyricTiming | null; principals?: PrincipalList | null },
): EditResolution {
  const errors: GridIssue[] = [];
  const warnings: GridIssue[] = [];
  const err = (path: string, message: string) => errors.push({ path, message });
  const warn = (path: string, message: string) => warnings.push({ path, message });
  const miss = o.approved ? err : warn;
  const tail = o.approved ? "" : " (fine for a draft)";
  const size = FRAME_SIZE[edit.aspect];
  const [width, height] = size ?? [0, 0];
  const lyrics = o.lyrics ?? null;
  const base: EditResolution = {
    ok: false, errors, warnings, width, height, fps: o.fps, endSec: 0, totalFrames: 0, tempo: map.tempo, firstDownbeatSec: map.firstDownbeatSec ?? 0,
    blocks: [], sources: {}, takes: edit.takes ?? {}, views: edit.views ?? {}, content: {}, slots: editSlots(width, height), accents: [], flares: [], vocalEdges: [], endCard: null, metrics: null,
  };
  const fail = () => ({ ...base, ok: false });

  if (edit.schemaVersion !== 1) err("schemaVersion", "must be 1");
  if (edit.trackId !== map.trackId) err("trackId", `is "${edit.trackId}", but the cue map is for "${map.trackId}"`);
  if (!size) err("aspect", `must be one of ${Object.keys(FRAME_SIZE).join(", ")}`);
  if (!(Number.isInteger(o.fps) && o.fps > 0)) err("fps", "must be a whole number of frames a second");
  if (!Array.isArray(edit.blocks) || edit.blocks.length === 0) err("blocks", "needs at least one block");
  if (errors.length) return fail();

  const songEnd = Math.max(0, ...map.cues.map((c) => gridSec(map, c.endBar)));
  const endSec = edit.endSec ?? songEnd;
  if (!(endSec > 0)) err("endSec", "must be after 0");

  // Blocks: lands first (numbers or grid places), then block references.
  const blocks: ResolvedEditBlock[] = [];
  const blockIds = new Set<string>();
  const timeOf = (at: EditTime, path: string, allowBlock = true): number | null => {
    if (typeof at === "number") return Number.isFinite(at) ? at : (err(path, "must be a number of seconds"), null);
    if (at && typeof at === "object" && "bar" in at) {
      if (!(Number.isFinite(at.bar) && at.bar >= 0)) return err(path, "bar must be 0 or more"), null;
      return gridSec(map, at.bar, at.beat ?? 0);
    }
    if (at && typeof at === "object" && "block" in at && allowBlock) {
      const b = blocks.find((x) => x.id === at.block);
      if (!b) return err(path, `no block "${at.block}"`), null;
      return (at.at ?? "land") === "start" ? b.start : b.land;
    }
    err(path, allowBlock ? "must be seconds, {bar, beat} or {block, at}" : "must be seconds or {bar, beat}");
    return null;
  };
  edit.blocks.forEach((b, i) => {
    const p = `blocks[${i}]`;
    if (!b.id || blockIds.has(b.id)) err(`${p}.id`, b.id ? `"${b.id}" is used twice` : "is missing");
    blockIds.add(b.id);
    const land = timeOf(b.land, `${p}.land`, false);
    if (land === null) return;
    if (!(b.layout in EDIT_SLOTS)) { err(`${p}.layout`, "must be one, three, quad, eight, nine or inset"); return; }
    const slots = Object.values(b.cells ?? {});
    const want = EDIT_SLOTS[b.layout];
    if (slots.length !== want.length || want.some((s) => !slots.includes(s))) { err(`${p}.cells`, `a "${b.layout}" layout fills each of ${want.join(", ")} once`); return; }
    const prev = blocks[blocks.length - 1];
    const sameCells = !!prev && prev.layout === b.layout && JSON.stringify(prev.cells) === JSON.stringify(b.cells);
    const tr: EditTransition | null = i === 0 ? null : b.transition ?? (sameCells ? "content" : "geometry");
    if (tr && !["cut", "geometry", "dissolve", "content"].includes(tr)) { err(`${p}.transition`, "must be cut, geometry, dissolve or content"); return; }
    if (tr === "content" && !sameCells) err(`${p}.transition`, "a content change keeps the same cells in the same slots");
    const dur = tr === "geometry" ? GEOMETRY_BEATS * beatSec(map, land - EPS) : tr === "dissolve" ? DISSOLVE_BEATS * beatSec(map, land - EPS) : 0;
    const start = round6(land - dur);
    if (i === 0 && Math.abs(land) > 1e-3) err(`${p}.land`, "the first block lands at 0");
    if (prev && start < prev.land + 1 / o.fps - EPS) err(`${p}.land`, `its transition starts at ${start.toFixed(3)} s, before the block before it lands (${prev.land.toFixed(3)} s)`);
    if (i > 0 && !(b.why ?? "").trim()) err(`${p}.why`, "say the musical reason for the change (a voice entering, a section starting)");
    if (b.primary !== undefined && !(b.primary in b.cells)) err(`${p}.primary`, `"${b.primary}" is not one of this block's cells`);
    if (tr === "geometry" && prev && b.primary !== undefined && !(b.primary in prev.cells)) err(`${p}.primary`, `"${b.primary}" is not on screen before the change, so it cannot carry the picture through it`);
    const now = b.now?.map((x, j) => {
      const at = timeOf(x.at, `${p}.now[${j}].at`, false);
      if (x.cell !== "all" && !(x.cell in b.cells)) err(`${p}.now[${j}].cell`, `"${x.cell}" is not one of this block's cells`);
      return { at: at ?? 0, cell: x.cell };
    });
    if (b.lyrics && !["band", "hook", "cell"].includes(b.lyrics)) err(`${p}.lyrics`, "must be band, hook or cell");
    if (b.lyrics === "band" && !Object.keys(b.cells).some((c) => (edit.content?.[c] ?? []).some((e) => e.kind === "take"))) warn(`${p}.lyrics`, "a band sits under the singer's cell, and this block has no take");
    if (b.lyrics === "cell" && !Object.keys(b.cells).some((c) => (edit.content?.[c] ?? []).some((e) => e.kind === "lyrics"))) err(`${p}.lyrics`, "needs a cell showing the lyrics");
    blocks.push({ id: b.id, index: i, land: round6(land), start, layout: b.layout, cells: { ...b.cells }, transition: tr, primary: b.primary, lyrics: b.lyrics ?? null, acrostic: b.acrostic, now, why: (b.why ?? "").trim() });
  });
  blocks.forEach((b, i) => { if (i > 0 && b.land <= blocks[i - 1].land) err(`blocks[${i}].land`, "blocks land in time order"); });
  if (blocks.length && blocks[blocks.length - 1].land >= endSec) err("blocks", "the last block lands after the edit ends");
  if (errors.length) return fail();

  // Landings on the grid (rule 3).
  blocks.forEach((b, i) => { if (i > 0 && offGrid(map, b.land) > 1e-3) err(`blocks[${i}].land`, `${b.land.toFixed(3)} s is ${offGrid(map, b.land).toFixed(3)} s off the eighth-note grid`); });

  // Musical edges (rule 4).
  const edges = new Set<number>();
  const phrases: [number, number][] = [];
  const sung = [...(lyrics?.lines ?? [])].sort((a, b) => a.start - b.start);
  for (const l of sung) {
    const last = phrases[phrases.length - 1];
    if (last && l.start - last[1] < PHRASE_GAP_SEC) last[1] = Math.max(last[1], l.end);
    else phrases.push([l.start, l.end]);
  }
  for (const [a, b] of phrases) { edges.add(round6(a)); edges.add(round6(b)); }
  // V5 (owner's brief, 21 Nov): a sung line's onset counts too when its timing was aligned to the voice, so a
  // split or a merge can land on the line it serves. Estimated lines (spread by syllables) do not.
  for (const l of sung) if (l.timing === "aligned") edges.add(round6(l.start));
  const sectionStart = new Map<string, number>();
  for (const l of sung) if (l.section && !sectionStart.has(l.section)) sectionStart.set(l.section, l.start);
  for (const v of sectionStart.values()) edges.add(round6(v));
  for (const v of map.vocals ?? []) { edges.add(gridSec(map, v.startBar)); edges.add(gridSec(map, v.endBar)); }
  const cueStarts = map.cues.map((c) => gridSec(map, c.startBar));
  const vocalEdges = [...edges].sort((a, b) => a - b);
  let atEdges = 0, layoutChanges = 0;
  blocks.forEach((b, i) => {
    if (i === 0 || blocks[i - 1].layout === b.layout) return;
    layoutChanges++;
    const nearVoice = vocalEdges.some((e) => Math.abs(b.land - e) <= beatSec(map, b.land) + 1e-3);
    const onCue = cueStarts.some((c) => Math.abs(b.land - c) < 1e-3);
    if (nearVoice || onCue) atEdges++;
    else err(`blocks[${i}].land`, `the layout changes (${blocks[i - 1].layout} to ${b.layout}) at ${b.land.toFixed(3)} s, not within a beat of the voice entering or leaving, nor where a cue starts`);
  });

  // Accents (rule 6).
  const accents = blocks.slice(1).map((b) => b.land);
  accents.forEach((a, i) => { if (i > 0 && a - accents[i - 1] < MIN_ACCENT_GAP_SEC - EPS) err(`blocks[${i + 1}].land`, "lands too soon after the block before: the gold triangles would flash more than three times a second"); });
  const flares = (edit.flares ?? []).map((f, i) => timeOf(f, `flares[${i}]`, true) ?? 0);
  let endCard: EditResolution["endCard"] = null;
  if (edit.endCard) {
    const at = timeOf(edit.endCard.at, "endCard.at", true);
    if (at !== null && !(at >= 0 && at < endSec)) err("endCard.at", "must fall inside the edit");
    if (!edit.endCard.text?.trim()) err("endCard.text", "is empty");
    if (at !== null) endCard = { text: edit.endCard.text, at: round6(at) };
  }

  // Sources (rules 1 and 2).
  const byId = new Map(library.clips.map((c) => [c.id, c]));
  const sources: Record<string, ResolvedSource> = {};
  const clipOwner = new Map<string, string>();
  for (const [id, s] of Object.entries(edit.sources ?? {})) {
    const p = `sources.${id}`;
    if (!!s.clip === !!s.still) { err(p, "names a clip or a still, not both and not neither"); continue; }
    const key = (s.clip ?? s.still)!;
    if (clipOwner.has(key)) { err(`${p}.${s.clip ? "clip" : "still"}`, `${key} is already placed as "${clipOwner.get(key)}"; ${s.clip ? "a clip" : "a still"} has one placement, so it never shows twice`); continue; }
    clipOwner.set(key, id);
    const origin = timeOf(s.origin, `${p}.origin`, true);
    const end = timeOf(s.end, `${p}.end`, true);
    if (origin === null || end === null) continue;
    if (!(end > origin)) { err(`${p}.end`, "must be after origin"); continue; }
    const crop = s.crop ?? [0, 0, 1, 1];
    if (!(crop.length === 4 && crop[0] >= 0 && crop[1] >= 0 && crop[2] <= 1 && crop[3] <= 1 && crop[2] > crop[0] && crop[3] > crop[1])) err(`${p}.crop`, "must be [left, top, right, bottom] fractions inside the frame");
    if (s.still) {
      if (!/\.(png|jpe?g|webp)$/i.test(s.still)) err(`${p}.still`, "must be a PNG, JPEG or WebP image");
      if (s.inSec !== undefined) err(`${p}.inSec`, "a still has no in-point; its move covers the window");
      const move = s.move ?? { from: { x: 0.5, y: 0.5, zoom: 1 }, to: { x: 0.5, y: 0.5, zoom: 1.06 } };
      for (const [k, v] of Object.entries(move)) {
        if (!(v && v.x >= 0 && v.x <= 1 && v.y >= 0 && v.y <= 1 && v.zoom >= 1 && v.zoom <= 3)) err(`${p}.move.${k}`, "needs x and y from 0 to 1 and a zoom from 1 to 3");
      }
      if (!s.approved) miss(p, `the still ${s.still} is not approved; a final uses approved stills only${tail}`);
      sources[id] = { id, still: s.still, origin: round6(origin), end: round6(end), inSec: 0, stretch: 1, crop, move, approved: !!s.approved };
      continue;
    }
    if (s.move !== undefined) err(`${p}.move`, "only a still has a move; a clip moves by itself (use push on its content)");
    const clip = byId.get(s.clip!);
    if (!clip) { err(`${p}.clip`, `no clip "${s.clip}" in the clip library`); continue; }
    if (clip.approvalStatus === "retired") err(p, `${clip.id} is retired`);
    const measured = clip.drift.status === "known" && clip.drift.driftScore !== null && clip.drift.driftScore <= map.maxDriftScore + EPS;
    if (clip.approvalStatus !== "approved" || !measured) miss(p, `${clip.id} is ${clip.approvalStatus !== "approved" ? "not approved" : "unmeasured or over the drift limit"}; a final uses approved clips only${tail}`);
    const inSec = s.inSec ?? 0;
    if (!(inSec >= 0 && inSec < clip.durationSec)) { err(`${p}.inSec`, `must be from 0 to under ${clip.durationSec} s`); continue; }
    const stretch = round6(Math.max(1, (end - origin) / (clip.durationSec - inSec)));
    if (stretch > MAX_STRETCH + EPS) err(p, `${clip.id} has ${(clip.durationSec - inSec).toFixed(2)} s for a ${(end - origin).toFixed(2)} s window: it would play ${Math.round((stretch - 1) * 100)}% slow (at most ${Math.round((MAX_STRETCH - 1) * 100)}%); shorten the window or regenerate the clip longer`);
    else if (stretch > 1 + EPS) warn(p, `${clip.id} plays ${((stretch - 1) * 100).toFixed(1)}% slow to fill its window (frames repeat)`);
    if (clip.trick) err(p, `${clip.id} is a skate-trick clip; tricks land on their chord change and are never free footage (D8-16)`);
    sources[id] = { id, clip, origin: round6(origin), end: round6(end), inSec, stretch, crop };
  }
  for (const [a, b] of edit.similar ?? []) {
    if (clipOwner.has(a) && clipOwner.has(b)) err("similar", `${a} and ${b} are too alike to appear in one edit; keep one`);
  }

  // Takes and views.
  for (const [id, tk] of Object.entries(edit.takes ?? {})) {
    const p = `takes.${id}`;
    if (!tk.file) err(`${p}.file`, "is missing");
    if (!["singer", "dancer"].includes(tk.role)) err(`${p}.role`, "must be singer or dancer");
    if (!Number.isFinite(tk.songAt0Sec)) err(`${p}.songAt0Sec`, "must be the file second where song time 0 falls");
    if (tk.standIn) miss(p, `"${id}" is a stand-in take; a final shows the character's own performance${tail}`);
    else if (tk.generated && !tk.approved) miss(p, `"${id}" is a generated take nobody has approved yet; set "approved": true after its checks${tail}`);
  }
  for (const [id, v] of Object.entries(edit.views ?? {})) {
    const c = v.box;
    if (!(Array.isArray(c) && c.length === 4 && c[0] >= 0 && c[1] >= 0 && c[2] <= 1 && c[3] <= 1 && c[2] > c[0] && c[3] > c[1])) err(`views.${id}.box`, "must be [left, top, right, bottom] fractions inside the frame");
    if (!["face", "body"].includes(v.shows)) err(`views.${id}.shows`, "must be face or body");
  }

  // Content.
  const content: Record<string, ResolvedContent[]> = {};
  const usedSources = new Set<string>();
  let showsKirtled = false, showsLyrics = false;
  for (const [cell, list] of Object.entries(edit.content ?? {})) {
    const out: ResolvedContent[] = [];
    (list ?? []).forEach((e, j) => {
      const p = `content.${cell}[${j}]`;
      const t0 = timeOf(e.from, `${p}.from`), t1 = timeOf(e.to, `${p}.to`);
      if (t0 === null || t1 === null) return;
      if (!(t1 > t0)) { err(p, "ends before it starts"); return; }
      const prev = out[out.length - 1];
      if (prev && t0 < prev.t1 - 1e-3) err(p, `starts at ${t0.toFixed(3)} s, before the entry before it ends (${prev.t1.toFixed(3)} s)`);
      const within = (sid: string, a: number, b: number, what: string) => {
        const s = sources[sid];
        if (!s) { if (!(sid in (edit.sources ?? {}))) err(p, `${what} "${sid}" is not a source`); return; }
        usedSources.add(sid);
        if (a < s.origin - 1e-3 || b > s.end + 1e-3) err(p, `shows ${sid} at ${a.toFixed(2)}-${b.toFixed(2)} s, outside its one placement (${s.origin.toFixed(2)}-${s.end.toFixed(2)} s)`);
      };
      let backdropR: ResolvedBackdrop | undefined;
      let fadeInSec = 0, fadeOutSec = 0;
      if (e.kind === "story") within(e.source, t0, t1, "source");
      else if (e.kind === "take") {
        if (!(e.take in (edit.takes ?? {}))) err(`${p}.take`, `no take "${e.take}"`);
        if (!(e.view in (edit.views ?? {}))) err(`${p}.view`, `no view "${e.view}"`);
        if (e.viewFrom !== undefined && !(e.viewFrom in (edit.views ?? {}))) err(`${p}.viewFrom`, `no view "${e.viewFrom}"`);
        if (e.fit !== undefined && !["stage", "cover"].includes(e.fit)) err(`${p}.fit`, "must be stage or cover");
        const beat = beatSec(map, t0);
        fadeInSec = (e.fadeInBeats ?? 0) * beat;
        fadeOutSec = (e.fadeOutBeats ?? 0) * beat;
        if (fadeInSec + fadeOutSec > t1 - t0 + EPS) err(p, "its fades are longer than the entry");
        const bd: EditBackdrop = e.backdrop ?? {};
        if (bd.source) within(bd.source, t0, t1, "backdrop");
        let then: ResolvedBackdrop["then"];
        if (bd.then) {
          const a = timeOf(bd.then.from, `${p}.backdrop.then.from`), z = timeOf(bd.then.to, `${p}.backdrop.then.to`);
          if (a !== null && z !== null) {
            within(bd.then.source, a, t1, "backdrop");
            then = { source: bd.then.source, t0: a, t1: z, dim: bd.then.dim ?? 1 };
          }
        }
        backdropR = { source: bd.source, dim: bd.dim ?? 1, push: bd.push ?? 0, then };
      } else if (e.kind === "kirtled") {
        showsKirtled = true;
        if (!["studio", "pattern", "overhead", "detail", "floor"].includes(e.view)) err(`${p}.view`, "must be studio, pattern, overhead, detail or floor");
        if (e.view === "overhead" || e.view === "detail") miss(p, `the Kirtled ${e.view} view here is a drawn stand-in; a final shows the instrument itself${tail}`);
        if (e.view === "floor") {
          const tk = e.take ? edit.takes?.[e.take] : undefined;
          if (!tk) err(`${p}.take`, "the floor needs the take whose body lights it");
          else if (!tk.motion) err(`${p}.take`, `take "${e.take}" has no motion (its body points in <song>/dance8/moves/)`);
          miss(p, `the Kirtled floor here is drawn, not the built stage${tail}`);
        }
      } else if (e.kind === "trace") {
        const tk = edit.takes?.[e.take];
        if (!tk) err(`${p}.take`, `no take "${e.take}"`);
        else if (!tk.motion) err(`${p}.take`, `take "${e.take}" has no motion (its body points in <song>/dance8/moves/)`);
        if (!(e.view in (edit.views ?? {}))) err(`${p}.view`, `no view "${e.view}"`);
      } else if (e.kind === "lyrics") showsLyrics = true;
      else { err(`${p}.kind`, "must be story, take, kirtled, trace or lyrics"); return; }
      out.push({ ...(e as EditContent), t0: round6(t0), t1: round6(t1), fadeInSec, fadeOutSec, backdropR } as ResolvedContent);
    });
    content[cell] = out;
  }
  for (const id of Object.keys(sources)) if (!usedSources.has(id)) warn(`sources.${id}`, "is never shown");
  if (blocks.some((b) => b.lyrics)) showsLyrics = true;
  if (showsLyrics) {
    if (!lyrics) err("lyrics", "the edit sets lyrics, but the song has no lyric timing (<song>/dance8/<song>.lyrics.json)");
    else if (lyrics.status !== "approved") miss("lyrics", `the lyric timing is a draft; a final shows approved lyrics only (GOV-23)${tail}`);
  }
  checkPrincipals(edit.trackId, showsKirtled, library, map.maxDriftScore, o, err, warn);
  if (errors.length) return { ...fail(), blocks, sources, content, accents, flares, vocalEdges, endCard };

  // Walk the frames: every cell on screen has something to show, and the singer's face covers the sung lines (rule 5).
  const res: EditResolution = { ...base, endSec: round6(endSec), totalFrames: Math.round(endSec * o.fps), blocks, sources, content, accents, flares, vocalEdges, endCard };
  const empty = new Set<string>();
  const bySec: Record<string, [number, number]> = {};
  let sungFrames = 0, faceFrames = 0, quarterFrames = 0, largestFrames = 0;
  const lines = lyrics?.lines ?? [];
  for (let k = 0; k < res.totalFrames; k++) {
    const t = k / o.fps;
    const plan = framePlan(res, t);
    for (const layer of plan.layers) for (const c of layer.cells) {
      if (!c.entry && c.alpha * layer.alpha > 0.01 && !empty.has(c.cell)) { empty.add(c.cell); err(`content.${c.cell}`, `has nothing to show at ${t.toFixed(3)} s while it is on screen (block "${c.block}")`); }
    }
    const line = lines.find((l) => l.start <= t && t < l.end);
    if (!line) continue;
    sungFrames++;
    const sec = line.section ?? "";
    bySec[sec] ??= [0, 0];
    bySec[sec][0]++;
    let area = -1, other = 0;
    for (const layer of plan.layers) for (const c of layer.cells) {
      const e = c.entry;
      const r = c.clip ?? c.rect;
      const a = (r.w * r.h) / (width * height);
      const face = !!e && e.kind === "take" && edit.takes[e.take]?.role === "singer" && edit.views[e.view]?.shows === "face";
      if (!face) { if (c.alpha * layer.alpha >= 0.5) other = Math.max(other, a); continue; }
      if (c.alpha * layer.alpha * performerAlpha(e as ResolvedContent, t) < 0.5) continue;
      area = Math.max(area, a);
    }
    if (area >= 0) { faceFrames++; bySec[sec][1]++; }
    if (area >= 0.25) quarterFrames++;
    if (area >= 0 && area >= other - 1e-3) largestFrames++;
  }
  if (lyrics && sungFrames > 0 && faceFrames / sungFrames < MIN_LIP_SYNC - EPS) {
    const gaps = lines.filter((l) => { const mid = (l.start + l.end) / 2; return !framePlan(res, mid).layers.some((ly) => ly.cells.some((c) => c.entry?.kind === "take" && edit.takes[c.entry.take]?.role === "singer" && edit.views[c.entry.view]?.shows === "face")); });
    err("lipSync", `the singer's face is on screen for ${((100 * faceFrames) / sungFrames).toFixed(1)}% of the sung time; it needs ${MIN_LIP_SYNC * 100}%. Missing at: ${gaps.slice(0, 6).map((l) => `${l.start.toFixed(2)} s`).join(", ")}`);
  }
  if (!lyrics) miss("lipSync", `no lyric timing, so lip-sync coverage cannot be checked${tail}`);
  if (errors.length) return { ...res, ok: false };
  const pct = (a: number, b: number) => Math.round((1000 * a) / Math.max(1, b)) / 10;
  res.metrics = {
    sungSec: round6(sung.reduce((n, l) => n + (l.end - l.start), 0)),
    faceOnScreenPct: pct(faceFrames, sungFrames), faceQuarterFramePct: pct(quarterFrames, sungFrames), faceLargestPct: pct(largestFrames, sungFrames),
    bySection: Object.fromEntries(Object.entries(bySec).map(([k, [n, f]]) => [k, pct(f, n)])),
    layoutChanges, landings: blocks.length - 1,
    landingsOnGrid: blocks.slice(1).filter((b) => offGrid(map, b.land) <= 1e-3).length,
    layoutChangesAtMusicalEdges: atEdges,
    storyClipsUsed: [...usedSources].filter((id) => !sources[id]?.still).length,
    stillsUsed: [...usedSources].filter((id) => !!sources[id]?.still).length,
    maxStretch: Math.max(1, ...Object.values(sources).map((s) => s.stretch)),
  };
  return { ...res, ok: true };
}
