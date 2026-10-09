// lib/dance8/runtime/CutPlanner.ts
//
// Turns a validated cue map + clip library into an edit decision list (cuts).
// Deterministic: cuts land on bar lines, cameras rotate in the order the cue
// lists them, and clips for the same scene + camera rotate in id order so the
// same footage is not repeated back to back. Nothing is improvised: if the
// cue map does not validate, no cuts are produced.
//
// Lip sync: while a voice is singing, a lip-synced clip that lines up with the
// song is used first, at the exact in-point that matches the audio. Otherwise
// only clips with no visible singer's mouth are allowed, so an out-of-sync
// mouth is never on screen.
//
// Variation: `seed` reshuffles camera order and which take is used, the same
// way every time for the same seed. Seed 0 is the plain, unshuffled plan.

import type { Cut, CueMap, VisualClip, VisualClipLibrary } from "../contracts/scene";
import {
  barToSec,
  candidatesFor,
  lipSyncedFor,
  validateCueMap,
  type CueMapIssue,
} from "../authoring/validateCueMap";

export interface CutPlan {
  ok: boolean;
  issues: CueMapIssue[];
  cuts: Cut[];
  totalSec: number;
}

export interface PlanOptions {
  requireApproved?: boolean;
  /** Whole number. Same seed + same inputs -> same cuts. 0 = no reshuffle. */
  seed?: number;
}

const EPS = 1e-9;
const round6 = (x: number) => Math.round(x * 1e6) / 1e6;

/** 32-bit FNV-1a; small, stable across platforms, good enough to spread picks. */
export function fnv1a(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}

export function planCuts(map: CueMap, library: VisualClipLibrary, opts: PlanOptions = {}): CutPlan {
  const v = validateCueMap(map, library, opts);
  if (!v.ok) return { ok: false, issues: v.issues, cuts: [], totalSec: 0 };

  const seed = opts.seed ?? 0;
  if (!Number.isInteger(seed) || seed < 0) {
    return {
      ok: false,
      issues: [{ code: "invalid_number", path: "seed", message: "seed must be a whole number >= 0" }],
      cuts: [],
      totalSec: 0,
    };
  }
  const shuffle = (key: string) => (seed === 0 ? 0 : fnv1a(`${seed}|${key}`));

  const vocals = map.vocals ?? [];
  const voiceAt = (bar: number) => vocals.find((p) => p.startBar <= bar && bar < p.endBar)?.voice ?? null;
  const anyVocal = (from: number, to: number) => vocals.some((p) => p.startBar < to && from < p.endBar);
  const secs = (bar: number) => barToSec(map.tempo, bar);

  const fallback = library.clips.find((c) => c.id === map.fallbackClipId)!;
  const useCount = new Map<string, number>();
  const cursor = new Map<string, number>(); // clipId -> next unused second
  const cuts: Cut[] = [];

  for (const cue of map.cues) {
    let bar = cue.startBar;
    let shotInCue = 0;
    const camOffset = shuffle(`cam|${cue.id}`) % cue.cameras.length;

    while (bar < cue.endBar) {
      const camera = cue.cameras[(shotInCue + camOffset) % cue.cameras.length];
      const wantBars = Math.min(cue.shotBars, cue.endBar - bar);
      const startSec = secs(bar);

      // Free footage for this camera; during vocals only shots with no visible singer.
      const key = `${cue.sceneId}|${camera}`;
      const hideMouth = anyVocal(bar, bar + wantBars);
      const cands = candidatesFor(library, map, cue.sceneId, camera, { hideMouth });

      // 1) Lip-synced footage for the voice singing at this bar: same camera
      //    first; another camera only when no free shot is allowed here.
      const voice = voiceAt(bar);
      let locked: VisualClip | null = null;
      if (voice) {
        const covering = lipSyncedFor(library, map, cue.sceneId).filter((c) => {
          const ls = c.lipSync!;
          return (
            ls.voice === voice &&
            ls.songStartSec <= startSec + EPS &&
            ls.songStartSec + c.durationSec >= secs(bar + 1) - EPS
          );
        });
        const sameCam = covering.filter((c) => c.camera === camera);
        const pool = sameCam.length > 0 ? sameCam : cands.length === 0 ? covering : [];
        if (pool.length > 0) locked = pool[shuffle(`ls|${cue.id}|${bar}`) % pool.length];
      }

      if (locked) {
        const end = locked.lipSync!.songStartSec + locked.durationSec;
        let bars = wantBars;
        while (bars > 1 && secs(bar + bars) > end + EPS) bars--;
        cuts.push({
          index: cuts.length,
          cueId: cue.id,
          section: cue.section,
          startBar: bar,
          endBar: bar + bars,
          startSec,
          endSec: secs(bar + bars),
          sceneId: cue.sceneId,
          camera: locked.camera,
          clipId: locked.id,
          clipInSec: round6(startSec - locked.lipSync!.songStartSec),
          reason: "lip_sync",
        });
        bar += bars;
        shotInCue++;
        continue;
      }

      // 2) Free footage.
      const n = useCount.get(key) ?? 0;
      const clip = cands.length > 0 ? cands[(n + shuffle(key)) % cands.length] : fallback;
      useCount.set(key, n + 1);

      let bars = wantBars;
      // Shorten (never stretch) so the shot fits inside the clip's length.
      while (bars > 1 && secs(bar + bars) - startSec > clip.durationSec + EPS) bars--;

      const endSec = secs(bar + bars);
      const len = endSec - startSec;
      let clipInSec = cursor.get(clip.id) ?? 0;
      if (clipInSec + len > clip.durationSec + EPS) clipInSec = 0;
      cursor.set(clip.id, round6(clipInSec + len));

      cuts.push({
        index: cuts.length,
        cueId: cue.id,
        section: cue.section,
        startBar: bar,
        endBar: bar + bars,
        startSec,
        endSec,
        sceneId: cue.sceneId,
        camera: cands.length === 0 ? fallback.camera : camera,
        clipId: clip.id,
        clipInSec,
        reason: cands.length === 0 ? "fallback_no_match" : bars < wantBars ? "shortened_to_clip" : "cue_rotation",
      });
      bar += bars;
      shotInCue++;
    }
  }

  // A render-ready plan may not lean on the stand-in clip anywhere.
  if (opts.requireApproved) {
    const gaps = cuts.filter((c) => c.reason === "fallback_no_match");
    if (gaps.length > 0) {
      return {
        ok: false,
        issues: gaps.map((c) => ({
          code: "no_clip_for_shot" as const,
          path: `cuts[${c.index}]`,
          message: `bars ${c.startBar}-${c.endBar} (${c.cueId}) have no usable clip${anyVocal(c.startBar, c.endBar) ? " without a visible singer" : ""}`,
        })),
        cuts: [],
        totalSec: 0,
      };
    }
  }

  const last = map.cues[map.cues.length - 1];
  return { ok: true, issues: [], cuts, totalSec: secs(last.endBar) };
}

/**
 * Cuts for a stretch of the song (a short, teaser or loop), re-timed to start
 * at 0. Shots crossing the edges are trimmed; lip-synced shots keep their
 * exact song alignment because the in-point moves with the trim.
 * Returns the song time the excerpt starts at, for the audio offset.
 */
export function sliceCuts(
  plan: CutPlan,
  tempo: CueMap["tempo"],
  fromBar: number,
  toBar: number,
): { cuts: Cut[]; offsetSec: number; totalSec: number } {
  const from = barToSec(tempo, fromBar);
  const to = barToSec(tempo, toBar);
  const out: Cut[] = [];
  for (const c of plan.cuts) {
    if (c.endBar <= fromBar || c.startBar >= toBar) continue;
    const sb = Math.max(c.startBar, fromBar);
    const eb = Math.min(c.endBar, toBar);
    const s = barToSec(tempo, sb);
    const e = barToSec(tempo, eb);
    out.push({
      ...c,
      index: out.length,
      startBar: sb,
      endBar: eb,
      startSec: round6(s - from),
      endSec: round6(e - from),
      clipInSec: round6(c.clipInSec + (s - c.startSec)),
    });
  }
  return { cuts: out, offsetSec: from, totalSec: round6(to - from) };
}
