/**
 * Ocular Director V5: the layout states (S1-S5, D1), sung-line landings, the
 * Dance8 trace and Kirtled floor (lib/dance8/moves/trace.ts) and the visual
 * score (lib/dance8/render/score.ts). Synthetic data only: a made-up song, an
 * invented dancer drawn as numbers, no owner media.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { EDIT_SLOTS, LAYOUT_STATE, type EditList, type EditLayout } from "../../lib/dance8/contracts/edit";
import type { PoseCapture } from "../../lib/dance8/contracts/moves";
import type { HarmonyTimeline } from "../../lib/dance8/contracts/harmony";
import type { VisualClip, VisualClipLibrary } from "../../lib/dance8/contracts/scene";
import { editSlots, resolveEdit, type EditMap } from "../../lib/dance8/render/edit";
import type { LyricTiming } from "../../lib/dance8/render/grid";
import { bodyAt, buildTrace, floorHits, footfalls, songSecOf } from "../../lib/dance8/moves/trace";
import { bodySeries } from "../../lib/dance8/moves/body";
import { buildScore, scoreCsv } from "../../lib/dance8/render/score";
import { viewMapper } from "../../lib/dance8/render/house";
import { splitWindows, takeWindows, type TakeSegment } from "../../lib/dance8/render/takeSegments";
import { promptFor } from "../../lib/dance8/klingTakesPipeline";

const clip = (id: string, durationSec: number): VisualClip => ({
  id, schemaVersion: 1, sceneId: "street", camera: "wide", durationSec, aspect: "16:9", file: `${id}.mp4`,
  source: { type: "ai_generated", createdAt: "2026-11-21T00:00:00Z", license: "proprietary" },
  drift: { status: "known", driftScore: 0.1, method: "human_review" }, approvalStatus: "approved",
});

/** 120 BPM, first downbeat 0.5 s (bar n at 0.5 + 2n). One aligned verse of three lines, bars 2-5. */
const map: EditMap = {
  trackId: "song", tempo: [{ startBar: 0, bpm: 120, beatsPerBar: 4 }], firstDownbeatSec: 0.5, maxDriftScore: 0.3, vocals: [],
  cues: [{ id: "a", section: "verse", startBar: 0, endBar: 8, sceneId: "street", cameras: ["wide"], shotBars: 2 }],
};
const library: VisualClipLibrary = { version: 1, clips: [clip("w1", 10), clip("w2", 10)] };
const lyrics = (timing: "aligned" | "estimated"): LyricTiming => ({
  status: "approved",
  lines: [
    { text: "one line", start: 4.5, end: 6.4, section: "Verse", timing },
    { text: "two line", start: 6.5, end: 8.4, section: "Verse", timing },
    { text: "three line", start: 8.5, end: 10.4, section: "Verse", timing },
  ],
});
const B = (bar: number, beat = 0) => (beat ? { bar, beat } : { bar });
const start = (block: string) => ({ block, at: "start" as const });
const land = (block: string) => ({ block, at: "land" as const });

/** S1 world, S2 as the voice enters, S3 on the second line (bar 3 = 6.5 s, inside the phrase), S1 face on the third. */
function edit(motion: boolean): EditList {
  return {
    id: "v5", schemaVersion: 1, trackId: "song", aspect: "16:9", endSec: 16,
    sources: { s1: { clip: "w1", origin: 0, end: land("verse") }, s2: { clip: "w2", origin: land("verse"), end: land("explain") } },
    takes: {
      sing: { file: "takes/sing.mp4", songAt0Sec: 0, role: "singer", standIn: true },
      dance: { file: "takes/dance.mp4", songAt0Sec: 0, role: "dancer", standIn: true, ...(motion ? { motion: "take1" } : {}) },
    },
    views: { face: { box: [0, 0, 1, 1], shows: "face" }, full: { box: [0, 0, 1, 1], shows: "body" } },
    blocks: [
      { id: "intro", land: 0, layout: "one", cells: { world: "full" } },
      { id: "verse", land: B(2), layout: "three", cells: { face: "big", world: "tr", body: "br" }, primary: "world", lyrics: "band", why: "the voice enters" },
      { id: "explain", land: B(3), layout: "quad", cells: { face: "q0", body: "q1", floor: "q2", trace: "q3" }, primary: "face", lyrics: "band", why: "the second line" },
      { id: "merge", land: B(4), layout: "one", cells: { face: "full" }, primary: "face", lyrics: "band", why: "the third line" },
      { id: "solo", land: B(5), layout: "inset", cells: { body: "full", trace: "pip" }, transition: "dissolve", why: "the voice leaves" },
    ],
    content: {
      world: [{ kind: "story", source: "s1", from: 0, to: land("verse") }, { kind: "story", source: "s2", from: land("verse"), to: land("explain") }],
      face: [{ kind: "take", take: "sing", view: "face", from: start("verse"), to: land("solo") }],
      body: [{ kind: "take", take: "dance", view: "full", from: start("verse"), to: land("merge") }, { kind: "take", take: "dance", view: "full", from: start("solo"), to: 16 }],
      floor: [{ kind: "kirtled", view: "floor", take: "dance", from: start("explain"), to: land("merge") }],
      trace: [{ kind: "trace", take: "dance", view: "full", from: start("explain"), to: land("merge") }, { kind: "trace", take: "dance", view: "full", from: start("solo"), to: 16 }],
    },
  };
}
const errorsOf = (r: ReturnType<typeof resolveEdit>) => r.errors.map((x) => `${x.path}: ${x.message}`).join("\n");

test("V5 layouts: every cell inside the frame, none overlapping, and the states named S1-S5 and D1", () => {
  for (const [w, h] of [[1280, 720], [1080, 1920], [1000, 1000]]) {
    const slots = editSlots(w, h);
    for (const layout of Object.keys(EDIT_SLOTS) as EditLayout[]) {
      const rects = EDIT_SLOTS[layout].map((s) => slots[layout][s]!);
      assert.equal(rects.length, EDIT_SLOTS[layout].length);
      for (const r of rects) assert.ok(r.x >= 0 && r.y >= 0 && r.x + r.w <= w + 1e-6 && r.y + r.h <= h + 1e-6, `${layout} at ${w}x${h}`);
      if (layout === "inset") continue; // the inset sits on top of the full frame by design
      for (let i = 0; i < rects.length; i++) for (let j = i + 1; j < rects.length; j++) {
        const a = rects[i], b = rects[j];
        const overlap = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x) > 0.5 && Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y) > 0.5;
        assert.ok(!overlap, `${layout} cells ${i} and ${j} overlap at ${w}x${h}`);
      }
    }
    const q = EDIT_SLOTS.quad.map((s) => slots.quad[s]!);
    assert.ok(q.every((r) => Math.abs(r.w - q[0].w) < 1e-6 && Math.abs(r.h - q[0].h) < 1e-6), "the 2 x 2 cells are equal");
    const e = slots.eight;
    assert.deepEqual(e.big, slots.three.big, "S4 keeps the singer's big cell of S2");
    assert.ok(EDIT_SLOTS.eight.slice(1).every((s) => e[s]!.w * e[s]!.h < (e.big!.w * e.big!.h) / 4), "the eight are small beside the singer");
  }
  assert.deepEqual(LAYOUT_STATE, { one: "S1", three: "S2", quad: "S3", eight: "S4", nine: "S5", inset: "D1" });
});

test("a split or merge may land on an aligned sung line's onset; an estimated line's onset is not a musical edge", () => {
  const ok = resolveEdit(edit(true), map, library, { fps: 24, lyrics: lyrics("aligned") });
  assert.ok(ok.ok, errorsOf(ok));
  assert.equal(ok.metrics!.layoutChangesAtMusicalEdges, ok.metrics!.layoutChanges);
  const est = resolveEdit(edit(true), map, library, { fps: 24, lyrics: lyrics("estimated") });
  assert.match(errorsOf(est), /blocks\[2\]\.land: the layout changes \(three to quad\) at 6\.500 s, not within a beat of the voice/);
});

test("the trace and the Kirtled floor need a take read as body points", () => {
  const r = resolveEdit(edit(false), map, library, { fps: 24, lyrics: lyrics("aligned") });
  assert.match(errorsOf(r), /content\.floor\[0\]\.take: take "dance" has no motion/);
  assert.match(errorsOf(r), /content\.trace\[0\]\.take: take "dance" has no motion/);
  const fin = resolveEdit(edit(true), map, library, { fps: 24, lyrics: lyrics("aligned"), approved: true });
  assert.match(errorsOf(fin), /content\.floor\[0\]: the Kirtled floor here is drawn, not the built stage/);
});

test("the singer's face is counted as the largest picture in S2 and S1, and as large as any in the 2 x 2", () => {
  const r = resolveEdit(edit(true), map, library, { fps: 24, lyrics: lyrics("aligned") });
  assert.ok(r.ok, errorsOf(r));
  assert.equal(r.metrics!.faceOnScreenPct, 100);
  assert.ok(r.metrics!.faceLargestPct >= 99, `face largest ${r.metrics!.faceLargestPct}%`);
  assert.ok(r.metrics!.faceQuarterFramePct < 100, "the 2 x 2 cell is under a quarter of the frame");
});

/** An invented dancer at 24 fps, 3 s, standing; the left foot lifts 0.16 torso lengths and lands on frame 31. */
function dancer(): PoseCapture {
  const frames = Array.from({ length: 72 }, (_, k) => {
    const pts = Array.from({ length: 33 }, () => [0.5, 0.5, 0, 0.9]);
    const set = (i: number, x: number, y: number) => { pts[i] = [x, y, 0, 0.95]; };
    set(0, 0.5, 0.2); set(11, 0.55, 0.3); set(12, 0.45, 0.3); set(23, 0.54, 0.55); set(24, 0.46, 0.55);
    set(25, 0.54, 0.72); set(26, 0.46, 0.72); set(13, 0.58, 0.42); set(14, 0.42, 0.42); set(15, 0.6, 0.5); set(16, 0.4, 0.5);
    const lift = k >= 20 && k < 31 ? 0.04 * Math.sin((Math.PI * (k - 19)) / 12) : 0;
    set(27, 0.54, 0.88 - lift); set(29, 0.53, 0.9 - lift); set(31, 0.56, 0.9 - lift);
    set(28, 0.46, 0.88); set(30, 0.45, 0.9); set(32, 0.47, 0.9);
    return { t: k / 24, image: pts.flat(), world: null };
  });
  return {
    schemaVersion: 1, takeId: "take1",
    video: { file: "dancer.mp4", sha256: "0".repeat(64), width: 1000, height: 1000, durationSec: 3, videoStartSec: 0, audioStartSec: 0 },
    fps: 24, model: { id: "synthetic", sha256: "0".repeat(64), library: "none", delegate: "CPU" }, capturedAt: "2026-11-21T00:00:00Z", frames,
  };
}

test("footfalls: a foot coming back to its floor line after a lift, on the song clock", () => {
  const cap = dancer();
  const sync = { songAtCapture0: 10 };
  const falls = footfalls(bodySeries(cap), sync);
  assert.equal(falls.length, 1, JSON.stringify(falls));
  const f = falls[0];
  assert.equal(f.foot, "left");
  // Back on the floor within two frames of frame 31, and the time is capture seconds + 10.
  assert.ok(Math.abs(f.songSec - songSecOf(sync, 31 / 24)) <= 2 / 24 + 1e-9, `footfall at ${f.songSec}`);
  assert.ok(f.impact > 0);
  // The body at a song second is the capture's frame at that second minus the offset.
  const b = bodyAt(cap, sync, 10 + 25 / 24, 0)!;
  assert.ok(Math.abs(b[29].y - (0.9 - 0.04 * Math.sin((Math.PI * 6) / 12))) < 1e-9);
  assert.equal(bodyAt(cap, sync, 9), null, "before the take there is no body");
  assert.deepEqual(floorHits([...falls, { ...f, songSec: f.songSec + 1, foot: "right" }, { ...f, songSec: f.songSec + 2 }]).map((h) => h.triangle), ["B1", "C1", "B2"]);
  assert.equal(buildTrace(cap, sync).footfalls.length, 1);
});

test("a trace cell is framed exactly like the dancer's cell", () => {
  const m = viewMapper([0.1, 0.1, 0.9, 1], "stage", 540, 960, 640, 360);
  const [x0, y0] = m(0.1, 0.1), [x1, y1] = m(0.9, 1);
  assert.ok(Math.abs(y1 - 360) < 1e-6 && Math.abs(y0) < 1, "the view's box spans the cell's height, standing on its floor");
  assert.ok(Math.abs((x0 + x1) / 2 - 320) < 1, "centred");
});

test("the visual score: one clock, states named, the draft harmony held and converted from bar-0 seconds to song seconds", () => {
  const e = edit(true);
  const res = resolveEdit(e, map, library, { fps: 24, lyrics: lyrics("aligned") });
  assert.ok(res.ok, errorsOf(res));
  const harmony: HarmonyTimeline = { id: "h", schemaVersion: 1, trackId: "song", analysisProfileId: "x", approvalStatus: "draft",
    events: [{ id: "h1", startBar: 2, startBeat: 0, symbol: "Cm" }, { id: "h2", startBar: 3, startBeat: 2, symbol: "N.C." }] };
  const cap = dancer();
  const s = buildScore({
    edit: e, editSha256: "0".repeat(64), res, library, lyrics: lyrics("aligned"), gridVerified: { by: "a tester", at: "2026-11-21T00:00:00Z" },
    peaks: [{ songSec: 4.52, strength: 0.8, band: "low" }], harmony,
    motion: { dance: { track: { schemaVersion: 1, analyzer: "x", trackId: "song", takeId: "take1", source: "owner_take" as never, sync: { method: "manual", songAtCapture0: 10, r: null, rNext: null, driftMs: null, overlapSec: null, status: "manual", checkedAt: "" }, beats: [], words: [{ word: "RA", move: "ROLL", songSec: 7, bar: 3, beatInBar: 1, size: 0.6, detail: "hips travel" }], coverage: { fromBar: 0, toBar: 8, beats: 32, knownBeats: 32 }, approvalStatus: "draft", createdAt: "" }, footfalls: buildTrace(cap, { songAtCapture0: 3 }).footfalls, poseModel: "synthetic" } },
    planFps: 4,
  });
  assert.deepEqual(s.states.map((x) => x.state), ["S1", "S2", "S3", "S1", "D1"]);
  assert.deepEqual(s.states[2].cells.map((c) => c.role), ["singer face", "dancer", "kirtled", "dance8 trace"]);
  const chords = s.events.filter((x) => x.kind === "chord");
  assert.deepEqual(chords.map((x) => [x.songSec, x.draws, x.evidence]), [[4.5, "nothing", "draft"], [7.5, "nothing", "hold"]], "bar 2 is 0.5 + 4 s, not 4 s");
  const beats = s.events.filter((x) => x.kind === "beat" || x.kind === "downbeat");
  assert.equal(beats[0].songSec, 0.5);
  assert.ok(beats.every((x) => x.draws === "pulse" && x.evidence === "verified"));
  assert.equal(s.events.find((x) => x.kind === "energy_peak")!.draws, "light");
  assert.equal(s.events.find((x) => x.kind === "move_word")!.draws, "nothing", "a draft move word holds");
  assert.equal(s.events.filter((x) => x.kind === "footfall").length, 1);
  assert.equal(s.plan!.frames.length, 16 * 4);
  assert.deepEqual(s.summary.harmony, { status: "draft", events: 2, unresolved: 1, draws: "nothing (HOLD)" });
  const csv = scoreCsv(s).trim().split("\n");
  assert.equal(csv[0], "song_sec,bar,beat,row,layout_state,block,transition,cells,kind,evidence,draws,confidence,detail");
  assert.equal(csv.length, 1 + s.states.length + s.events.length);
  // A line whose edges were measured from the vocal stem is draft evidence, not an estimate.
  const measured: LyricTiming = { ...lyrics("aligned"), lines: lyrics("aligned").lines.map((l, i) => ({ ...l, timing: i === 0 ? "measured" : "estimated" })) };
  const sm = buildScore({ edit: e, editSha256: "", res, library, lyrics: measured });
  assert.deepEqual(sm.events.filter((x) => x.kind === "vocal_line").map((x) => x.evidence), ["draft", "estimated", "estimated"]);
  assert.match(sm.events.find((x) => x.kind === "vocal_line")!.detail, /edges measured from the vocal stem/);
  // Without a verified grid the beats draw nothing.
  const s2 = buildScore({ edit: e, editSha256: "", res, library, lyrics: null });
  assert.ok(s2.events.filter((x) => x.kind === "beat").every((x) => x.draws === "nothing" && x.evidence === "hold"));
});

test("take windows: where a take is on screen, its own cells and the trace and floor drawn from its body, with handles, short gaps merged", () => {
  const e = edit(true);
  const res = resolveEdit(e, map, library, { fps: 24, lyrics: lyrics("aligned") });
  assert.ok(res.ok, errorsOf(res));
  // The face runs from the start of the transition into the verse (4.25 s) to the solo's landing (10.5 s): half a second of handle each side.
  assert.deepEqual(takeWindows(res, e, "sing"), [{ from: 3.75, to: 11 }]);
  // The dancer leaves at the merge (8.5 s) and returns before the solo: a gap under 3 s, so one span, clamped at the end.
  const dance = takeWindows(res, e, "dance");
  assert.equal(dance.length, 1);
  assert.deepEqual([dance[0].from, dance[0].to], [3.75, 16]);
  // Without handles and with a 1 s merge gap the two appearances stay apart: out at the merge, back as the dissolve into the solo starts.
  const apart = takeWindows(res, e, "dance", { handleSec: 0, mergeGapSec: 1 });
  assert.equal(apart.length, 2, JSON.stringify(apart));
  assert.equal(apart[0].to, 8.5);
  assert.deepEqual(takeWindows(res, e, "nobody"), []);
});

const covers = (segs: TakeSegment[], from: number, to: number) => {
  let reach = from;
  for (const s of segs) { assert.ok(s.songIn <= reach + 1e-9, `a hole before ${s.id}`); reach = Math.max(reach, s.songOut); }
  assert.ok(reach >= to - 1e-9, `ends at ${reach}, not ${to}`);
};

test("split windows: pieces of whole seconds, never over the limit nor under 3 s, neighbours sharing what they overlap", () => {
  const long = splitWindows([{ from: 0, to: 70 }], "dance", 1.5, 200, { maxSec: 30 });
  assert.deepEqual(long.map((s) => [s.id, s.songIn, s.songOut, s.lengthSec, s.overlapSec]), [
    ["dance-01", 0, 30, 30, 0], ["dance-02", 29.5, 59.5, 30, 0.5], ["dance-03", 59, 70, 11, 0.5],
  ]);
  assert.ok(long.every((s) => Number.isInteger(s.lengthSec) && s.lengthSec <= 30 && s.lengthSec >= 3));
  assert.deepEqual([long[1].takeIn, long[1].takeOut], [31, 61], "the take's own seconds: song + songAt0Sec, applied once");
  covers(long, 0, 70);

  // A cut snaps to the latest preferred time that fits (the end of a sung line), and the shared seconds follow the rounding.
  const snapped = splitWindows([{ from: 0, to: 40 }], "sing", 0, 200, { maxSec: 30, cuts: [12, 20.25, 31] });
  assert.equal(snapped[1].songIn, 20.25);
  assert.equal(snapped[0].songOut, 21);
  assert.equal(snapped[1].overlapSec, 0.75);
  covers(snapped, 0, 40);

  // The last piece is never shorter than 3 s; a short span grows to 3 s; at the song's end it grows backwards.
  const tail = splitWindows([{ from: 0, to: 31 }], "x", 0, 200, { maxSec: 30 });
  assert.ok(tail.at(-1)!.lengthSec >= 3 && tail.every((s) => s.lengthSec <= 30));
  covers(tail, 0, 31);
  assert.deepEqual(splitWindows([{ from: 5, to: 6 }], "x", 0, 200, { maxSec: 10 }).map((s) => [s.songIn, s.songOut]), [[5, 8]]);
  assert.deepEqual(splitWindows([{ from: 60, to: 61.5 }], "x", 0, 62, { maxSec: 10 }).map((s) => [s.songIn, s.songOut]), [[59, 62]]);

  // Two spans number on from each other, and the second span's first piece shares nothing.
  const two = splitWindows([{ from: 0, to: 8 }, { from: 20, to: 33 }], "y", 0, 200, { maxSec: 10 });
  assert.deepEqual(two.map((s) => s.id), ["y-01", "y-02", "y-03"]);
  assert.equal(two[1].overlapSec, 0);
  assert.ok(two[2].overlapSec > 0);
  covers(two.slice(1), 20, 33);

  // Image orientation: 10 s at most.
  assert.ok(splitWindows([{ from: 0, to: 70 }], "z", 0, 200, { maxSec: 10 }).every((s) => s.lengthSec <= 10));
  assert.throws(() => splitWindows([{ from: 0, to: 9 }], "z", 0, 200, { maxSec: 3 }), /at least minSec \+ overlapSec/);
});

test("the Motion Control prompt takes the character's look from its own folder and keeps the mouth clear", () => {
  const sing = promptFor("singer", "Stuttr", "round glasses, green coat");
  assert.match(sing, /^Stuttr \(round glasses, green coat\), exactly as in the character image/);
  assert.match(sing, /No headphones, no microphone, nothing in front of the mouth/);
  assert.doesNotMatch(promptFor("singer", "Mo", null), /\(/);
  assert.match(promptFor("dancer", "Stuttr", null), /foot contacts and held poses land on the same frames/);
});
