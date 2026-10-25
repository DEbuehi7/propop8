// lib/dance8/moves/dancers.ts
//
// The owner's dance onto the dancers (canon D8-17). For a dance scene, each
// stretch of the song a take covers becomes a "dance" shot: a cut of the take
// (3-30 s, Kling Motion Control's limits) is the motion reference and the
// dancer's character image the look. The clip that comes back is locked to the
// song time it was danced to (VisualClip.danceLock), so the dancer keeps the
// owner's timing. compareMotion then measures whether it did: the generated
// dancer's motion against the take's, as a timing offset and a match. That is
// a measurement for the person; approving a clip stays theirs. Pure.

import { ANTI_DRIFT_NOTES, type ShotBrief } from "../authoring/shotBriefs";
import { generateAspect, type GeneratorProfile } from "../authoring/generators";
import { barToSec } from "../authoring/validateCueMap";
import type { CameraShot, CueMap, VisualClipLibrary } from "../contracts/scene";
import type { MoveTrack, PoseCapture } from "../contracts/moves";
import { bodySeries } from "./body";
import { speeds } from "./beats";

/** Kling Motion Control takes a reference of 3 to 30 seconds. */
export const REF_MIN_SEC = 3;
export const REF_MAX_SEC = 30;
/** A take must read at least this share of a stretch's beats to be its reference. */
export const MIN_KNOWN_SHARE = 0.8;
/** check-moves: the dancer keeps your timing within this... */
export const CHECK_MAX_LAG_MS = 84;
/** ...and follows your moves with at least this match. */
export const CHECK_MIN_R = 0.5;
/** Timing offsets searched (seconds either way). */
export const CHECK_MAX_LAG_SEC = 0.5;

/** Slack when checking a bar lies inside the take's video (seconds). */
const SPAN_EPS = 0.001;

const r3 = (x: number) => Math.round(x * 1000) / 1000;
const mmss = (s: number) => `${Math.floor(s / 60)}:${(s % 60).toFixed(1).padStart(4, "0")}`;

/** Bars per dance shot: as long as the generator and Kling Motion Control allow, at least 3 s. */
export function danceWindowBars(map: Pick<CueMap, "tempo">, g: Pick<GeneratorProfile, "maxSec">): number {
  const barSec = barToSec(map.tempo, 1);
  const most = Math.max(1, Math.floor(Math.min(g.maxSec, REF_MAX_SEC) / barSec + 1e-9));
  return Math.max(most, Math.ceil(REF_MIN_SEC / barSec - 1e-9));
}

/** Is this stretch of the song already covered by a dancer clip in the scene? */
export function danceCovered(lib: VisualClipLibrary, sceneId: string, songStart: number, songEnd: number): boolean {
  return lib.clips.some((c) => c.sceneId === sceneId && c.danceLock && c.approvalStatus !== "retired"
    && c.danceLock.songStartSec <= songStart + 1e-6 && c.danceLock.songStartSec + c.durationSec >= songEnd - 1e-6);
}

/**
 * Dance shots for the dance scenes: the bars your takes read well (at least
 * MIN_KNOWN_SHARE of the beats), grouped into runs from the same take and
 * split into shots as long as the generator allows; a run shorter than 3 s is
 * skipped. A stretch a dancer clip already covers is skipped too. With each
 * take's video length (videoSec), a bar the video doesn't hold from bar line
 * to bar line is left out, so a reference is never cut short of its shot.
 */
export function danceBriefs(
  map: CueMap, lib: VisualClipLibrary, tracks: MoveTrack[], videos: Record<string, string>, sceneIds: string[], g: GeneratorProfile,
  videoSec: Record<string, number> = {},
): ShotBrief[] {
  const origin = map.firstDownbeatSec ?? 0;
  const W = danceWindowBars(map, g);
  // Generated at a shape the generator offers, cropped to the video's when it doesn't offer that one.
  const { aspect, cropped } = generateAspect(map.aspect, g);
  const songAt = (bar: number) => r3(origin + barToSec(map.tempo, bar));
  const minBars = Math.ceil(REF_MIN_SEC / barToSec(map.tempo, 1) - 1e-9);
  const sorted = [...tracks].sort((a, b) => a.takeId.localeCompare(b.takeId));
  const shareIn = (t: MoveTrack, bar: number) => {
    const len = videoSec[t.takeId];
    const at0 = t.sync.songAtCapture0;
    if (len !== undefined && (songAt(bar) - at0 < -SPAN_EPS || songAt(bar + 1) - at0 > len + SPAN_EPS)) return 0;
    const per = map.tempo[0].beatsPerBar;
    return t.beats.filter((x) => x.bar === bar && x.status === "known").length / per;
  };
  const out: ShotBrief[] = [];
  for (const cue of map.cues.filter((c) => sceneIds.includes(c.sceneId))) {
    const camera: CameraShot = cue.cameras.includes("wide") ? "wide" : cue.cameras[0];
    // The best-reading take for each bar (null when none reads it well).
    const best: (MoveTrack | null)[] = [];
    for (let b = cue.startBar; b < cue.endBar; b++) {
      let pick: MoveTrack | null = null, top = MIN_KNOWN_SHARE - 1e-9;
      for (const t of sorted) { const sh = shareIn(t, b); if (sh > top) { pick = t; top = sh; } }
      best.push(pick);
    }
    for (let i = 0; i < best.length; ) {
      const t = best[i];
      if (!t) { i++; continue; }
      let j = i;
      while (j < best.length && best[j] === t) j++;
      for (let k = i; k < j; k += W) {
        const b0 = cue.startBar + k, b1 = cue.startBar + Math.min(j, k + W);
        if (b1 - b0 < minBars) continue;
        const songStart = songAt(b0), songEnd = songAt(b1);
        if (danceCovered(lib, cue.sceneId, songStart, songEnd)) continue;
        const known = t.beats.filter((x) => x.bar >= b0 && x.bar < b1 && x.status === "known").length / ((b1 - b0) * map.tempo[0].beatsPerBar);
        const at0 = t.sync.songAtCapture0;
        const id = `dance-${cue.id}-b${b0}`;
        const keyframes: number[] = [];
        for (let b = b0; b < b1; b++) keyframes.push(r3(songAt(b) - songStart));
        out.push({
          id, kind: "dance", cueId: cue.id, section: cue.section, sceneId: cue.sceneId, camera, voice: null, lyric: null,
          songStartSec: songStart, songEndSec: songEnd, generateSec: r3(songEnd - songStart), keyframesSec: keyframes,
          aspect, cropTo: cropped ? map.aspect : null, generator: g.id, resolution: g.resolution, referenceSetId: null, mouth: "any",
          motionRef: {
            takeId: t.takeId, video: videos[t.takeId] ?? t.takeId,
            captureStartSec: r3(songStart - at0), captureEndSec: r3(songEnd - at0), songStartSec: songStart, songEndSec: songEnd,
            knownShare: Math.round(known * 100) / 100, refFile: null,
          },
          notes: [
            `Kling Motion Control: upload moves/refs/${id}.mp4 (your dance, song ${mmss(songStart)} to ${mmss(songEnd)}, take ${t.takeId}) as the motion video, and the dancer's character image (full body, the same framing). Keep "character orientation matches video".`,
            "Describe the scene, light and camera only, not the moves; the video carries the dance.",
            `Name the download ${id}.mp4. Dance8 plays it at song ${mmss(songStart)} so the dancer stays on your beat; then run check-moves.`,
            ANTI_DRIFT_NOTES[0], ANTI_DRIFT_NOTES[1],
          ],
        });
      }
      i = j;
    }
  }
  return out;
}

/** Per-frame motion energy of a capture, optionally only [fromSec, toSec) of it (capture seconds). */
export function motionCurve(cap: PoseCapture, fromSec = -Infinity, toSec = Infinity): Float64Array {
  const frames = cap.frames.filter((f) => f.t >= fromSec - 1e-9 && f.t < toSec - 1e-9);
  const sub: PoseCapture = { ...cap, frames };
  return speeds(bodySeries(sub)).energy;
}

/**
 * Timing offset (positive: the generated dancer is late) and match between
 * the take's motion and the generated dancer's, both sampled at `fps`.
 */
export function compareMotion(ref: Float64Array, gen: Float64Array, fps: number, maxLagSec = CHECK_MAX_LAG_SEC): { lagMs: number; r: number } {
  const z = (x: Float64Array) => {
    const ok = Array.from(x).filter(Number.isFinite);
    const m = ok.reduce((a, c) => a + c, 0) / Math.max(1, ok.length);
    const sd = Math.sqrt(ok.reduce((a, c) => a + (c - m) ** 2, 0) / Math.max(1, ok.length)) || 1;
    return Float64Array.from(x, (v) => (Number.isFinite(v) ? (v - m) / sd : 0));
  };
  const a = z(ref), b = z(gen);
  const maxLag = Math.round(maxLagSec * fps);
  const rAt = new Map<number, number>();
  let best = -Infinity, bestL = 0;
  for (let L = -maxLag; L <= maxLag; L++) {
    let sxy = 0, sx = 0, sy = 0, sxx = 0, syy = 0, n = 0;
    for (let i = Math.max(0, L); i < Math.min(b.length, a.length + L); i++) {
      const x = a[i - L], y = b[i];
      sxy += x * y; sx += x; sy += y; sxx += x * x; syy += y * y; n++;
    }
    if (n < fps) continue;
    const vx = sxx - (sx * sx) / n, vy = syy - (sy * sy) / n;
    const r = vx > 0 && vy > 0 ? (sxy - (sx * sy) / n) / Math.sqrt(vx * vy) : 0;
    rAt.set(L, r);
    if (r > best) { best = r; bestL = L; }
  }
  if (best === -Infinity) return { lagMs: 0, r: 0 };
  let lag = bestL;
  const p = rAt.get(bestL - 1), q = rAt.get(bestL + 1);
  if (p !== undefined && q !== undefined) { const den = p - 2 * best + q; if (den < 0) lag += Math.max(-0.5, Math.min(0.5, (p - q) / (2 * den))); }
  return { lagMs: Math.round((lag * 1000) / fps), r: Math.round(best * 1000) / 1000 };
}

export function verdictOf(m: { lagMs: number; r: number }): "keeps_timing" | "drifts" | "does_not_follow" {
  return m.r < CHECK_MIN_R ? "does_not_follow" : Math.abs(m.lagMs) <= CHECK_MAX_LAG_MS ? "keeps_timing" : "drifts";
}
