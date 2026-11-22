// lib/dance8/contracts/edit.ts
//
// An edit list: the Ocular Director's hand-authored cut of a whole song
// (docs/DANCE8_OCULAR_DIRECTOR.md, "Edit lists"). Where a grid plan
// (render/grid.ts) lays clips into bar-long blocks, an edit list says what
// every cell shows at every moment and why the layout changes, and the checker
// (render/edit.ts) holds it to the rules the owner approved for EDO v2:
//
//   - every story clip has ONE placement on the song, so no moment repeats;
//   - a layout changes only at a musical edge: a split lands just before the
//     voice enters, a collapse just after it leaves, or a cue section starts,
//     always on the eighth-note grid;
//   - whenever the voice sings, the singer's face is on screen;
//   - the cells of a grid show the same moment (performers are song-locked);
//   - one look: the studio light behind the performers, gold frames, one grade.
//
// Files: <song>/dance8/edits/<id>.json. Takes (performances with a matte) live
// beside them; story footage comes from the song's clip library.

import type { AspectRatio } from "./scene";

/**
 * A point on the song: song seconds, a place on the cue map's grid (bar and
 * beat, counted from bar 0 at the first downbeat), or a block's landing (or
 * the start of the transition into it).
 */
export type EditTime = number | { bar: number; beat?: number } | { block: string; at?: "land" | "start" };

export type EditLayout = "one" | "three" | "nine";

/** "one": full. "three": big, tr (top or left small cell), br. "nine": r0c0 .. r2c2, row by row. */
export type EditSlot = "full" | "big" | "tr" | "br" | `r${0 | 1 | 2}c${0 | 1 | 2}`;

/** Cells each layout has, in slot order. */
export const EDIT_SLOTS: Record<EditLayout, readonly EditSlot[]> = {
  one: ["full"],
  three: ["big", "tr", "br"],
  nine: ["r0c0", "r0c1", "r0c2", "r1c0", "r1c1", "r1c2", "r2c0", "r2c1", "r2c2"],
};

/**
 * How a block arrives. geometry: the cells move to their new places over half
 * a beat (the primary carries the picture; new cells open from the edge they
 * share with it; cells that leave are covered). dissolve: the whole picture
 * crossfades over one beat. content: same cells, a cell's content changes in
 * place. cut: on the landing.
 */
export type EditTransition = "cut" | "geometry" | "dissolve" | "content";

export interface EditBlock {
  id: string;
  /** When the new layout is in place. Transitions end here. */
  land: EditTime;
  layout: EditLayout;
  /** Cell id -> slot. Every slot of the layout is filled. A cell id keeps its content timeline across blocks. */
  cells: Record<string, EditSlot>;
  /** Default: geometry when the cells change, content when they do not. Ignored on the first block. */
  transition?: EditTransition;
  /** The cell that carries the picture through a geometric change; it must be on screen before and after. */
  primary?: string;
  /** Where the sung line is set: under the singer (band), large across the frame (hook), or in the lyrics cell. */
  lyrics?: "band" | "hook" | "cell" | null;
  /** A lyric section whose all-capital words spell a word (EDO verse 2: S-T-Y-L-E); the letters appear as they are sung. */
  acrostic?: string;
  /** Nine-view: which cell the light is on, from when. Others dim. */
  now?: { at: EditTime; cell: string }[];
  /** The musical reason for this block, in a sentence. Required after the first block. */
  why?: string;
}

/** A crop of a frame, as fractions: [left, top, right, bottom]. */
export type CropBox = [number, number, number, number];

/** Where a still plate is looked at: the centre of the view (fractions of the frame) and how close (1 = the whole frame). */
export interface StillView { x: number; y: number; zoom: number }

/**
 * Story footage, placed once on the song: a clip of the song's clip library,
 * or a still plate (an image) that the camera moves across slowly.
 */
export interface EditSource {
  /** A clip of the song's clip library. */
  clip?: string;
  /** Or a still plate: an image file (PNG, JPEG or WebP) relative to <song>/dance8/. */
  still?: string;
  /** Song time where the clip's inSec plays, or the still's move starts. */
  origin: EditTime;
  /** Song time where its use ends. If a clip is shorter than its window it is slowed (frames repeat), at most 15%. */
  end: EditTime;
  inSec?: number;
  /** Keep part of the picture out (a watermark, an edge). */
  crop?: CropBox;
  /** A still's move over its whole window, eased. Default: a slow push to the centre, zoom 1 to 1.06. */
  move?: { from: StillView; to: StillView };
  /** A still a person has approved for a final (clips carry their approval in the clip library). */
  approved?: boolean;
}

/**
 * A performance with a matte, locked to the song: the file is packed side by
 * side, picture on the left half and the matte (white = performer) on the
 * right (scripts/dance8/alpha_pack.py makes one). Frame k shows song time
 * k / fps - songAt0Sec.
 */
export interface EditTake {
  /** Relative to <song>/dance8/. */
  file: string;
  /** Where song time 0 falls in the file. */
  songAt0Sec: number;
  role: "singer" | "dancer";
  /** The owner's own take standing in for the character; a final refuses it. */
  standIn: boolean;
}

/** A named view of a take: the crop, and whether it shows the face (counts as lip-sync) or the body. */
export interface TakeView {
  box: CropBox;
  shows: "face" | "body";
}

/** The picture behind a performer: the studio (default), or a story source, darkened. */
export interface EditBackdrop {
  source?: string;
  dim?: number;
  push?: number;
  /** Cross to another backdrop over [from, to]. */
  then?: { source: string; from: EditTime; to: EditTime; dim?: number };
}

interface Span { from: EditTime; to: EditTime }

export type EditContent =
  | (Span & { kind: "story"; source: string; /** Slow push-in over the span, e.g. 0.04. */ push?: number })
  | (Span & {
      kind: "take"; take: string; view: string;
      /** stage: whole view, standing on the bottom of the cell, on the backdrop (default). cover: fills the cell. */
      fit?: "stage" | "cover";
      fadeInBeats?: number; fadeOutBeats?: number;
      /** Start from this view and move to `view` over the first half beat (a cell growing into a wider shot). */
      viewFrom?: string;
      backdrop?: EditBackdrop;
    })
  | (Span & { kind: "kirtled"; view: "studio" | "pattern" | "overhead" | "detail"; title?: { text: string; note?: string } })
  | (Span & { kind: "lyrics" });

export interface EditList {
  id: string;
  schemaVersion: 1;
  trackId: string;
  aspect: AspectRatio;
  /** Song seconds where the edit ends (default: the end of the last cue). */
  endSec?: number;
  sources: Record<string, EditSource>;
  takes: Record<string, EditTake>;
  views: Record<string, TakeView>;
  blocks: EditBlock[];
  /** Cell id -> what it shows, in time order. */
  content: Record<string, EditContent[]>;
  /** Song times where the beat light sweeps across the frame for one bar (a section start with no layout change). */
  flares?: EditTime[];
  /** The title at the end: from `at`, the lyrics give way to it until the picture fades out. */
  endCard?: { text: string; at: EditTime };
  /** Clips or stills (by clip id or still file) too alike to appear in one edit. */
  similar?: [string, string][];
  /** Clips left out and why, for the record. */
  notUsed?: Record<string, string>;
}
