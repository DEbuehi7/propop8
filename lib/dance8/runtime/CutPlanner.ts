// lib/dance8/runtime/CutPlanner.ts
//
// Turns a validated cue map + clip library into an edit decision list (cuts).
// Deterministic: cuts land on bar lines, cameras rotate in the order the cue
// lists them, and clips for the same scene + camera rotate in id order so the
// same footage is not repeated back to back. Nothing is improvised: if the
// cue map does not validate, no cuts are produced.

import type { Cut, CueMap, VisualClipLibrary } from "../contracts/scene";
import {
  barToSec,
  candidatesFor,
  validateCueMap,
  type CueMapIssue,
} from "../authoring/validateCueMap";

export interface CutPlan {
  ok: boolean;
  issues: CueMapIssue[];
  cuts: Cut[];
  totalSec: number;
}

const EPS = 1e-9;

export function planCuts(
  map: CueMap,
  library: VisualClipLibrary,
  opts: { requireApproved?: boolean } = {},
): CutPlan {
  const v = validateCueMap(map, library, opts);
  if (!v.ok) return { ok: false, issues: v.issues, cuts: [], totalSec: 0 };

  const fallback = library.clips.find((c) => c.id === map.fallbackClipId)!;
  const useCount = new Map<string, number>();
  const cursor = new Map<string, number>(); // clipId -> next unused second
  const cuts: Cut[] = [];

  for (const cue of map.cues) {
    let bar = cue.startBar;
    let shotInCue = 0;
    while (bar < cue.endBar) {
      const camera = cue.cameras[shotInCue % cue.cameras.length];
      const key = `${cue.sceneId}|${camera}`;
      const cands = candidatesFor(library, map, cue.sceneId, camera);
      const n = useCount.get(key) ?? 0;
      const clip = cands.length > 0 ? cands[n % cands.length] : fallback;
      useCount.set(key, n + 1);

      const wantBars = Math.min(cue.shotBars, cue.endBar - bar);
      let bars = wantBars;
      // Shorten (never stretch) so the shot fits inside the clip's length.
      while (bars > 1 && barToSec(map.tempo, bar + bars) - barToSec(map.tempo, bar) > clip.durationSec + EPS) {
        bars--;
      }

      const startSec = barToSec(map.tempo, bar);
      const endSec = barToSec(map.tempo, bar + bars);
      const len = endSec - startSec;
      let clipInSec = cursor.get(clip.id) ?? 0;
      if (clipInSec + len > clip.durationSec + EPS) clipInSec = 0;
      cursor.set(clip.id, Math.round((clipInSec + len) * 1e6) / 1e6);

      const reason: Cut["reason"] =
        cands.length === 0 ? "fallback_no_match" : bars < wantBars ? "shortened_to_clip" : "cue_rotation";

      cuts.push({
        index: cuts.length,
        cueId: cue.id,
        section: cue.section,
        startBar: bar,
        endBar: bar + bars,
        startSec,
        endSec,
        sceneId: cue.sceneId,
        camera: clip === fallback && cands.length === 0 ? fallback.camera : camera,
        clipId: clip.id,
        clipInSec,
        reason,
      });
      bar += bars;
      shotInCue++;
    }
  }

  const last = map.cues[map.cues.length - 1];
  return { ok: true, issues: [], cuts, totalSec: barToSec(map.tempo, last.endBar) };
}
