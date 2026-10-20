/**
 * The owner's dance as Kirtled words (canon D8-17). Synthetic dancers and
 * synthetic songs only: no real person's video, body data or recording.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { vocab } from "../../lib/canon";
import type { CaptureSync, MoveWord } from "../../lib/dance8/contracts/moves";
import type { CueMap } from "../../lib/dance8/contracts/scene";
import { songGrid } from "../../lib/dance8/moves/grid";
import { manualSync, syncTake, SYNC_MAX_DRIFT_MS } from "../../lib/dance8/moves/sync";
import { buildMoveTrack, readoutLines, sectionReadout } from "../../lib/dance8/moves/track";
import { analyzeSong, readSyncFingerprint, syncFingerprint } from "../../lib/stuttr/analysis";
import { PHONE, SCRIPT, scriptedDance, STAND, synthCapture, type DancerState } from "./synthDancer";
import { heardByPhone, synthSong } from "./synthSong";

const BAR = (4 * 60) / SCRIPT.bpm;
const DUR = SCRIPT.firstDownbeatSec + SCRIPT.bars * BAR - SCRIPT.songAtCapture0;
const MAP = {
  trackId: "synthetic", tempo: [{ startBar: 0, bpm: SCRIPT.bpm, beatsPerBar: 4 }], firstDownbeatSec: SCRIPT.firstDownbeatSec,
  cues: [
    { id: "verse", section: "verse", startBar: 0, endBar: 6, sceneId: "stage", cameras: ["wide"], shotBars: 2 },
    { id: "hook", section: "chorus", startBar: 6, endBar: 12, sceneId: "stage", cameras: ["wide"], shotBars: 2 },
  ],
} as unknown as Pick<CueMap, "tempo" | "firstDownbeatSec" | "cues" | "trackId">;
const SYNC: CaptureSync = manualSync(SCRIPT.songAtCapture0, "2026-10-19T00:00:00Z");
const build = (cap = synthCapture(scriptedDance, DUR)) => buildMoveTrack(cap, SYNC, MAP, "2026-10-19T00:00:00Z");
const spot = (w: MoveWord) => [w.word, w.bar, Math.round(w.beatInBar * 2) / 2] as const;

/** The scripted dance's words: bar and beat in bar (0-based, to the nearest half beat). */
const EXPECTED: [string, number, number][] = [
  ["RA", 2, 1], ["KA", 4, 1.5], ["LA", 6, 0.5], ["LA", 7, 0], ["TI", 8, 2.5], ["DO", 9, 1], ["DO", 9, 3], ["FREEZE", 10, 0],
];
const near = (got: readonly [string, number, number], want: [string, number, number]) => {
  const g = got[1] * 4 + got[2], w = want[1] * 4 + want[2];
  return got[0] === want[0] && Math.abs(g - w) <= 0.5;
};

test("canon D8-17 and D8-18: the approved tables", () => {
  assert.deepEqual(vocab.KIRTLED_BODY_MOVES.map((m) => [m.body, m.word, m.move]), [
    ["stomp", "DO", "STOMP"], ["travel", "RA", "ROLL"], ["drop_or_rise", "LA", "FLIP"], ["turn", "KA", "SPIN"], ["jump", "TI", "JUMP"], ["freeze", "FREEZE", "FREEZE"],
  ]);
  assert.deepEqual(vocab.KIRTLED_SKATE_FROM_DANCE.map((r) => r.from), ["turn", "jump", "freeze", "energy", "travel"]);
});

test("the scripted dance reads as exactly its moves, each in its bar and on its beat", () => {
  const tr = build();
  const got = tr.words.map(spot);
  assert.equal(got.length, EXPECTED.length, JSON.stringify(got));
  for (const want of EXPECTED) assert.ok(got.some((g) => near(g, want)), `missing ${want} in ${JSON.stringify(got)}`);
  const size = (w: string) => tr.words.find((x) => x.word === w)!.size;
  assert.ok(size("KA") >= 345 && size("KA") <= 380, `spin ${size("KA")}`);
  assert.ok(Math.abs(size("TI") - 0.3) < 0.05, `jump ${size("TI")} m`);
  assert.ok(size("RA") > 2 && size("RA") < 2.6, `travel ${size("RA")} body-widths (0.9 m)`);
  assert.ok(size("FREEZE") >= 2.8 && size("FREEZE") <= 3.4, `freeze ${size("FREEZE")} beats`);
  assert.match(tr.words.find((w) => w.word === "LA")!.detail, /drop to low/);
  assert.match(tr.words.filter((w) => w.word === "LA")[1].detail, /rise to standing/);
  assert.ok(tr.words.filter((w) => w.word === "DO").every((w) => w.detail === "right foot"));
});

test("a groove alone is no word; the beats say what the body did", () => {
  const tr = build();
  assert.ok(!tr.words.some((w) => [0, 1, 3, 5, 11].includes(w.bar)), "grooving bars stay wordless");
  assert.equal(tr.coverage.knownBeats, tr.coverage.beats);
  assert.equal(tr.coverage.beats, SCRIPT.bars * 4);
  const at = (bar: number, k: number) => tr.beats.find((b) => b.bar === bar && b.beatInBar === k)!;
  for (const b of tr.beats.filter((x) => x.bar <= 1)) { assert.equal(b.level, "mid"); assert.equal(b.still, false); assert.equal(b.airborne, false); }
  assert.equal(at(6, 2).level, "low");
  assert.ok([0, 1, 2].every((k) => at(10, k).still), "the freeze is still");
  assert.equal(at(8, 2).airborne, true);
  assert.ok(Math.abs(tr.beats.filter((b) => b.bar === 4).reduce((a, b) => a + (b.turnDeg ?? 0), 0)) > 300, "the spin bar turns");
  assert.ok(at(2, 1).travel!.x > 0.3, "travelling screen right");
});

test("the same dance reads the same from farther away, through a different camera", () => {
  const far = synthCapture((t) => ({ ...scriptedDance(t), depth: scriptedDance(t).depth + 1.5 }), DUR, { camera: { ...PHONE, width: 1080, height: 1920, focalPx: 0.8 * 1920 } });
  assert.deepEqual(build(far).words.map((w) => [w.word, w.bar]), build().words.map((w) => [w.word, w.bar]));
});

test("a tracker swapping left and right with the back to the camera still reads one full spin", () => {
  const tr = build(synthCapture(scriptedDance, DUR, { swapWhenBack: true }));
  const spins = tr.words.filter((w) => w.word === "KA");
  assert.equal(spins.length, 1);
  assert.ok(spins[0].size >= 345, `${spins[0].size}`);
});

test("frames the camera lost are unknown, never guessed", () => {
  const fps = 30;
  const lostFrom = Math.round((SCRIPT.firstDownbeatSec + 5 * BAR - SCRIPT.songAtCapture0) * fps); // bar 5, a groove
  const tr = build(synthCapture(scriptedDance, DUR, { lost: (i) => i >= lostFrom && i < lostFrom + fps * 1.5 }));
  const bar5 = tr.beats.filter((b) => b.bar === 5);
  assert.ok(bar5.filter((b) => b.status === "unknown").length >= 2);
  for (const b of bar5.filter((x) => x.status === "unknown")) assert.equal(b.energy, null);
  assert.deepEqual(tr.words.map((w) => w.word), build().words.map((w) => w.word), "no word appears or vanishes around the gap");
});

test("shakier tracking (4 px, 3 cm) and other frame rates read the same moves", () => {
  const check = (o: Parameters<typeof synthCapture>[2], label: string) => {
    const got = build(synthCapture(scriptedDance, DUR, o)).words.map(spot);
    assert.equal(got.length, EXPECTED.length, `${label}: ${JSON.stringify(got)}`);
    for (const want of EXPECTED) assert.ok(got.some((g) => near(g, want)), `${label}: missing ${want} in ${JSON.stringify(got)}`);
  };
  for (const seed of [1, 2, 3]) check({ noisePx: 4, noiseM: 0.03, seed }, `seed ${seed}`);
  for (const fps of [24, 60]) check({ fps }, `${fps} fps`);
});

test("the same capture gives the same track", () => {
  assert.deepEqual(build(), build());
});

test("standing still for under a beat is no freeze; a beat or more is", () => {
  const beat = 60 / SCRIPT.bpm;
  const dance = (hold: number) => (t: number): DancerState => {
    const song = t + SCRIPT.songAtCapture0, pos = (song - SCRIPT.firstDownbeatSec) / beat;
    const still = pos >= 8 && pos < 8 + hold;
    return still ? { ...STAND } : { ...STAND, armSwing: 0.3 * Math.sin(Math.PI * pos), hipHeight: 0.96 - 0.03 * (1 - Math.cos(2 * Math.PI * pos)) / 2 };
  };
  const dur = SCRIPT.firstDownbeatSec + 4 * BAR - SCRIPT.songAtCapture0;
  const freezes = (hold: number) => buildMoveTrack(synthCapture(dance(hold), dur), SYNC, MAP, "x").words.filter((w) => w.word === "FREEZE");
  assert.equal(freezes(0.6).length, 0);
  assert.equal(freezes(1.6).length, 1);
});

test("the readout names the sync, the moves and each section", () => {
  const tr = build();
  const lines = readoutLines(tr, MAP);
  assert.match(lines[0], /synced by hand: the video starts at song 0:00\.2/);
  assert.match(lines.join("\n"), /moves: 2 DO, 1 RA, 2 LA, 1 KA, 1 TI, 1 FREEZE/);
  const r = sectionReadout(tr, MAP);
  assert.deepEqual(r.map((s) => [s.cueId, s.words]), [["verse", { RA: 1, KA: 1 }], ["hook", { LA: 2, TI: 1, DO: 2, FREEZE: 1 }]]);
});

test("the grid places song seconds on bars and beats", () => {
  const g = songGrid(MAP, 12);
  assert.deepEqual(g.at(0.5), { bar: 0, beatInBar: 0, beatSec: 0.6 });
  assert.equal(g.at(0.4), null, "before bar 0");
  assert.equal(g.beats(0.5, 0.5 + BAR).length, 4);
  assert.deepEqual(g.nearest(0.5 + 0.6 * 5 + 0.05)!.beat.bar, 1);
});



test("the song's fingerprint is part of Stuttr's analysis, and round-trips", () => {
  const song = synthSong(30, 3);
  const a = analyzeSong({ trackId: "synthetic", durationSec: 30, sources: [], parts: { drums: song } });
  assert.ok(a.sync && a.sync.q8.length > 100);
  assert.deepEqual(a.sync, syncFingerprint(song));
  assert.equal(readSyncFingerprint(a.sync!).length, Math.floor(song.length / 512) + 1);
});

test("a take is synced to the song by ear, to within a few milliseconds", () => {
  const song = synthSong(70, 11);
  const fp = syncFingerprint(song);
  const r = syncTake(fp, heardByPhone(song, 12.3, 40, 5), 0, "x", { barSec: 2.4 });
  assert.ok(r.ok, r.why ?? "");
  assert.ok(Math.abs(r.sync.songAtCapture0 - 12.3) < 0.012, `${r.sync.songAtCapture0}`);
  assert.ok(r.sync.r! > 0.5 && r.sync.r! - r.sync.rNext! > 0.2, `${r.sync.r} vs ${r.sync.rNext}`);
  assert.ok(Math.abs(r.sync.driftMs!) <= SYNC_MAX_DRIFT_MS, `${r.sync.driftMs}`);
  // The video started 3 s before the song played, and the audio stream 0.05 s after the video.
  const early = syncTake(fp, heardByPhone(song, 0, 30, 6, 3), 0.05, "x", { barSec: 2.4 });
  assert.ok(early.ok, early.why ?? "");
  assert.ok(Math.abs(early.sync.songAtCapture0 - (-3 - 0.05)) < 0.012, `${early.sync.songAtCapture0}`);
});

test("a take of other music, or a song that only loops, is refused rather than guessed", () => {
  const fp = syncFingerprint(synthSong(70, 11));
  const other = syncTake(fp, heardByPhone(synthSong(70, 99), 10, 30, 5), 0, "x", { barSec: 2.4 });
  assert.equal(other.ok, false);
  assert.match(other.why!, /hard to hear|not clearly better/);
  const loop = synthSong(70, 21, 2);
  const looped = syncTake(syncFingerprint(loop), heardByPhone(loop, 20, 30, 5), 0, "x", { barSec: 2.4 });
  assert.equal(looped.ok, false, `${looped.sync.r} vs ${looped.sync.rNext}`);
  assert.match(looped.why!, /not clearly better/);
});
