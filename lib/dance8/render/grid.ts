// lib/dance8/render/grid.ts
//
// The Ocular Director's camera grid (docs/DANCE8_OCULAR_DIRECTOR.md): the
// picture opens from one view to three or nine and closes again, with one
// primary cell at any moment and the others as context. Layouts change only
// on bar lines of the song's checked grid (D8-01), and only on phrase
// boundaries when the plan asks for them; on the beat only the primary cell's
// border pulses, never more than three times a second (the reaction layer's
// safety limit, D8-25). A change of layout can be a cut or a short dissolve
// that ends exactly on the bar line.
//
// A cell shows an approved clip, the lyrics (from a timing file a person
// approves, GOV-23), the Kirtled pattern (D8-21, drawn by kirtledView.ts), or
// one of the two Kirtled instrument cameras (contracts/instrument.ts):
// CAM-KIR-01 overhead and CAM-KIR-02 close, from instrument footage made to an
// approved event map, or in a draft a drawn stand-in. Before a final, every
// principal performer, instrument and significant object of the song must
// have an approved view of its own (the completeness rule). Nothing here
// generates footage.
//
// Pure: validates a plan and returns ffmpeg arguments, never runs anything.
// Same plan, same clips -> the same frames in the same cells.

import { INSTRUMENT_CAMERAS, KIRTLED_PRINCIPAL, type InstrumentCamera, type PrincipalList } from "../contracts/instrument";
import type { AspectRatio, CueMap, VisualClip, VisualClipLibrary } from "../contracts/scene";
import { FRAME_SIZE } from "../contracts/scene";
import { barToSec } from "../authoring/validateCueMap";
import { escapeDrawtext, frameAt, wrapWords } from "./ffmpegArgs";

export type GridLayout = "one" | "three" | "nine";

/** How many cells each layout shows. */
export const GRID_CELLS: Record<GridLayout, number> = { one: 1, three: 3, nine: 9 };

/** The beat pulse never exceeds this many flashes a second (D8-25's limit). */
export const MAX_PULSES_PER_SEC = 3;

/**
 * When a cell's picture happens. Two cells may show the same clip at once only
 * if every copy but one is marked as another time, so a performer never seems
 * to be in two places at the same moment.
 */
export type CellTime = "now" | "replay" | "memory" | "future";

/**
 * What a cell shows: a clip (the default), the lyrics, the Kirtled pattern
 * (the beat's light on the instrument; not a camera), or an instrument camera.
 */
export type CellView = "clip" | "lyrics" | "kirtled" | "instrument";

export interface GridCell {
  /** The clip, for a clip cell. */
  clipId?: string;
  view?: CellView;
  /** For an instrument cell: CAM-KIR-01 (overhead) or CAM-KIR-02 (close). */
  camera?: InstrumentCamera;
  /** Where in the clip this cell starts (default 0). Locked clips set their own. */
  inSec?: number;
  time?: CellTime;
}

export interface GridBlock {
  /** Bars are half-open, like cues: startBar <= bar < endBar. */
  startBar: number;
  endBar: number;
  layout: GridLayout;
  /** Index into cells of the primary view. */
  primary: number;
  /** "one": 1 cell; "three": 3 (the primary large, the rest small, in order); "nine": 9, row by row. */
  cells: GridCell[];
}

export interface GridStyle {
  /** Gap between cells and around them, in pixels (default: 0.8% of the short side). */
  gapPx?: number;
  /** Primary cell border colour, #RRGGBB (default a gold). */
  primaryBorder?: string;
  /** Border colour during a beat pulse, #RRGGBB. */
  pulseBorder?: string;
  /** How much darker context cells are, 0 (not at all) to 0.3 (default 0.06). */
  dimContext?: number;
}

/** How one layout gives way to the next: a cut, or a dissolve that ends on the bar line. */
export interface GridTransition {
  kind: "cut" | "fade";
  /** Length of a dissolve in beats (default 0.5, at most 2). */
  beats?: number;
}

export interface GridPlan {
  id: string;
  schemaVersion: 1;
  trackId: string;
  aspect: AspectRatio;
  /** Layouts change only every this many bars, counted from the first block (default 1). */
  phraseBars?: number;
  /** Pulse the primary border on the beat (default true). */
  beatPulse?: boolean;
  /** Default: a half-beat dissolve. */
  transition?: GridTransition;
  style?: GridStyle;
  blocks: GridBlock[];
}

/** A lyric file timed to the song (<song>/dance8/<song>.lyrics.json): what a lyrics cell shows. */
export interface LyricTiming {
  status: "draft" | "approved";
  /** words: forced-alignment word times (timing "aligned"); edit lists light each word as it is sung. */
  lines: { text: string; start: number; end: number; section?: string; timing?: string; words?: { w: string; start: number; end: number }[] }[];
}

export interface Rect { x: number; y: number; w: number; h: number }

export interface ResolvedCell {
  view: CellView;
  /** The clip for a clip cell (instrument footage included); "lyrics", "kirtled" or the camera for a drawn view. */
  clipId: string;
  /** The instrument camera this cell shows, footage or stand-in. */
  camera?: InstrumentCamera;
  rect: Rect;
  primary: boolean;
  time: CellTime;
  inSec: number;
  /** Frames the clip itself fills; the rest hold its last frame. */
  playFrames: number;
  holdFrames: number;
}

export interface ResolvedBlock {
  index: number;
  startBar: number;
  endBar: number;
  layout: GridLayout;
  /** Seconds from bar 0 (the first downbeat), like cut plans. */
  startSec: number;
  endSec: number;
  frames: number;
  /** Extra frames before the bar line that the dissolve into this block shows (0 for a cut or the first block). */
  prerollFrames: number;
  cells: ResolvedCell[];
  /** Seconds between border pulses (a beat or a multiple of it); null when there is none. */
  pulseEverySec: number | null;
}

export interface GridIssue { path: string; message: string }

export interface GridResolution {
  ok: boolean;
  errors: GridIssue[];
  warnings: GridIssue[];
  blocks: ResolvedBlock[];
  width: number;
  height: number;
  fps: number;
  totalFrames: number;
  /** Dissolve length in frames between blocks (0: cuts). */
  transitionFrames: number;
  /** Song time of the first frame (the first block's start plus the first downbeat). */
  audioOffsetSec: number;
}

const EPS = 1e-6;
const round6 = (n: number) => Math.round(n * 1e6) / 1e6;
const even = (n: number) => Math.max(2, Math.floor(n / 2) * 2);
const HEX = /^#[0-9a-fA-F]{6}$/;

/**
 * Cell rectangles for a layout. Slot 0 of "three" is the large one; "nine" is
 * row by row. Every rectangle lies inside the frame, none overlap, and sizes
 * are even (as yuv420p needs).
 */
export function layoutRects(layout: GridLayout, width: number, height: number, gap: number): Rect[] {
  if (layout === "one") return [{ x: 0, y: 0, w: width, h: height }];
  const g = Math.max(0, Math.round(gap));
  if (layout === "nine") {
    const w = even((width - 4 * g) / 3);
    const h = even((height - 4 * g) / 3);
    const rects: Rect[] = [];
    for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++) rects.push({ x: g + c * (w + g), y: g + r * (h + g), w, h });
    return rects;
  }
  if (height > width) {
    // Portrait: the primary across the top, two side by side below.
    const bigH = even(((height - 3 * g) * 2) / 3);
    const smallH = even(height - 3 * g - bigH);
    const smallW = even((width - 3 * g) / 2);
    return [
      { x: g, y: g, w: even(width - 2 * g), h: bigH },
      { x: g, y: 2 * g + bigH, w: smallW, h: smallH },
      { x: 2 * g + smallW, y: 2 * g + bigH, w: smallW, h: smallH },
    ];
  }
  // Landscape and square: the primary on the left, two stacked on the right.
  const bigW = even(((width - 3 * g) * 2) / 3);
  const smallW = even(width - 3 * g - bigW);
  const smallH = even((height - 3 * g) / 2);
  return [
    { x: g, y: g, w: bigW, h: even(height - 2 * g) },
    { x: 2 * g + bigW, y: g, w: smallW, h: smallH },
    { x: 2 * g + bigW, y: 2 * g + smallH, w: smallW, h: smallH },
  ];
}

/** The beat, or every 2nd or 4th beat, so the pulse stays at or under three a second. */
export function pulsePeriodSec(bpm: number): number {
  const beat = 60 / bpm;
  for (const k of [1, 2, 4, 8]) if (1 / (beat * k) <= MAX_PULSES_PER_SEC + EPS) return round6(beat * k);
  return round6(beat * 8);
}

function segmentAt(tempo: CueMap["tempo"], bar: number) {
  let seg = tempo[0];
  for (const s of tempo) if (s.startBar <= bar) seg = s;
  return seg;
}

/**
 * Instrument footage for `camera` that covers song seconds [fromSec, toSec):
 * approved before draft, then by id, so the choice never changes between runs.
 */
export function instrumentClipFor(library: VisualClipLibrary, camera: InstrumentCamera, fromSec: number, toSec: number): VisualClip | undefined {
  return library.clips
    .filter((c) => c.instrument?.camera === camera && c.approvalStatus !== "retired")
    .filter((c) => c.instrument!.songStartSec <= fromSec + EPS && c.instrument!.songStartSec + c.durationSec >= toSec - EPS)
    .sort((a, b) => Number(b.approvalStatus === "approved") - Number(a.approvalStatus === "approved") || a.id.localeCompare(b.id))[0];
}

/** The principal a clip shows on its own, if any: instrument footage always isolates Kirtled. */
const isolatedBy = (c: VisualClip): string | undefined => (c.instrument ? KIRTLED_PRINCIPAL : c.isolates);

/**
 * The completeness rule: every principal performer, instrument and
 * significant object of the song has an approved view of its own before a
 * multi-camera composition is approved, so nothing important (Kirtled above
 * all) disappears behind the dance and the grid. For Kirtled that view is
 * CAM-KIR-01; CAM-KIR-02 is wanted too. A draft lists what is missing. Shared
 * by grid plans and edit lists (render/edit.ts).
 */
export function checkPrincipals(
  trackId: string, showsKirtled: boolean, library: VisualClipLibrary, maxDrift: number,
  o: { approved?: boolean; principals?: PrincipalList | null },
  err: (path: string, message: string) => void, warn: (path: string, message: string) => void,
): void {
  const miss = o.approved ? err : warn;
  const tail = o.approved ? "" : " (fine for a draft)";
  const list = o.principals;
  if (!list) {
    miss("principals", `the song has no principal list (<song>/dance8/<song>.principals.json); each principal needs a view of its own before a final${tail}`);
    return;
  }
  if (list.schemaVersion !== 1 || list.trackId !== trackId || !Array.isArray(list.principals)) {
    err("principals", `the principal list must be schemaVersion 1 for "${trackId}" with a principals list`);
    return;
  }
  const ok = (c: VisualClip) => c.approvalStatus === "approved" && c.drift.status === "known" && c.drift.driftScore !== null && c.drift.driftScore <= maxDrift + EPS;
  const ids = new Set(list.principals.map((x) => x.id));
  if (showsKirtled && !ids.has(KIRTLED_PRINCIPAL)) err("principals", `the plan shows Kirtled, so the principal list must name it ("${KIRTLED_PRINCIPAL}", an instrument)`);
  for (const pr of list.principals) {
    if (pr.id === KIRTLED_PRINCIPAL) {
      for (const [cam, info] of Object.entries(INSTRUMENT_CAMERAS)) {
        if (library.clips.some((c) => c.instrument?.camera === cam && ok(c))) continue;
        const msg = `Kirtled has no approved ${cam} footage (${info.name.toLowerCase()})`;
        if (info.required) miss(`principals.${pr.id}`, `${msg}${tail}`);
        else warn(`principals.${pr.id}`, `${msg}; wanted beside ${Object.keys(INSTRUMENT_CAMERAS)[0]}`);
      }
    } else if (!library.clips.some((c) => isolatedBy(c) === pr.id && ok(c))) {
      miss(`principals.${pr.id}`, `${pr.name} has no approved clip of its own (a clip with isolates: "${pr.id}")${tail}`);
    }
  }
}

/**
 * Checks a plan against the song's cue map, clip library and lyric timing and
 * works out every block's time, frames and cells. Final (approved) renders
 * refuse draft or unmeasured clips and draft lyric timing; drafts allow them
 * with a warning.
 */
export function resolveGrid(
  plan: GridPlan,
  map: Pick<CueMap, "trackId" | "tempo" | "firstDownbeatSec" | "maxDriftScore" | "vocals" | "cues">,
  library: VisualClipLibrary,
  o: {
    fps: number;
    approved?: boolean;
    lyrics?: LyricTiming | null;
    /** <song>/dance8/<song>.principals.json; a final needs it. */
    principals?: PrincipalList | null;
    /** The song's event map, once checked: its id and whether it is approved. */
    eventMap?: { id: string; approved: boolean } | null;
  },
): GridResolution {
  const errors: GridIssue[] = [];
  const warnings: GridIssue[] = [];
  const err = (path: string, message: string) => errors.push({ path, message });
  const warn = (path: string, message: string) => warnings.push({ path, message });
  const size = FRAME_SIZE[plan.aspect];
  const [width, height] = size ?? [0, 0];
  const fail = (): GridResolution => ({ ok: false, errors, warnings, blocks: [], width, height, fps: o.fps, totalFrames: 0, transitionFrames: 0, audioOffsetSec: 0 });

  if (plan.schemaVersion !== 1) err("schemaVersion", "must be 1");
  if (plan.trackId !== map.trackId) err("trackId", `is "${plan.trackId}", but the cue map is for "${map.trackId}"`);
  if (!size) err("aspect", `must be one of ${Object.keys(FRAME_SIZE).join(", ")}`);
  if (!(Number.isInteger(o.fps) && o.fps > 0)) err("fps", "must be a whole number of frames a second");
  const phrase = plan.phraseBars ?? 1;
  if (!(Number.isInteger(phrase) && phrase >= 1)) err("phraseBars", "must be a whole number of bars, 1 or more");
  const st = plan.style ?? {};
  for (const k of ["primaryBorder", "pulseBorder"] as const) if (st[k] !== undefined && !HEX.test(st[k]!)) err(`style.${k}`, "must be a colour like #E3B04B");
  if (st.dimContext !== undefined && !(st.dimContext >= 0 && st.dimContext <= 0.3)) err("style.dimContext", "must be between 0 and 0.3");
  if (st.gapPx !== undefined && !(Number.isInteger(st.gapPx) && st.gapPx >= 0 && st.gapPx <= 64)) err("style.gapPx", "must be a whole number of pixels from 0 to 64");
  const tr = plan.transition ?? { kind: "fade", beats: 0.5 };
  if (!["cut", "fade"].includes(tr.kind)) err("transition.kind", "must be cut or fade");
  if (tr.beats !== undefined && !(tr.beats > 0 && tr.beats <= 2)) err("transition.beats", "must be more than 0 and at most 2 beats");
  if (!Array.isArray(plan.blocks) || plan.blocks.length === 0) err("blocks", "needs at least one block");
  if (errors.length) return fail();

  const byId = new Map(library.clips.map((c) => [c.id, c]));
  const origin = map.firstDownbeatSec ?? 0;
  const songEndBar = Math.max(0, ...map.cues.map((c) => c.endBar));
  const tempoStarts = map.tempo.map((t) => t.startBar);
  const vocals = map.vocals ?? [];
  const gap = st.gapPx ?? Math.round(Math.min(width, height) * 0.008);
  const first = plan.blocks[0].startBar;
  // One dissolve length for the whole plan, from the tempo at its first bar.
  const fadeFrames = tr.kind === "fade" ? Math.max(1, Math.round(((60 / segmentAt(map.tempo, first).bpm) * (tr.beats ?? 0.5)) * o.fps)) : 0;

  const blocks: ResolvedBlock[] = [];
  plan.blocks.forEach((b, i) => {
    const p = `blocks[${i}]`;
    const okBars = Number.isInteger(b.startBar) && Number.isInteger(b.endBar) && b.startBar >= 0 && b.endBar > b.startBar;
    if (!okBars) { err(p, "startBar and endBar must be whole bars with endBar after startBar"); return; }
    if (i > 0 && b.startBar !== plan.blocks[i - 1].endBar) err(`${p}.startBar`, `must be ${plan.blocks[i - 1].endBar}, where the block before ends (blocks run on without gaps)`);
    if (b.endBar > songEndBar) err(`${p}.endBar`, `is past the song's last bar (${songEndBar})`);
    for (const edge of [b.startBar, b.endBar]) {
      if ((edge - first) % phrase !== 0) err(p, `bar ${edge} is not on a ${phrase}-bar phrase line counted from bar ${first}; layouts change only on phrases`);
    }
    if (tempoStarts.some((t) => t > b.startBar && t < b.endBar)) err(p, "spans a tempo change; split it there");
    if (!(b.layout in GRID_CELLS)) { err(`${p}.layout`, "must be one, three or nine"); return; }
    const want = GRID_CELLS[b.layout];
    if (!Array.isArray(b.cells) || b.cells.length !== want) { err(`${p}.cells`, `a "${b.layout}" layout has ${want} cell${want > 1 ? "s" : ""}`); return; }
    if (!(Number.isInteger(b.primary) && b.primary >= 0 && b.primary < want)) { err(`${p}.primary`, `must be a cell number from 0 to ${want - 1}`); return; }

    const startSec = barToSec(map.tempo, b.startBar);
    const endSec = barToSec(map.tempo, b.endBar);
    const frames = frameAt(endSec, o.fps) - frameAt(startSec, o.fps);
    const preroll = i > 0 ? fadeFrames : 0;
    if (fadeFrames && frames <= fadeFrames) err(p, `is ${frames} frames, too short for a ${fadeFrames}-frame dissolve; make it longer or use cuts`);
    const sung = vocals.some((v) => v.startBar < b.endBar && b.startBar < v.endBar);
    const rects = layoutRects(b.layout, width, height, gap);
    // Slot order: in "three" the primary takes the large slot and the others follow in order.
    const slotOf = (ci: number) => (b.layout !== "three" ? ci : ci === b.primary ? 0 : ci < b.primary ? ci + 1 : ci);

    const nowCount = new Map<string, number>();
    const cells: ResolvedCell[] = [];
    b.cells.forEach((cell, ci) => {
      const cp = `${p}.cells[${ci}]`;
      const view: CellView = cell.view ?? "clip";
      if (!["clip", "lyrics", "kirtled", "instrument"].includes(view)) { err(`${cp}.view`, "must be clip, lyrics, kirtled or instrument"); return; }
      if (view !== "instrument" && cell.camera !== undefined) { err(`${cp}.camera`, "only an instrument cell names a camera"); return; }
      const time: CellTime = cell.time ?? "now";
      if (!["now", "replay", "memory", "future"].includes(time)) { err(`${cp}.time`, "must be now, replay, memory or future"); return; }
      const base = { rect: rects[slotOf(ci)], primary: ci === b.primary, time };
      let footage: VisualClip | undefined;
      if (view === "instrument") {
        if (cell.clipId !== undefined) { err(cp, "an instrument cell finds its own footage; leave out clipId"); return; }
        const cam = cell.camera;
        if (!cam || !(cam in INSTRUMENT_CAMERAS)) { err(`${cp}.camera`, "must be CAM-KIR-01 (overhead) or CAM-KIR-02 (close)"); return; }
        footage = instrumentClipFor(library, cam, startSec + origin, endSec + origin);
        if (!footage) {
          if (o.approved) { err(cp, `${cam} has no instrument footage covering bars ${b.startBar}-${b.endBar}; a final shows the instrument itself, not the drawn stand-in`); return; }
          warn(cp, `${cam} has no footage here yet: a drawn stand-in of the canon instrument (fine for a draft)`);
          cells.push({ ...base, view, camera: cam, clipId: cam, inSec: round6(startSec + origin), playFrames: frames, holdFrames: 0 });
          return;
        }
        if (o.approved && !(o.eventMap?.approved && footage.instrument!.eventMapId === o.eventMap.id)) {
          err(cp, `${footage.id} shows the instrument played to event map "${footage.instrument!.eventMapId}"; a final needs footage played to the song's approved event map`);
          return;
        }
      }
      if (view !== "clip" && view !== "instrument") {
        if (cell.clipId !== undefined) { err(cp, `a ${view} cell shows no clip; leave out clipId`); return; }
        if (view === "lyrics") {
          if (!o.lyrics) { err(cp, "no lyric timing for this song yet (<song>/dance8/<song>.lyrics.json)"); return; }
          if (o.lyrics.status !== "approved") {
            if (o.approved) { err(cp, "the lyric timing is a draft; a final shows approved lyrics only (GOV-23)"); return; }
            warn(cp, "the lyric timing is a draft (fine for a draft)");
          }
        }
        cells.push({ ...base, view, clipId: view, inSec: round6(startSec + origin), playFrames: frames, holdFrames: 0 });
        return;
      }
      const clip: VisualClip | undefined = footage ?? (cell.clipId === undefined ? undefined : byId.get(cell.clipId));
      if (!clip) { err(`${cp}.clipId`, cell.clipId === undefined ? "a clip cell needs a clipId" : `no clip "${cell.clipId}" in the clip library`); return; }
      if (time === "now") nowCount.set(clip.id, (nowCount.get(clip.id) ?? 0) + 1);
      if (clip.approvalStatus === "retired") err(cp, `${clip.id} is retired`);
      const measured = clip.drift.status === "known" && clip.drift.driftScore !== null && clip.drift.driftScore <= map.maxDriftScore + EPS;
      if (clip.approvalStatus !== "approved" || !measured) {
        const why = clip.approvalStatus !== "approved" ? "not approved" : "its drift is unmeasured or over the limit";
        if (o.approved) err(cp, `${clip.id} is ${why}; a final uses approved clips only`);
        else warn(cp, `${clip.id} is ${why} (fine for a draft)`);
      }
      if (clip.trick) { err(cp, `${clip.id} is a skate-trick clip; tricks land on their chord change and are never free footage (D8-16)`); return; }
      if (sung && clip.mouthVisible && !clip.lipSync) err(cp, `${clip.id} shows a singer's mouth during a sung line without a lip-sync lock`);

      // Song-locked clips play where they line up with the song.
      const lock = clip.lipSync?.songStartSec ?? clip.danceLock?.songStartSec ?? clip.instrument?.songStartSec;
      let inSec = cell.inSec ?? 0;
      if (lock !== undefined) {
        const locked = round6(startSec - (lock - origin));
        if (cell.inSec !== undefined && Math.abs(cell.inSec - locked) > 1e-3) err(`${cp}.inSec`, `${clip.id} is locked to the song; here it must start at ${locked} s (or leave inSec out)`);
        inSec = locked;
        if (inSec < -EPS || inSec + (endSec - startSec) > clip.durationSec + EPS) err(cp, `${clip.id} is locked to song time and does not cover bars ${b.startBar}-${b.endBar}`);
      } else if (!(inSec >= 0 && inSec < clip.durationSec)) {
        err(`${cp}.inSec`, `must be from 0 to under ${clip.durationSec} s, the clip's length`);
        return;
      }
      const clipFrames = Math.floor(clip.durationSec * o.fps + EPS);
      const inFrame = Math.max(0, frameAt(inSec, o.fps));
      const playFrames = Math.max(0, Math.min(frames, clipFrames - inFrame));
      const holdFrames = frames - playFrames;
      if (holdFrames > 0 && lock === undefined) warn(cp, `${clip.id} runs out ${(holdFrames / o.fps).toFixed(2)} s early and holds its last frame`);
      cells.push({ ...base, view: "clip", clipId: clip.id, ...(clip.instrument ? { camera: clip.instrument.camera } : {}), inSec: round6(Math.max(0, inSec)), playFrames, holdFrames });
    });
    for (const [id, n] of nowCount) if (n > 1) err(`${p}.cells`, `shows ${id} in ${n} cells at once; mark all but one as replay, memory or future`);
    for (const v of ["lyrics", "kirtled"] as const) if (cells.filter((c) => c.view === v).length > 1) err(`${p}.cells`, `shows the ${v} view in more than one cell`);
    for (const cam of Object.keys(INSTRUMENT_CAMERAS)) if (cells.filter((c) => c.camera === cam).length > 1) err(`${p}.cells`, `shows ${cam} in more than one cell`);

    const seg = segmentAt(map.tempo, b.startBar);
    const pulse = (plan.beatPulse ?? true) && b.layout !== "one" ? pulsePeriodSec(seg.bpm) : null;
    blocks.push({ index: i, startBar: b.startBar, endBar: b.endBar, layout: b.layout, startSec, endSec, frames, prerollFrames: preroll, cells, pulseEverySec: pulse });
  });

  // Listed with the block problems, so a final's report is complete in one run.
  const showsKirtled = plan.blocks.some((b) => (b.cells ?? []).some((c) => c.view === "kirtled" || c.view === "instrument" || byId.get(c.clipId ?? "")?.instrument));
  checkPrincipals(plan.trackId, showsKirtled, library, map.maxDriftScore, o, err, warn);
  if (errors.length) return fail();
  const totalFrames = blocks.reduce((n, b) => n + b.frames, 0);
  return { ok: true, errors, warnings, blocks, width, height, fps: o.fps, totalFrames, transitionFrames: fadeFrames, audioOffsetSec: round6(blocks[0].startSec + origin) };
}

const color = (hex: string) => `0x${hex.slice(1)}`;

/**
 * ffmpeg arguments that render one block, silent, exactly `prerollFrames +
 * frames` frames: the dissolve into it shows its first `prerollFrames`.
 * `cellPath` gives each cell's file (a clip, or the lyrics or Kirtled view
 * rendered for this block, which already includes the pre-roll). Context cells
 * are a little darker; the primary has a border that pulses on the beat in
 * three- and nine-cell layouts.
 */
export function gridBlockArgs(
  block: ResolvedBlock,
  o: { width: number; height: number; fps: number; style?: GridStyle; cellPath: (cell: ResolvedCell, index: number) => string; outPath: string },
): string[] {
  const st = o.style ?? {};
  const dim = st.dimContext ?? 0.06;
  const pre = block.prerollFrames;
  const total = block.frames + pre;
  const args: string[] = ["-hide_banner", "-loglevel", "error", "-y"];
  block.cells.forEach((c, i) => args.push("-i", o.cellPath(c, i)));
  const parts: string[] = [`color=c=black:s=${o.width}x${o.height}:r=${o.fps},trim=end_frame=${total},setpts=PTS-STARTPTS[bg]`];
  block.cells.forEach((c, i) => {
    let chain = `[${i}:v]fps=${o.fps},scale=${c.rect.w}:${c.rect.h}:force_original_aspect_ratio=increase,crop=${c.rect.w}:${c.rect.h},setsar=1`;
    if (c.view === "clip") {
      // The pre-roll comes from before the in-point; where the clip has no earlier frames, its first frame waits.
      const inFrame = frameAt(c.inSec, o.fps);
      const from = Math.max(0, inFrame - pre);
      const wait = pre - (inFrame - from);
      chain += `,trim=start_frame=${from}:end_frame=${inFrame + c.playFrames},setpts=PTS-STARTPTS`;
      if (wait > 0) chain += `,tpad=start_mode=clone:start=${wait}`;
      if (c.holdFrames > 0) chain += `,tpad=stop_mode=clone:stop=${c.holdFrames}`;
    } else {
      chain += `,trim=end_frame=${total},setpts=PTS-STARTPTS`;
    }
    if (!c.primary && dim > 0 && block.layout !== "one") chain += `,eq=brightness=${(-dim).toFixed(3)}:saturation=${(1 - dim * 2).toFixed(3)}`;
    parts.push(`${chain}[c${i}]`);
  });
  let last = "bg";
  block.cells.forEach((c, i) => {
    parts.push(`[${last}][c${i}]overlay=x=${c.rect.x}:y=${c.rect.y}:eof_action=repeat[o${i}]`);
    last = `o${i}`;
  });
  const boxes: string[] = [];
  const p = block.cells.find((c) => c.primary)!;
  if (block.layout !== "one") {
    const t = Math.max(2, Math.round(Math.min(o.width, o.height) * 0.004));
    boxes.push(`drawbox=x=${p.rect.x}:y=${p.rect.y}:w=${p.rect.w}:h=${p.rect.h}:color=${color(st.primaryBorder ?? "#E3B04B")}:t=${t}`);
    if (block.pulseEverySec) {
      const on = Math.min(0.12, block.pulseEverySec / 3).toFixed(3);
      // Bar 0 of the block is `pre` frames in, so the pulse counts from there.
      const shift = (pre / o.fps).toFixed(6);
      boxes.push(
        `drawbox=x=${p.rect.x}:y=${p.rect.y}:w=${p.rect.w}:h=${p.rect.h}:color=${color(st.pulseBorder ?? "#FFF1C9")}:t=${t * 2}:` +
          `enable='gte(t\\,${shift})*lt(mod(t-${shift}\\,${block.pulseEverySec.toFixed(6)})\\,${on})'`,
      );
    }
  }
  parts.push(boxes.length ? `[${last}]${boxes.join(",")}[vout]` : `[${last}]null[vout]`);
  args.push(
    "-filter_complex", parts.join(";"),
    "-map", "[vout]", "-frames:v", String(total), "-an",
    "-c:v", "libx264", "-preset", "medium", "-crf", "18", "-pix_fmt", "yuv420p", "-r", String(o.fps),
    o.outPath,
  );
  return args;
}

/**
 * Joins the rendered blocks into one silent picture. With dissolves, block k
 * (k > 0) carries `fade` extra frames before its bar line and fades in over
 * them, so the dissolve ends exactly on the bar line and the total stays the
 * sum of the blocks' own frames.
 */
export function gridJoinArgs(o: { parts: string[]; frames: number[]; fade: number; fps: number; outPath: string }): string[] {
  const args = ["-hide_banner", "-loglevel", "error", "-y"];
  for (const p of o.parts) args.push("-i", p);
  const total = o.frames.reduce((a, b) => a + b, 0);
  if (o.parts.length === 1 || o.fade === 0) {
    const ins = o.parts.map((_, i) => `[${i}:v]`).join("");
    args.push("-filter_complex", `${ins}concat=n=${o.parts.length}:v=1:a=0[v]`);
  } else {
    const chain: string[] = [];
    let last = "0:v";
    let len = o.frames[0];
    for (let i = 1; i < o.parts.length; i++) {
      const out = i === o.parts.length - 1 ? "v" : `x${i}`;
      chain.push(`[${last}][${i}:v]xfade=transition=fade:duration=${(o.fade / o.fps).toFixed(6)}:offset=${((len - o.fade) / o.fps).toFixed(6)}[${out}]`);
      last = out;
      len += o.frames[i];
    }
    args.push("-filter_complex", chain.join(";"));
  }
  args.push("-map", "[v]", "-frames:v", String(total), "-an", "-c:v", "libx264", "-preset", "medium", "-crf", "18", "-pix_fmt", "yuv420p", "-r", String(o.fps), "-movflags", "+faststart", o.outPath);
  return args;
}

/**
 * The lyrics view for one block: the line being sung, large, with the next
 * line small under it, on a dark ground. Times are song seconds; `fromSec` is
 * the song time of the view's first frame. A line stays up from its start
 * until the next line starts, or two seconds after it ends.
 */
export function lyricsCellArgs(o: {
  lyrics: LyricTiming; width: number; height: number; fps: number; frames: number; fromSec: number; fontFile: string; outPath: string;
}): string[] {
  const lines = [...o.lyrics.lines].sort((a, b) => a.start - b.start);
  const to = o.fromSec + o.frames / o.fps;
  const big = Math.max(14, Math.round(Math.min(o.height / 8, o.width / 15)));
  const small = Math.max(10, Math.round(big * 0.55));
  const perRow = Math.max(8, Math.floor(o.width / (big * 0.58)));
  const draws: string[] = [];
  lines.forEach((l, i) => {
    const next = lines[i + 1];
    const until = Math.min(next ? next.start : Infinity, l.end + 2);
    if (until <= o.fromSec || l.start >= to) return;
    const a = Math.max(0, l.start - o.fromSec).toFixed(3);
    const b = (until - o.fromSec).toFixed(3);
    const rows = wrapWords(l.text, perRow);
    rows.forEach((row, r) => {
      const y = Math.round(o.height * 0.42 + (r - (rows.length - 1) / 2) * big * 1.2);
      draws.push(`drawtext=fontfile='${o.fontFile}':text='${escapeDrawtext(row)}':fontsize=${big}:fontcolor=0xF4E3B5:x=(w-tw)/2:y=${y}-th/2:enable='between(t\\,${a}\\,${b})'`);
    });
    if (next) {
      const nrow = wrapWords(next.text, Math.floor(perRow * 1.6))[0];
      const y = Math.round(o.height * 0.42 + ((rows.length + 1) / 2) * big * 1.2 + small);
      draws.push(`drawtext=fontfile='${o.fontFile}':text='${escapeDrawtext(nrow)}':fontsize=${small}:fontcolor=0x8C8577:x=(w-tw)/2:y=${y}-th/2:enable='between(t\\,${a}\\,${b})'`);
    }
  });
  const base = `color=c=0x0E0C0A:s=${o.width}x${o.height}:r=${o.fps},trim=end_frame=${o.frames},setpts=PTS-STARTPTS`;
  return [
    "-hide_banner", "-loglevel", "error", "-y", "-f", "lavfi", "-i", base,
    ...(draws.length ? ["-vf", draws.join(",")] : []),
    "-frames:v", String(o.frames), "-an", "-c:v", "libx264", "-preset", "medium", "-crf", "16", "-pix_fmt", "yuv420p", "-r", String(o.fps), o.outPath,
  ];
}

/**
 * Lays the song under the joined picture from `audioOffsetSec`, cut to the
 * exact frame count. With a caption (finals), the AI disclosure shows for its
 * first seconds.
 */
export function gridMuxArgs(o: {
  picturePath: string; audioPath: string; audioOffsetSec: number; totalFrames: number; fps: number; outPath: string;
  caption?: { text: string; fontFile: string; seconds: number };
}): string[] {
  const args = ["-hide_banner", "-loglevel", "error", "-y", "-i", o.picturePath];
  if (o.audioOffsetSec > 0) args.push("-ss", o.audioOffsetSec.toFixed(6));
  args.push("-i", o.audioPath);
  const dur = (o.totalFrames / o.fps).toFixed(6);
  if (o.caption) {
    const c = o.caption;
    args.push(
      "-filter_complex",
      `[0:v]drawtext=fontfile='${c.fontFile}':text='${escapeDrawtext(c.text)}':fontsize=h/48:fontcolor=white@0.9:box=1:boxcolor=black@0.45:boxborderw=8:` +
        `x=(w-tw)/2:y=h-th-h/14:enable='lt(t\\,${c.seconds})'[v]`,
      "-map", "[v]", "-c:v", "libx264", "-preset", "medium", "-crf", "18", "-pix_fmt", "yuv420p",
    );
  } else {
    args.push("-map", "0:v", "-c:v", "copy");
  }
  args.push("-map", "1:a:0", "-frames:v", String(o.totalFrames), "-t", dur, "-c:a", "aac", "-b:a", "192k", "-movflags", "+faststart", o.outPath);
  return args;
}
