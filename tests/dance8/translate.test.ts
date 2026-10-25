/**
 * The owner's dance onto the performers (canon D8-17 and D8-18): skater
 * versions, crew and carve; Kirtled matches and floor lights; dance shots,
 * dancer clips locked to their song time, and the timing check; motion rules
 * for the Gate 1 scorer and the style profile. Synthetic dancers, songs and
 * clips only.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { vocab } from "../../lib/canon";
import cueMapData from "../../fixtures/cuemap-ghost-network-pilot.json";
import libraryData from "../../fixtures/visual-clips-pilot.json";
import clipsDemo from "../../fixtures/clips-demo.json";
import graphDemo from "../../fixtures/transitions-demo.json";
import policyV1 from "../../fixtures/policy-v1.json";
import posesData from "../../fixtures/poses.json";
import { danceGenerator, GENERATORS } from "../../lib/dance8/authoring/generators";
import type { ShotBrief } from "../../lib/dance8/authoring/shotBriefs";
import { validateBundle } from "../../lib/dance8/authoring/validateBundle";
import { barToSec } from "../../lib/dance8/authoring/validateCueMap";
import type { HarmonyEvent, HarmonyTimeline } from "../../lib/dance8/contracts/harmony";
import type { MotionClip } from "../../lib/dance8/contracts/motion";
import type { MoveBeat, MoveTrack, MoveWord, MoveWordId } from "../../lib/dance8/contracts/moves";
import type { CueMap, VisualClip, VisualClipLibrary } from "../../lib/dance8/contracts/scene";
import type { SignalFrame } from "../../lib/dance8/contracts/signal";
import { planKirtled } from "../../lib/dance8/harmony/pathSolver";
import type { TrickEvent } from "../../lib/dance8/harmony/skateTricks";
import { compareMotion, danceBriefs, danceWindowBars, motionCurve, verdictOf } from "../../lib/dance8/moves/dancers";
import { kirtledDance } from "../../lib/dance8/moves/kirtled";
import { carveOf, crewFor, kaVersion, ollieVersion, styleTricks } from "../../lib/dance8/moves/skaters";
import { danceRules, styleProfile, tempoBand } from "../../lib/dance8/moves/style";
import { manualSync } from "../../lib/dance8/moves/sync";
import { buildMoveTrack } from "../../lib/dance8/moves/track";
import { ingestClips, planTrack, setClipStatus, songPaths } from "../../lib/dance8/pipeline";
import { ruleFits, scoreCandidate } from "../../lib/dance8/runtime/CandidateScorer";
import { planCuts } from "../../lib/dance8/runtime/CutPlanner";
import { addSong, analyzeTrack, type Ctx } from "../../lib/stuttr/commands";
import { PHONE, SCRIPT, scriptedDance, synthCapture } from "./synthDancer";

const clone = <T>(x: T): T => JSON.parse(JSON.stringify(x)) as T;
const hasFfmpeg = spawnSync("ffmpeg", ["-version"]).status === 0;

// A hand-made take at 100 BPM (beat 0.6 s, bar 2.4 s), bar 0 at song 0.5 s.
const MAP = {
  trackId: "synthetic", analysisProfileId: "synthetic", aspect: "9:16", tempo: [{ startBar: 0, bpm: 100, beatsPerBar: 4 }], firstDownbeatSec: 0.5,
  cues: [
    { id: "verse", section: "verse", startBar: 0, endBar: 8, sceneId: "stage", cameras: ["wide", "medium"], shotBars: 2 },
    { id: "hook", section: "chorus", startBar: 8, endBar: 16, sceneId: "stage", cameras: ["wide"], shotBars: 2 },
  ],
} as unknown as CueMap;
const BEAT = 0.6, BAR = 2.4;
const songOf = (bar: number, beat = 0) => Math.round((0.5 + bar * BAR + beat * BEAT) * 1e6) / 1e6;

function take(id: string, bars: number, o: { energy?: (bar: number) => number; level?: (bar: number) => number; travelX?: (bar: number) => number; turn?: (bar: number) => number; words?: [MoveWordId, number, number, number][] } = {}): MoveTrack {
  const beats: MoveBeat[] = [];
  for (let b = 0; b < bars; b++) for (let k = 0; k < 4; k++) {
    const ratio = o.level?.(b) ?? 1;
    beats.push({
      beat: b * 4 + k, bar: b, beatInBar: k, songSec: songOf(b, k), status: "known", confidence: 0.95,
      energy: o.energy?.(b) ?? 0.2, level: ratio < 0.4 ? "floor" : ratio < 0.75 ? "low" : "mid", levelRatio: ratio, zones: ["arms", "hips"],
      travel: { x: (o.travelX?.(b) ?? 0) / 4, toward: 0 }, turnDeg: (o.turn?.(b) ?? 0) / 4, airborne: false, still: false, accent: 0,
    });
  }
  const MOVE: Record<MoveWordId, MoveWord["move"]> = { DO: "STOMP", RA: "ROLL", LA: "FLIP", KA: "SPIN", TI: "JUMP", FREEZE: "FREEZE" };
  const words: MoveWord[] = (o.words ?? []).map(([word, bar, beat, size]) => ({ word, move: MOVE[word], songSec: songOf(bar, beat), bar, beatInBar: beat, size, detail: "" }));
  return {
    schemaVersion: 1, analyzer: "dance8-moves-1", trackId: "synthetic", takeId: id, source: { type: "recorded", createdBy: "owner", createdAt: "x", license: "proprietary" },
    sync: manualSync(0, "x"), beats, words, coverage: { fromBar: 0, toBar: bars - 1, beats: beats.length, knownBeats: beats.length }, approvalStatus: "draft", createdAt: "x",
  };
}
const trickAt = (cue: TrickEvent["cue"], bar: number, beat = 0): TrickEvent => {
  const trick = vocab.KIRTLED_SKATE_TRICKS.find((t) => t.cue === cue)!.trick;
  return { eventId: `e${bar}`, atBar: bar, atBeat: beat, atSec: bar * BAR + beat * BEAT, cue, trick };
};

test("canon D8-18: the dance picks the KA version, the ollie, the freeze, the crew and the carve", () => {
  assert.deepEqual([kaVersion(90), kaVersion(170), kaVersion(200), kaVersion(350), kaVersion(-720), kaVersion(null)], ["handplant_roll", "spin_180", "spin_180", "spin_360", "spin_360", "handplant_roll"]);
  assert.deepEqual([ollieVersion(null), ollieVersion(0.1), ollieVersion(0.2), ollieVersion(0.45)], ["ollie_standard", "ollie_low", "ollie_mid", "ollie_high"]);
  assert.deepEqual([crewFor(null), crewFor(0.2), crewFor(0.5), crewFor(0.9), crewFor(0.5, 6)], [
    { crew: "solo", crewCount: 1 }, { crew: "solo", crewCount: 1 }, { crew: "half", crewCount: 4 }, { crew: "all", crewCount: 8 }, { crew: "half", crewCount: 3 },
  ], "thirds of the energy; eight skaters by default (D8-11)");
  assert.deepEqual([carveOf({ x: 0.2, toward: 0.1 }), carveOf({ x: 1.2, toward: 0.3 }), carveOf({ x: -0.8, toward: 0 }), carveOf({ x: 0.1, toward: -0.9 })], ["in_place", "screen_right", "screen_left", "away_from_camera"]);
});

test("tricks styled from a take, and left as D8-16 where no take reaches", () => {
  const t = take("t1", 12, {
    energy: (b) => (b < 4 ? 0.2 : b < 8 ? 0.5 : 0.85), level: (b) => (b === 6 ? 0.6 : 1), travelX: (b) => (b === 2 ? 1.6 : 0),
    words: [["KA", 4, 2, 365], ["TI", 8, 0.2, 0.36], ["FREEZE", 6, 1, 2]],
  });
  const tricks = [trickAt("KA", 3), trickAt("KA", 5), trickAt("TI", 8), trickAt("HOLD", 6, 2), trickAt("HOLD", 10), trickAt("RA", 20)];
  const s = styleTricks(tricks, [t], MAP);
  assert.deepEqual(s.map((x) => x.atBar), [3, 5, 6, 8, 10, 20], "in song order");
  const row = (bar: number) => { const x = s.find((y) => y.atBar === bar)!; return [x.version, x.crew, x.carve]; };
  assert.deepEqual(row(3), ["handplant_roll", "solo", "screen_right"], "no spin before bar 3; it follows the travel in bar 2");
  assert.deepEqual(row(5), ["spin_360", "half", "in_place"], "the 360 in bar 4");
  assert.deepEqual(row(6), ["freeze_low", "half", "in_place"], "the freeze in bar 6 is low");
  assert.deepEqual(row(8), ["ollie_high", "half", "in_place"], "the 0.36 m jump; the bar before is at half energy");
  assert.deepEqual(row(10), ["freeze_high", "all", "in_place"], "no freeze: standing then; full energy");
  assert.equal(s[5].fromDance, null, "bar 20 is past the take");
  assert.deepEqual(row(20), ["floor_carve", "solo", "in_place"]);
  assert.equal(s[1].songSec, songOf(5), "bar-clock seconds plus the first downbeat");
  assert.deepEqual(styleTricks(tricks, [t], MAP), s, "deterministic");
});

test("Kirtled: your words against the song's chord changes, and stomps on the floor lights", () => {
  const harmony: HarmonyTimeline = {
    id: "h", schemaVersion: 1, trackId: "synthetic", analysisProfileId: "synthetic", approvalStatus: "draft",
    events: vocab.KIRTLED_CANONICAL_SEQUENCE.chords.map((symbol, i): HarmonyEvent => ({ id: `c${i}`, startBar: i, startBeat: 0, symbol })),
  };
  const { plan } = planKirtled(harmony, MAP.tempo, { requireApproved: false });
  // The song: RA, RA, LA, LA, RA, RA on bars 1-6. You: RA on bar 1, LA on bar 2 (off), LA on bar 4, stomps.
  const t = take("t1", 8, { words: [["RA", 1, 0.3, 1], ["LA", 2, 0, 0.3], ["LA", 3, 3.2, 0.3], ["DO", 1, 2, 3], ["DO", 5, 0, 3]] });
  const kd = kirtledDance(plan!, [t], MAP);
  assert.deepEqual(kd.changes.map((c) => [c.bar, c.word, c.match]), [[1, "RA", true], [2, "RA", false], [3, "LA", false], [4, "LA", true], [5, "RA", false], [6, "RA", false]]);
  assert.deepEqual([kd.matched, kd.covered], [2, 6]);
  assert.deepEqual(kd.lights.map((l) => [l.bar, l.beatInBar, l.kind]), [[1, 2, "stomp"], [5, 0, "stomp"]]);
  assert.deepEqual(kirtledDance(plan!, [], MAP).changes.map((c) => c.match), [null, null, null, null, null, null], "no take: not judged");
});

test("dance shots: one per stretch a take reads, the reference cut at that song time", () => {
  const g = danceGenerator(false);
  assert.deepEqual([g.id, g.maxSec, g.resolution, danceGenerator(true).resolution], ["kling-3.0-motion-control-720p", 30, "720p", "1080p"],
    "dance shots are Motion Control: drafts at 720p, finals at 1080p, references up to 30 s");
  const lib: VisualClipLibrary = { version: 1, clips: [] };
  const t = { ...take("t1", 16), sync: manualSync(-1.5, "x") }; // the video started 1.5 s before the song
  const briefs = danceBriefs(MAP, lib, [t], { t1: "IMG_0001.MOV" }, ["stage"], g);
  assert.deepEqual(briefs.map((b) => [b.id, b.songStartSec, b.songEndSec]), [["dance-verse-b0", songOf(0), songOf(8)], ["dance-hook-b8", songOf(8), songOf(16)]],
    "8 bars (19.2 s) fit one 30 s Motion Control reference");
  assert.deepEqual([briefs[0].generator, briefs[0].resolution, briefs[0].aspect, briefs[0].cropTo], ["kling-3.0-motion-control-720p", "720p", MAP.aspect, null]);
  // Motion Control has no 21:9: generate 16:9 and crop to the video's shape.
  const wide = danceBriefs({ ...MAP, aspect: "21:9" }, lib, [t], {}, ["stage"], g)[0];
  assert.deepEqual([wide.aspect, wide.cropTo], ["16:9", "21:9"]);
  // The 20 s Flash limit would have split a 9-bar stretch (21.6 s); Motion Control keeps it whole.
  assert.equal(danceWindowBars(MAP, g), 12);
  assert.equal(danceWindowBars(MAP, GENERATORS["kling-4.0-flash"]), 8);
  // A 20 s video (song -1.5 s to 18.5 s): only bars it holds from bar line to bar line.
  assert.deepEqual(danceBriefs(MAP, lib, [t], {}, ["stage"], g, { t1: 20 }).map((b) => [b.id, b.songStartSec, b.songEndSec, b.motionRef!.captureEndSec]),
    [["dance-verse-b0", songOf(0), songOf(7), songOf(7) + 1.5]]);
  const short = { ...take("t1", 12), sync: manualSync(-1.5, "x") };
  assert.deepEqual(danceBriefs(MAP, lib, [short], {}, ["stage"], g).map((b) => [b.id, b.songEndSec]), [["dance-verse-b0", songOf(8)], ["dance-hook-b8", songOf(12)]],
    "the hook shot stops where the take does");
  // Bars 3-4 unreadable (out of frame): the verse splits around them; a 1-bar run (2.4 s) is too short for a reference.
  const gappy = take("t2", 16);
  gappy.beats = gappy.beats.map((x) => (x.bar === 3 || x.bar === 4 || x.bar === 6 ? { ...x, status: "unknown" as const } : x));
  assert.deepEqual(danceBriefs(MAP, lib, [gappy], {}, ["stage"], g).map((b) => [b.id, b.songStartSec, b.songEndSec]), [
    ["dance-verse-b0", songOf(0), songOf(3)], ["dance-hook-b8", songOf(8), songOf(16)],
  ]);
  const m = briefs[0].motionRef!;
  assert.deepEqual([m.takeId, m.video, m.captureStartSec, m.knownShare], ["t1", "IMG_0001.MOV", songOf(0) + 1.5, 1]);
  assert.ok(briefs[0].generateSec >= 3 && briefs[0].generateSec <= 30);
  assert.ok(briefs[0].notes[0].includes("Kling Motion Control") && briefs[0].notes[0].includes("dance-verse-b0.mp4"));
  // A dancer clip already covering the verse stretch: only the hook remains.
  const covered: VisualClip = { ...clone(libraryData.clips[0]) as unknown as VisualClip, id: "d1", sceneId: "stage", durationSec: 20, danceLock: { takeId: "t1", songStartSec: songOf(0), captureStartSec: 2 } };
  assert.deepEqual(danceBriefs(MAP, { version: 1, clips: [covered] }, [t], {}, ["stage"], g).map((b) => b.id), ["dance-hook-b8"]);
  assert.deepEqual(danceBriefs(MAP, lib, [t], {}, ["elsewhere"], g), []);
});

test("cut planner: a dancer clip plays at the song time it was danced; tricks prefer the version your dance picked", () => {
  const map = clone(cueMapData) as unknown as CueMap;
  const lib = clone(libraryData) as unknown as VisualClipLibrary;
  const base = planCuts(map, lib);
  const cue = map.cues[1];
  const origin = map.firstDownbeatSec ?? 0;
  const barSec = barToSec(map.tempo, 1);
  const donor = lib.clips.find((c) => c.sceneId === cue.sceneId && !c.lipSync && !c.trick)!;
  const dancer: VisualClip = { ...clone(donor), id: "dancer-1", camera: cue.cameras[0], durationSec: Math.ceil(3 * barSec), danceLock: { takeId: "t1", songStartSec: origin + barToSec(map.tempo, cue.startBar), captureStartSec: 4 } };
  const withDancer = planCuts(map, { ...lib, clips: [...lib.clips, dancer] });
  const locked = withDancer.cuts.filter((c) => c.reason === "dance_lock");
  assert.ok(locked.length >= 1, JSON.stringify(withDancer.issues));
  assert.equal(locked[0].startBar, cue.startBar);
  assert.equal(locked[0].clipInSec, 0);
  for (const c of locked) assert.ok(Math.abs(c.startSec - (dancer.danceLock!.songStartSec - origin) - c.clipInSec) < 1e-6, "in-point follows the song");
  assert.deepEqual(planCuts(map, lib).cuts, base.cuts, "without dancer clips the plan is unchanged");
  // Two approved handplant-roll clips; your dance asked for the 360.
  const tr = (id: string, version?: string): VisualClip => ({ ...clone(donor), id, mouthVisible: false, durationSec: Math.ceil(2 * barSec), trick: { trick: "handplant_roll", landingSec: barSec, ...(version ? { version } : {}) } });
  const lib2 = { ...lib, clips: [...lib.clips, tr("hp-a"), tr("hp-z-360", "spin_360")] };
  const at = barToSec(map.tempo, cue.startBar + 1);
  const pick = (version?: string) => planCuts(map, lib2, { tricks: [{ atSec: at, trick: "handplant_roll", ...(version ? { version } : {}) }] }).cuts.find((c) => c.reason === "skate_trick")!.clipId;
  assert.equal(pick("spin_360"), "hp-z-360");
  assert.ok(["hp-a", "hp-z-360"].includes(pick("spin_180")), "no 180 clip: any handplant-roll clip still lands it");
});

test("the scorer uses your rules only when given, and only where they apply", () => {
  const clips = clipsDemo.clips as unknown as MotionClip[];
  const groove = clips.find((c) => c.id === "groove_grounded_01")!, travel = clips.find((c) => c.id === "move_directional_02")!;
  const known = (v: number) => ({ value: v, confidence: 1, status: "known" as const });
  const frame = (section: SignalFrame["section"]): SignalFrame => ({ t: 0, beatIndex: 0, barIndex: 0, beatPhase: 0, bpm: known(100), energy: known(0.5), onset: known(0), low: known(0), mid: known(0), high: known(0), section, analysisProfileId: "p" });
  const rules = [{ id: "dance-chorus-mid", sections: ["chorus" as const], bpmRange: [92, 108] as const, preferredZones: ["hips" as const, "legs" as const], preferredTags: ["groove", "level:low"], weight: 1 }];
  assert.deepEqual(ruleFits(groove, frame("chorus"), rules), { sectionFit: 1, zoneFit: 1 });
  assert.deepEqual(ruleFits(travel, frame("chorus"), rules), { sectionFit: 0, zoneFit: 0.5 });
  assert.equal(ruleFits(groove, frame("verse"), rules), null, "a chorus rule says nothing about a verse");
  const policy = policyV1 as never;
  const plain = scoreCandidate(travel, frame("chorus"), policy, []);
  assert.deepEqual([plain.sectionFit, plain.zoneFit], [1, 1], "no rules: neutral, as before");
  assert.ok(scoreCandidate(groove, frame("chorus"), policy, [], rules).total > scoreCandidate(travel, frame("chorus"), policy, [], rules).total);
});

test("your style: rules from a song's own takes, a profile across songs, and rules from it for a new song", () => {
  const t = take("t1", 16, { energy: (b) => (b < 8 ? 0.2 : 0.8), level: (b) => (b < 8 ? 0.6 : 1), words: [["KA", 9, 0, 360], ["KA", 11, 0, 180], ["TI", 13, 0, 0.3], ["TI", 15, 0, 0.3], ["DO", 2, 0, 3]] });
  const versions = { motionLibraryVersion: 1, transitionGraphVersion: 1, runtimePolicyVersion: 1 };
  const own = danceRules(MAP, { tracks: [t] }, versions, "x");
  assert.equal(own.source, "takes");
  assert.deepEqual(own.rules.map((r) => [r.id, r.sections, r.preferredTags]), [
    ["dance-chorus-mid", ["chorus"], ["level:mid", "energy:high", "turn", "jump"]],
    ["dance-verse-mid", ["verse"], ["level:low", "energy:low", "groove"]],
  ]);
  assert.deepEqual(own.rules[0].bpmRange, [92, 108]);
  assert.equal(own.approvalStatus, "draft");
  assert.equal(own.generatedBy, "human", "from the owner's own dance, not a model");
  const v = validateBundle({ bundle: own, poses: posesData as never, library: clipsDemo as never, graph: graphDemo as never, policy: policyV1 as never });
  assert.deepEqual(v.issues, [], "a valid Gate 1 mapping bundle");
  const profile = styleProfile([{ trackId: "synthetic", map: MAP, tracks: [t] }], "x");
  assert.deepEqual(profile.cells.map((c) => [c.section, c.tempo, c.level, c.perBar.KA]), [["chorus", "mid", "mid", 0.25], ["verse", "mid", "low", 0]]);
  const fast = { ...MAP, trackId: "other", tempo: [{ startBar: 0, bpm: 128, beatsPerBar: 4 }], cues: [{ ...MAP.cues[1], id: "drop" }] } as unknown as CueMap;
  const fromProfile = danceRules(fast, { profile }, versions, "x");
  assert.equal(fromProfile.source, "profile");
  assert.deepEqual(fromProfile.rules.map((r) => [r.id, r.bpmRange]), [["dance-chorus-mid", [120, 240]]], "no fast cell yet: the nearest tempo band's, for the fast band's BPM");
  assert.equal(tempoBand(128), "fast");
});

test("check-moves: the same dance late by 100 ms drifts, the same dance keeps timing, another dance does not follow", () => {
  const dur = SCRIPT.firstDownbeatSec + 12 * BAR - SCRIPT.songAtCapture0;
  const ref = synthCapture(scriptedDance, dur);
  const window = [2.0, 12.0];
  const refCurve = motionCurve(ref, window[0], window[1]);
  // The generated dancer: another body, another camera, starting where the reference does.
  const gen = (shift: number, seed: number) => motionCurve(synthCapture((t) => ({ ...scriptedDance(t + window[0] - shift), depth: 4.2 }), window[1] - window[0], { seed, camera: { ...PHONE, width: 1080, height: 1920, focalPx: 1536 } }));
  const same = compareMotion(refCurve, gen(0, 3), 30);
  assert.equal(verdictOf(same), "keeps_timing", JSON.stringify(same));
  const late = compareMotion(refCurve, gen(0.1, 4), 30);
  assert.ok(Math.abs(late.lagMs - 100) <= 20, JSON.stringify(late));
  assert.equal(verdictOf(late), "drifts");
  const other = compareMotion(refCurve, gen(-7.3, 5), 30);
  assert.equal(verdictOf(other), "does_not_follow", JSON.stringify(other));
});

test("end to end: plan --skate --dance with a take, then a dancer clip locked to its song time", { skip: !hasFfmpeg && "ffmpeg not installed" }, () => {
  const root = mkdtempSync(join(tmpdir(), "dance8-translate-"));
  const lines: string[] = [];
  const c: Ctx = { library: join(root, "library"), now: () => "2026-10-19T00:00:00.000Z", log: (l) => lines.push(l) };
  try {
    // A 30 s synthetic song at 100 BPM: kick on every beat, a held chord.
    const inbox = join(root, "inbox", "Synthetic Song");
    mkdirSync(inbox, { recursive: true });
    const rate = 22050, dur = 30, n = rate * dur;
    const wav = (f: (t: number) => number) => {
      const data = Buffer.alloc(n * 2);
      for (let i = 0; i < n; i++) data.writeInt16LE(Math.max(-32767, Math.min(32767, Math.round(f(i / rate) * 32767))), i * 2);
      const h = Buffer.alloc(44);
      h.write("RIFF", 0, "ascii"); h.writeUInt32LE(36 + data.length, 4); h.write("WAVE", 8, "ascii"); h.write("fmt ", 12, "ascii"); h.writeUInt32LE(16, 16);
      h.writeUInt16LE(1, 20); h.writeUInt16LE(1, 22); h.writeUInt32LE(rate, 24); h.writeUInt32LE(rate * 2, 28); h.writeUInt16LE(2, 32); h.writeUInt16LE(16, 34);
      h.write("data", 36, "ascii"); h.writeUInt32LE(data.length, 40);
      return Buffer.concat([h, data]);
    };
    const kick = (t: number) => { const p = (t - 0.5 + 60) % 0.6; return p < 0.1 ? Math.sin(2 * Math.PI * 60 * p) * Math.exp(-p / 0.03) * 0.6 : 0; };
    writeFileSync(join(inbox, "1 Drum Kit.wav"), wav(kick));
    writeFileSync(join(inbox, "2 Piano.wav"), wav((t) => 0.1 * (Math.sin(2 * Math.PI * 261.6 * t) + Math.sin(2 * Math.PI * 329.6 * t) + Math.sin(2 * Math.PI * 392 * t))));
    addSong(c, { folder: inbox, title: "Synthetic Song" });
    const trackId = "synthetic-song";
    analyzeTrack(c, trackId);
    planTrack(c, trackId);
    const p = songPaths(c, trackId);
    const map = JSON.parse(readFileSync(p.cuemap, "utf8")) as CueMap;
    const scene = map.cues[0].sceneId;
    // A synthetic take: the scripted dancer, a test-pattern "video" of it, synced by hand.
    const capDur = 24;
    const cap = synthCapture(scriptedDance, capDur);
    const video = join(root, "my-take.mp4");
    assert.equal(spawnSync("ffmpeg", ["-v", "error", "-y", "-f", "lavfi", "-i", `testsrc2=s=720x1280:r=30:d=${capDur}`, "-pix_fmt", "yuv420p", video]).status, 0);
    const movesDir = join(p.dir, "moves");
    mkdirSync(movesDir, { recursive: true });
    writeFileSync(join(movesDir, "my-take.poses.json"), JSON.stringify({ ...cap, takeId: "my-take", video: { ...cap.video, file: "my-take.mp4", path: video } }));
    const track = buildMoveTrack({ ...cap, takeId: "my-take" }, manualSync((map.firstDownbeatSec ?? 0) - 0.3, "x"), map, "x");
    writeFileSync(join(movesDir, "my-take.moves.json"), JSON.stringify(track));

    planTrack(c, trackId, { skate: scene, dance: [scene] });
    const briefs = JSON.parse(readFileSync(p.briefs, "utf8")) as ShotBrief[];
    const dance = briefs.filter((b) => b.kind === "dance");
    assert.ok(dance.length >= 1, lines.join("\n"));
    assert.ok(!briefs.some((b) => b.kind === "broll" && dance.some((d) => d.cueId === b.cueId)), "dance shots replace the generic b-roll of their cue");
    const d0 = dance[0];
    assert.equal(d0.motionRef!.refFile, `moves/refs/${d0.id}.mp4`);
    const probe = spawnSync("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", join(p.dir, d0.motionRef!.refFile!)], { encoding: "utf8" });
    assert.ok(Math.abs(Number(probe.stdout) - (d0.motionRef!.captureEndSec - Math.max(0, d0.motionRef!.captureStartSec))) < 0.15, `reference length ${probe.stdout}`);
    const tricks = JSON.parse(readFileSync(p.tricks, "utf8")) as { styledBy?: string[]; tricks: { version?: string }[] };
    assert.deepEqual(tricks.styledBy, ["my-take"]);
    assert.ok(tricks.tricks.every((t) => typeof t.version === "string"));
    assert.ok(existsSync(p.kirtledDance) && existsSync(p.rules));
    assert.equal((JSON.parse(readFileSync(p.rules, "utf8")) as { source: string }).source, "takes");

    // Kling's download, named after the dance shot.
    const downloads = join(root, "downloads");
    mkdirSync(downloads);
    assert.equal(spawnSync("ffmpeg", ["-v", "error", "-y", "-f", "lavfi", "-i", `testsrc2=s=720x1280:r=24:d=${Math.ceil(d0.generateSec)}`, "-pix_fmt", "yuv420p", join(downloads, `${d0.id}.mp4`)]).status, 0);
    ingestClips(c, trackId, downloads);
    let lib = JSON.parse(readFileSync(p.clips, "utf8")) as VisualClipLibrary;
    const clip = lib.clips.find((x) => x.id === d0.id)!;
    assert.deepEqual(clip.danceLock, { takeId: "my-take", songStartSec: d0.songStartSec, captureStartSec: d0.motionRef!.captureStartSec });
    assert.ok(!(JSON.parse(readFileSync(p.briefs, "utf8")) as ShotBrief[]).some((b) => b.id === d0.id), "the shot is done");
    setClipStatus(c, trackId, d0.id, "approved", 0.1);
    lib = JSON.parse(readFileSync(p.clips, "utf8")) as VisualClipLibrary;
    const cuts = planCuts(map, lib).cuts.filter((x) => x.clipId === d0.id && x.reason === "dance_lock");
    assert.ok(cuts.length >= 1);
    assert.ok(cuts.every((x) => Math.abs(x.startSec - (d0.songStartSec - (map.firstDownbeatSec ?? 0)) - x.clipInSec) < 1e-6), "played where it was danced");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
