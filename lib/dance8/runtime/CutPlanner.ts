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
  isEligible,
  lipSyncedFor,
  validateCueMap,
  type CueMapIssue,
  trickClipsFor,
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
  /**
   * Skate tricks to land (canon D8-16), bar-clock seconds, e.g. from
   * skateTricks(). A bar holding a trick uses an approved trick clip of that
   * trick and scene, placed so its landing frame falls on the trick.
   */
  tricks?: { atSec: number; trick: string; version?: string; crew?: string }[];
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
  // Lip-sync locks are in song time; bars count from the first downbeat.
  const origin = map.firstDownbeatSec ?? 0;
  const lockSec = (c: VisualClip) => c.lipSync!.songStartSec - origin;

  const fallback = library.clips.find((c) => c.id === map.fallbackClipId)!;
  // Dancer clips count like any footage: approved, the video's shape, within the drift limit.
  const isEligibleDance = (c: VisualClip) => isEligible(c, map);
  const useCount = new Map<string, number>();
  const cursor = new Map<string, number>(); // clipId -> next unused second
  const cuts: Cut[] = [];

  // Skate tricks (canon D8-16): the trick clip for a bar, placed so its
  // landing frame falls on the trick. Never one showing a mouth during vocals.
  const trickCutAt = (cue: CueMap["cues"][number], b: number): { clip: VisualClip; clipInSec: number } | null => {
    if (!opts.tricks?.length || b >= cue.endBar) return null;
    const s0 = secs(b);
    const s1 = secs(b + 1);
    const t = opts.tricks.find((k) => k.atSec >= s0 - EPS && k.atSec < s1 - EPS);
    if (!t) return null;
    const hide = anyVocal(b, b + 1);
    const fits = trickClipsFor(library, map, cue.sceneId).filter((c) => {
      const inSec = c.trick!.landingSec - (t.atSec - s0);
      return c.trick!.trick === t.trick && !(hide && c.mouthVisible) && inSec >= -EPS && inSec + (s1 - s0) <= c.durationSec + EPS;
    });
    // The version and crew the owner's dance picked (canon D8-18) first, then the version, then any.
    const rank = (c: VisualClip) => (t.version && c.trick!.version === t.version ? 2 : 0) + (t.crew && (c.trick!.crew ?? "solo") === t.crew ? 1 : 0);
    const bestRank = Math.max(-1, ...fits.map(rank));
    const pool = fits.filter((c) => rank(c) === bestRank);
    if (!pool.length) return null;
    const clip = pool[shuffle(`tr|${cue.id}|${b}`) % pool.length];
    return { clip, clipInSec: round6(Math.max(0, clip.trick!.landingSec - (t.atSec - s0))) };
  };

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
            lockSec(c) <= startSec + EPS &&
            lockSec(c) + c.durationSec >= secs(bar + 1) - EPS
          );
        });
        const sameCam = covering.filter((c) => c.camera === camera);
        const pool = sameCam.length > 0 ? sameCam : cands.length === 0 ? covering : [];
        if (pool.length > 0) locked = pool[shuffle(`ls|${cue.id}|${bar}`) % pool.length];
      }

      if (locked) {
        const end = lockSec(locked) + locked.durationSec;
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
          clipInSec: round6(startSec - lockSec(locked)),
          reason: "lip_sync",
        });
        bar += bars;
        shotInCue++;
        continue;
      }

      // 1b) A skate trick in this bar: a trick clip whose landing frame falls
      //     exactly on it, for one bar.
      const tc = trickCutAt(cue, bar);
      if (tc) {
        cuts.push({
          index: cuts.length,
          cueId: cue.id,
          section: cue.section,
          startBar: bar,
          endBar: bar + 1,
          startSec,
          endSec: secs(bar + 1),
          sceneId: cue.sceneId,
          camera: tc.clip.camera,
          clipId: tc.clip.id,
          clipInSec: tc.clipInSec,
          reason: "skate_trick",
        });
        bar += 1;
        shotInCue++;
        continue;
      }

      // 1c) A dancer clip made from the owner's dance at this very song time
      //     (canon D8-17): it plays where it was danced, so it keeps his timing.
      //     Same camera first, then any camera of the scene.
      const danced = library.clips.filter((c) => c.sceneId === cue.sceneId && c.danceLock && isEligibleDance(c)
        && !(hideMouth && c.mouthVisible) && c.danceLock.songStartSec - origin <= startSec + EPS && c.danceLock.songStartSec - origin + c.durationSec >= secs(bar + 1) - EPS);
      const dPool = danced.some((c) => c.camera === camera) ? danced.filter((c) => c.camera === camera) : danced;
      if (dPool.length) {
        const dc = dPool[shuffle(`dl|${cue.id}|${bar}`) % dPool.length];
        const end = dc.danceLock!.songStartSec - origin + dc.durationSec;
        let bars = wantBars;
        for (let b = bar + 1; b < bar + wantBars; b++) if (trickCutAt(cue, b)) { bars = b - bar; break; }
        while (bars > 1 && secs(bar + bars) > end + EPS) bars--;
        cuts.push({
          index: cuts.length, cueId: cue.id, section: cue.section, startBar: bar, endBar: bar + bars, startSec, endSec: secs(bar + bars),
          sceneId: cue.sceneId, camera: dc.camera, clipId: dc.id, clipInSec: round6(startSec - (dc.danceLock!.songStartSec - origin)), reason: "dance_lock",
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
      // Stop before a bar where a skate trick lands.
      for (let b = bar + 1; b < bar + wantBars; b++) if (trickCutAt(cue, b)) { bars = b - bar; break; }
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
