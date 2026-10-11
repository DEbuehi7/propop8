// lib/dance8/authoring/shotBriefs.ts
//
// "What do I generate next?" Reads the cue map and the clip library and lists
// every shot the edit still needs, sized for a specific generator:
//   - lip_sync: a singer on a close/medium camera for a sung line that no
//     lip-synced clip covers yet. Starts on a bar line at a known song time,
//     so after lip sync it drops straight into the edit.
//   - broll: a scene/camera with no usable footage. During vocals it must not
//     show a singer's mouth.
// Keyframe times sit on bar lines so a multi-keyframe model (Kling 4.0 takes
// up to 10) lands its story beats on the music. Pure and deterministic.

import type { AspectRatio, CameraShot, CueMap, VisualClipLibrary } from "../contracts/scene";
import { barToSec, candidatesFor, lipSyncedFor } from "./validateCueMap";
import { generateAspect, type GeneratorProfile } from "./generators";

/** Cameras close enough that a singer's lips read on screen. */
export const MOUTH_CAMERAS: readonly CameraShot[] = ["close", "medium"];

export const ANTI_DRIFT_NOTES = [
  "Start from the scene's master image (first frame) and bind the subject/element.",
  "Avoid: morphing features, changing clothes, extra fingers, warped text, flicker.",
  "One singer per shot; mouth unobstructed (no hands, mic or hair over the lips).",
] as const;

export interface ShotBrief {
  id: string;
  kind: "lip_sync" | "broll";
  cueId: string;
  section: string;
  sceneId: string;
  camera: CameraShot;
  voice: string | null;
  lyric: string | null;
  /** Song time the generated clip should line up with (lip_sync) or cover. */
  songStartSec: number;
  songEndSec: number;
  /** Length to ask the generator for (within its limits). */
  generateSec: number;
  /** Bar lines inside the clip, seconds from the clip's first frame. */
  keyframesSec: number[];
  aspect: AspectRatio;
  cropTo: AspectRatio | null;
  generator: string;
  resolution: string;
  referenceSetId: string | null;
  mouth: "lip_sync" | "hidden" | "any";
  notes: string[];
}

const EPS = 1e-6;
const r3 = (x: number) => Math.round(x * 1000) / 1000;

function mostUsedReference(library: VisualClipLibrary, sceneId: string): string | null {
  const counts = new Map<string, number>();
  for (const c of library.clips) {
    const ref = c.source.referenceSetId;
    if (c.sceneId === sceneId && ref) counts.set(ref, (counts.get(ref) ?? 0) + 1);
  }
  const best = [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0];
  return best ? best[0] : null;
}

/** Bar lines strictly inside (start, end), relative to start, thinned to `max`. */
function keyframes(map: CueMap, startBar: number, endBar: number, max?: number): number[] {
  const t0 = barToSec(map.tempo, startBar);
  const all: number[] = [0];
  for (let b = startBar + 1; b < endBar; b++) all.push(r3(barToSec(map.tempo, b) - t0));
  if (!max || all.length <= max) return all;
  const step = Math.ceil(all.length / max);
  return all.filter((_, i) => i % step === 0).slice(0, max);
}

export function shotBriefs(map: CueMap, library: VisualClipLibrary, g: GeneratorProfile): ShotBrief[] {
  const secs = (bar: number) => barToSec(map.tempo, bar);
  const vocals = map.vocals ?? [];
  const { aspect, cropped } = generateAspect(map.aspect, g);
  const briefs: ShotBrief[] = [];

  /** Split [a, b) into bar-aligned chunks no longer than the generator allows. */
  const chunks = (a: number, b: number): [number, number][] => {
    const out: [number, number][] = [];
    let s = a;
    while (s < b) {
      let e = b;
      while (e > s + 1 && secs(e) - secs(s) > g.maxSec + EPS) e--;
      out.push([s, e]);
      s = e;
    }
    return out;
  };
  const lengthFor = (sec: number) => {
    const want = g.wholeSeconds ? Math.ceil(sec - EPS) : sec;
    return Math.min(g.maxSec, Math.max(g.minSec, want));
  };

  for (const cue of map.cues) {
    const ref = mostUsedReference(library, cue.sceneId);
    const longestShot = Math.max(
      ...Array.from({ length: cue.endBar - cue.startBar }, (_, i) => {
        const b = cue.startBar + i;
        return secs(Math.min(b + cue.shotBars, cue.endBar)) - secs(b);
      }),
    );

    // Sung runs inside this cue, one per vocal phrase.
    const sung = vocals
      .map((v) => ({ v, a: Math.max(v.startBar, cue.startBar), b: Math.min(v.endBar, cue.endBar) }))
      .filter((x) => x.a < x.b);

    for (const camera of [...new Set(cue.cameras)]) {
      const base = {
        cueId: cue.id,
        section: cue.section,
        sceneId: cue.sceneId,
        camera,
        aspect,
        cropTo: cropped ? map.aspect : null,
        generator: g.id,
        resolution: g.resolution,
        referenceSetId: ref,
      };

      if (MOUTH_CAMERAS.includes(camera)) {
        // Lip-sync coverage for every sung run on this camera.
        for (const { v, a, b } of sung) {
          const takes = lipSyncedFor(library, map, cue.sceneId).filter(
            (c) => c.camera === camera && c.lipSync!.voice === v.voice,
          );
          // Walk bar by bar; collect bars no take covers.
          let runStart: number | null = null;
          const gaps: [number, number][] = [];
          for (let bar = a; bar <= b; bar++) {
            const covered =
              bar < b &&
              takes.some(
                (c) => c.lipSync!.songStartSec <= secs(bar) + EPS && c.lipSync!.songStartSec + c.durationSec >= secs(bar + 1) - EPS,
              );
            if (bar < b && !covered && runStart === null) runStart = bar;
            if ((covered || bar === b) && runStart !== null) {
              gaps.push([runStart, bar]);
              runStart = null;
            }
          }
          for (const [ga, gb] of gaps) {
            for (const [s, e] of chunks(ga, gb)) {
              briefs.push({
                ...base,
                id: `lip_sync-${cue.id}-${camera}-${v.voice}-b${s}`,
                kind: "lip_sync",
                voice: v.voice,
                lyric: v.text ?? null,
                songStartSec: r3(secs(s)),
                songEndSec: r3(secs(e)),
                generateSec: lengthFor(secs(e) - secs(s)),
                keyframesSec: keyframes(map, s, e, g.maxKeyframes),
                mouth: "lip_sync",
                notes: [
                  `Then lip-sync to the ${v.voice} vocal stem from ${r3(secs(s))}s to ${r3(secs(e))}s; record songStartSec ${r3(secs(s))}.`,
                  ...ANTI_DRIFT_NOTES,
                ],
              });
            }
          }
        }
      }

      // Free footage: needed whenever this camera plays outside lip-synced takes.
      const hasSung = sung.length > 0;
      const unsungBars = cue.endBar - cue.startBar - sung.reduce((n, x) => n + (x.b - x.a), 0);
      const needHidden = hasSung && !MOUTH_CAMERAS.includes(camera);
      const needAny = unsungBars > 0;
      const any = candidatesFor(library, map, cue.sceneId, camera);
      const hidden = candidatesFor(library, map, cue.sceneId, camera, { hideMouth: true });
      const missing: "hidden" | "any" | null = needHidden && hidden.length === 0 ? "hidden" : needAny && any.length === 0 ? "any" : null;
      if (missing) {
        briefs.push({
          ...base,
          id: `broll-${cue.id}-${camera}`,
          kind: "broll",
          voice: null,
          lyric: null,
          songStartSec: r3(secs(cue.startBar)),
          songEndSec: r3(secs(cue.endBar)),
          generateSec: lengthFor(longestShot),
          keyframesSec: keyframes(map, cue.startBar, Math.min(cue.startBar + cue.shotBars, cue.endBar), g.maxKeyframes),
          mouth: missing,
          notes: [
            missing === "hidden"
              ? "Plays while someone sings: no singer's face or mouth in frame (backs, hands, feet, crowd, skyline)."
              : "Any framing allowed; this part of the cue is instrumental.",
            ...ANTI_DRIFT_NOTES,
          ],
        });
      }
    }
  }
  return briefs;
}
