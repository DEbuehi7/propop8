/**
 * Skaters play Kirtled (canon D8-16). Synthetic chords only: the Kirtled
 * study's canonical example and small made-up progressions.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import cueMapData from "../../fixtures/cuemap-ghost-network-pilot.json";
import libraryData from "../../fixtures/visual-clips-pilot.json";
import { vocab } from "../../lib/canon";
import type { HarmonyEvent, HarmonyTimeline, KeySegment } from "../../lib/dance8/contracts/harmony";
import type { CueMap, TempoSegment, VisualClip, VisualClipLibrary } from "../../lib/dance8/contracts/scene";
import { planKirtled } from "../../lib/dance8/harmony/pathSolver";
import { MIN_TRICK_SEC, skateTricks, trickClipShape } from "../../lib/dance8/harmony/skateTricks";
import { barToSec, validateCueMap } from "../../lib/dance8/authoring/validateCueMap";
import { planCuts } from "../../lib/dance8/runtime/CutPlanner";

const clone = <T>(x: T): T => JSON.parse(JSON.stringify(x)) as T;
const tempo = (bpm: number): TempoSegment[] => [{ startBar: 0, bpm, beatsPerBar: 4 }];
function timeline(chords: string[], keys?: KeySegment[], perBar = 1): HarmonyTimeline {
  const events: HarmonyEvent[] = chords.map((symbol, i) => ({ id: `c${i}`, startBar: Math.floor(i / perBar), startBeat: (i % perBar) * (4 / perBar), symbol }));
  return { id: "synthetic", schemaVersion: 1, trackId: "synthetic", analysisProfileId: "synthetic", events, approvalStatus: "draft", ...(keys ? { keys } : {}) };
}

test("canon: the approved trick for every move word", () => {
  assert.deepEqual(vocab.KIRTLED_SKATE_TRICKS.map((t) => [t.cue, t.trick]), [
    ["RA", "floor_carve"], ["LA", "kickflip_sweep"], ["KA", "handplant_roll"], ["TI", "ollie_leap"], ["HOLD", "board_freeze"],
  ]);
});

test("the canonical Kirtled example, one chord per 4 s bar: one trick per change, by its move word", () => {
  const seq = vocab.KIRTLED_CANONICAL_SEQUENCE;
  const { plan } = planKirtled(timeline([...seq.chords]), tempo(60), { requireApproved: false });
  const { tricks, skipped } = skateTricks(plan!);
  assert.equal(skipped, 0);
  assert.deepEqual(tricks.map((t) => t.cue), [...seq.words], "RA, RA, LA, LA, RA, RA as in the study");
  assert.deepEqual(tricks.map((t) => t.trick), ["floor_carve", "floor_carve", "kickflip_sweep", "kickflip_sweep", "floor_carve", "floor_carve"]);
  assert.deepEqual(tricks.map((t) => t.atBar), [1, 2, 3, 4, 5, 6], "each lands on its chord change; the first chord has nothing to land from");
});

test("tricks stay slower than the beat: faster chord changes are left to the floor lights", () => {
  const chords = ["C", "Am", "F", "Dm", "G", "Em", "C", "Am", "F"];
  const { plan } = planKirtled(timeline(chords, undefined, 2), tempo(120), { requireApproved: false });
  const { tricks, skipped } = skateTricks(plan!);
  assert.ok(tricks.length > 0 && skipped > 0);
  for (let i = 1; i < tricks.length; i++) assert.ok(tricks[i].atSec - tricks[i - 1].atSec >= MIN_TRICK_SEC - 1e-9, `${tricks[i - 1].atSec} -> ${tricks[i].atSec}`);
  assert.equal(tricks.length + skipped, chords.length - 1, "every change after the first is a trick or left to the lights");
});

test("a held chord is a board freeze; a key change is a big ollie leap", () => {
  const keys: KeySegment[] = [{ startBar: 0, startBeat: 0, tonic: 0, quality: "maj" }, { startBar: 3, startBeat: 0, tonic: 3, quality: "maj" }];
  const { plan } = planKirtled(timeline(["C", "Am", "N.C.", "Eb"], keys), tempo(60), { requireApproved: false });
  const { tricks } = skateTricks(plan!);
  assert.deepEqual(tricks.map((t) => [t.atBar, t.trick]), [[1, "floor_carve"], [2, "board_freeze"], [3, "ollie_leap"]]);
  assert.equal(tricks[2].cue, "TI");
});

test("the cut planner lands a trick clip's landing frame exactly on the trick, and stops free shots before it", () => {
  const map = clone(cueMapData) as unknown as CueMap;
  const lib = clone(libraryData) as unknown as VisualClipLibrary;
  const intro = map.cues[0];
  const barSec = barToSec(map.tempo, 1) - barToSec(map.tempo, 0);
  const shape = trickClipShape(barSec);
  const clip: VisualClip = {
    id: "trick-floor_carve-test", schemaVersion: 1, sceneId: intro.sceneId, camera: "wide", durationSec: Math.ceil(shape.minClipSec), aspect: map.aspect,
    file: "trick.mp4", source: { type: "ai_generated", createdAt: "2026-10-18T00:00:00Z", license: "proprietary" },
    drift: { status: "known", driftScore: 0.1, method: "human_review" }, approvalStatus: "approved", mouthVisible: false,
    trick: { trick: "floor_carve", landingSec: shape.landingSec },
  };
  lib.clips.push(clip);
  assert.deepEqual(validateCueMap(map, lib).issues.filter((i) => i.path.includes("trick")), []);
  const at = barToSec(map.tempo, 1) + barSec / 4; // beat 2 of bar 1
  const base = planCuts(map, lib);
  assert.ok(!base.cuts.some((c) => c.clipId === clip.id), "a trick clip is never free footage");
  const withTrick = planCuts(map, lib, { tricks: [{ atSec: at, trick: "floor_carve" }] });
  const cut = withTrick.cuts.find((c) => c.reason === "skate_trick")!;
  assert.ok(cut, JSON.stringify(withTrick.issues));
  assert.deepEqual([cut.startBar, cut.endBar, cut.clipId], [1, 2, clip.id]);
  assert.ok(Math.abs(cut.startSec + (clip.trick!.landingSec - cut.clipInSec) - at) < 1e-6, "landing frame on the trick");
  assert.equal(withTrick.cuts.find((c) => c.endBar === 1)?.startBar, 0, "the intro shot stops at bar 1");
  assert.equal(withTrick.cuts[withTrick.cuts.length - 1].endBar, base.cuts[base.cuts.length - 1].endBar);
  assert.deepEqual(planCuts(map, lib, { tricks: [{ atSec: at, trick: "kickflip_sweep" }] }).cuts, base.cuts, "no clip for that trick: the plan is unchanged");
  const bad = { ...clip, trick: { trick: "floor_carve", landingSec: 99 } };
  assert.ok(validateCueMap(map, { ...lib, clips: [...lib.clips.slice(0, -1), bad] }).issues.some((i) => i.path.endsWith("trick.landingSec")));
});
