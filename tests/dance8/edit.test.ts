/**
 * Edit lists: the Ocular Director's whole-song cut (lib/dance8/contracts/edit.ts,
 * lib/dance8/render/edit.ts, lib/dance8/render/house.ts, lib/dance8/editPipeline.ts).
 * Synthetic data only: made-up clips, takes, lyrics and tones.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { spawnSync } from "node:child_process";
import { FRAME_SIZE, type AspectRatio, type CueMap, type VisualClip, type VisualClipLibrary } from "../../lib/dance8/contracts/scene";
import type { EditList } from "../../lib/dance8/contracts/edit";
import {
  acrosticOf, editSlots, framePlan, gridSec, MAX_STRETCH, offGrid, openFrom, performerAlpha, resolveEdit, stillViewAt, tokenTimes, type EditMap,
} from "../../lib/dance8/render/edit";
import { cover, coverRegion, grade, img, placePerformer, studio, toRgb24 } from "../../lib/dance8/render/house";
import type { LyricTiming, Rect } from "../../lib/dance8/render/grid";
import { editRender, editScore, fontName } from "../../lib/dance8/editPipeline";
import { songPaths } from "../../lib/dance8/pipeline";
import { addSong, buildMaster, type Ctx } from "../../lib/stuttr/commands";

const hasFfmpeg = spawnSync("ffmpeg", ["-version"]).status === 0;

const clip = (id: string, durationSec: number, extra: Partial<VisualClip> = {}): VisualClip => ({
  id, schemaVersion: 1, sceneId: "street", camera: "wide", durationSec, aspect: "16:9", file: `${id}.mp4`,
  source: { type: "ai_generated", createdAt: "2026-11-21T00:00:00Z", license: "proprietary" },
  drift: { status: "known", driftScore: 0.1, method: "human_review" }, approvalStatus: "approved", ...extra,
});

/**
 * 120 BPM (a bar is 2 s, a beat 0.5 s), the first downbeat 0.5 s in, so bar n
 * starts at 0.5 + 2n. Three sung phrases: bars 2-4 (Verse 1), 6-8 (Hook) and
 * 10-12 (Verse 2, whose capital words spell SUN). A second cue starts at bar 14.
 */
function fixture() {
  const map: EditMap = {
    trackId: "song", tempo: [{ startBar: 0, bpm: 120, beatsPerBar: 4 }], firstDownbeatSec: 0.5, maxDriftScore: 0.3, vocals: [],
    cues: [
      { id: "a", section: "verse", startBar: 0, endBar: 14, sceneId: "street", cameras: ["wide"], shotBars: 2 },
      { id: "b", section: "outro", startBar: 14, endBar: 16, sceneId: "street", cameras: ["wide"], shotBars: 2 },
    ],
  };
  const library: VisualClipLibrary = { version: 1, clips: ["w1", "w2", "w3", "w4", "w5"].map((id) => clip(id, 10)).concat([clip("short", 3), clip("tw", 10)]) };
  const lyrics: LyricTiming = {
    status: "approved",
    lines: [
      { text: "a first line here", start: 4.5, end: 6.4, section: "Verse 1", words: [{ w: "a", start: 4.5, end: 4.7 }, { w: "first", start: 4.7, end: 5.2 }, { w: "line", start: 5.2, end: 5.8 }, { w: "here", start: 5.8, end: 6.4 }] },
      { text: "the second line", start: 6.5, end: 8.5, section: "Verse 1" },
      { text: "the hook goes round", start: 12.5, end: 16.5, section: "Hook" },
      { text: "Say UNDER NEW skies", start: 20.5, end: 22.4, section: "Verse 2", words: [{ w: "say", start: 20.5, end: 20.8 }, { w: "under", start: 20.8, end: 21.4 }, { w: "new", start: 21.4, end: 21.9 }, { w: "skies", start: 21.9, end: 22.4 }] },
      { text: "SO we go", start: 22.5, end: 24.5, section: "Verse 2", words: [{ w: "so", start: 22.5, end: 23 }, { w: "we", start: 23, end: 23.5 }, { w: "go", start: 23.5, end: 24.5 }] },
    ],
  };
  return { map, library, lyrics };
}

const B = (bar: number, beat = 0) => (beat ? { bar, beat } : { bar });
const start = (block: string) => ({ block, at: "start" as const });

/** A valid edit: the world, a split as the voice enters, the hook full frame, a dissolve, the second verse, the world again, a cue-start split. */
function edit(over: Partial<EditList> = {}): EditList {
  return {
    id: "proof", schemaVersion: 1, trackId: "song", aspect: "16:9", endSec: 32,
    sources: {
      s1: { clip: "w1", origin: 0, end: B(2) },
      s2: { clip: "w2", origin: B(2), end: B(6) },
      s3: { clip: "w3", origin: start("break"), end: B(12, 0.5) },
      s4: { clip: "w4", origin: B(12, 0.5), end: 32 },
    },
    takes: {
      sing: { file: "takes/sing.mp4", songAt0Sec: 0, role: "singer", standIn: true },
      dance: { file: "takes/dance.mp4", songAt0Sec: 0, role: "dancer", standIn: false },
    },
    views: { face: { box: [0, 0, 1, 1], shows: "face" }, upper: { box: [0, 0, 1, 0.6], shows: "body" } },
    blocks: [
      { id: "intro", land: 0, layout: "one", cells: { world: "full" } },
      { id: "verse", land: B(2), layout: "three", cells: { face: "big", world: "tr", body: "br" }, primary: "world", lyrics: "band", why: "the voice enters" },
      { id: "hook", land: B(6), layout: "one", cells: { face: "full" }, primary: "face", lyrics: "hook", why: "the hook" },
      { id: "break", land: B(8), layout: "one", cells: { world: "full" }, transition: "dissolve", why: "the voice leaves" },
      { id: "verse2", land: B(10), layout: "three", cells: { face: "big", world: "tr", body: "br" }, primary: "world", lyrics: "band", acrostic: "Verse 2", why: "the voice returns" },
      { id: "after", land: B(12, 0.5), layout: "one", cells: { world: "full" }, primary: "world", why: "the voice leaves" },
      { id: "outro", land: B(14), layout: "three", cells: { face: "big", world: "tr", body: "br" }, primary: "world", why: "the outro cue starts" },
    ],
    content: {
      world: [
        { kind: "story", source: "s1", from: 0, to: B(2) },
        { kind: "story", source: "s2", from: B(2), to: B(6) },
        { kind: "story", source: "s3", from: start("break"), to: B(12, 0.5) },
        { kind: "story", source: "s4", from: B(12, 0.5), to: 32 },
      ],
      face: [
        { kind: "take", take: "sing", view: "face", from: start("verse"), to: B(8) },
        { kind: "take", take: "sing", view: "face", from: start("verse2"), to: B(12, 0.5) },
        { kind: "kirtled", view: "studio", from: start("outro"), to: 32 },
      ],
      body: [
        { kind: "take", take: "dance", view: "upper", from: start("verse"), to: B(6) },
        { kind: "take", take: "dance", view: "upper", from: start("verse2"), to: B(12, 0.5) },
        { kind: "take", take: "dance", view: "upper", from: start("outro"), to: 32 },
      ],
    },
    ...over,
  };
}

const check = (e: EditList, o: { approved?: boolean; lyrics?: LyricTiming | null } = {}) => {
  const f = fixture();
  return resolveEdit(e, f.map, f.library, { fps: 24, approved: o.approved, lyrics: o.lyrics === undefined ? f.lyrics : o.lyrics });
};
const errorsOf = (r: ReturnType<typeof check>) => r.errors.map((x) => `${x.path}: ${x.message}`).join("\n");

test("a valid edit checks out: each clip placed once, layouts at musical edges, the singer's face over every sung line", () => {
  const r = check(edit());
  assert.ok(r.ok, errorsOf(r));
  assert.equal(r.totalFrames, 32 * 24);
  const m = r.metrics!;
  assert.equal(m.faceOnScreenPct, 100);
  assert.equal(m.layoutChanges, 5, "one-three, three-one, one-three, three-one, one-three (the dissolve keeps one)");
  assert.equal(m.layoutChangesAtMusicalEdges, 5);
  assert.equal(m.landings, 6);
  assert.equal(m.landingsOnGrid, 6);
  assert.equal(m.storyClipsUsed, 4);
  assert.equal(m.stillsUsed, 0);
  assert.deepEqual(r.blocks.map((b) => [b.id, b.start, b.land, b.transition]), [
    ["intro", 0, 0, null], ["verse", 4.25, 4.5, "geometry"], ["hook", 12.25, 12.5, "geometry"], ["break", 16, 16.5, "dissolve"],
    ["verse2", 20.25, 20.5, "geometry"], ["after", 24.5, 24.75, "geometry"], ["outro", 28.25, 28.5, "geometry"],
  ]);
  assert.deepEqual(r.accents, [4.5, 12.5, 16.5, 20.5, 24.75, 28.5]);
});

test("times: song seconds, bar and beat on the grid, or a block's landing and the start of the transition into it", () => {
  const { map } = fixture();
  assert.equal(gridSec(map, 2), 4.5);
  assert.equal(gridSec(map, 2, 1.5), 5.25);
  assert.equal(offGrid(map, 5.25), 0, "a half beat is on the eighth-note grid");
  assert.ok(Math.abs(offGrid(map, 5.3) - 0.05) < 1e-9);
  const r = check(edit());
  assert.equal(r.sources.s3.origin, 16, "{block: break, at: start} is where its dissolve begins");
});

test("one placement per clip: a clip listed twice is refused, and nothing shows outside its placement", () => {
  const twice = check(edit({ sources: { ...edit().sources, again: { clip: "w1", origin: 30, end: 31 } } }));
  assert.ok(!twice.ok);
  assert.match(errorsOf(twice), /sources\.again\.clip: w1 is already placed as "s1"; a clip has one placement/);
  const e = edit();
  e.content.world[1] = { kind: "story", source: "s2", from: B(2), to: 13 };
  assert.match(errorsOf(check(e)), /shows s2 at 4\.50-13\.00 s, outside its one placement \(4\.50-12\.50 s\)/);
  const similar = check(edit({ similar: [["w1", "w4"]] }));
  assert.match(errorsOf(similar), /w1 and w4 are too alike to appear in one edit/);
});

test("a short clip may be slowed at most 15%", () => {
  const slow = edit();
  slow.sources.s1 = { clip: "short", origin: 0, end: B(2) };
  const r = check(slow);
  assert.match(errorsOf(r), /short has 3\.00 s for a 4\.50 s window: it would play 50% slow \(at most 15%\)/);
  const bit = edit();
  bit.sources.s1 = { clip: "w1", origin: 0, end: B(2), inSec: 6 };
  const ok = check(bit);
  assert.ok(ok.ok, errorsOf(ok));
  assert.equal(ok.sources.s1.stretch, 1.125);
  assert.ok(ok.sources.s1.stretch <= MAX_STRETCH);
  assert.ok(ok.warnings.some((w) => /plays 12\.5% slow/.test(w.message)));
});

test("still plates: placed once, moved across their window, approved before a final", () => {
  const withStill = (src: Partial<EditList["sources"][string]>) => { const e = edit(); e.sources.s4 = { origin: B(12, 0.5), end: 32, ...src } as EditList["sources"][string]; return e; };
  const move = { from: { x: 0.3, y: 0.5, zoom: 1 }, to: { x: 0.7, y: 0.4, zoom: 1.2 } };
  const r = check(withStill({ still: "plates/harbour.png", move }));
  assert.ok(r.ok, errorsOf(r));
  assert.equal(r.sources.s4.still, "plates/harbour.png");
  assert.equal(r.sources.s4.stretch, 1, "a still is never slowed");
  assert.equal(r.metrics!.storyClipsUsed, 3);
  assert.equal(r.metrics!.stillsUsed, 1);
  const near = (a: { x: number; y: number; zoom: number }, b: { x: number; y: number; zoom: number }) => Math.abs(a.x - b.x) + Math.abs(a.y - b.y) + Math.abs(a.zoom - b.zoom) < 1e-9;
  assert.ok(near(stillViewAt(r.sources.s4, r.sources.s4.origin), move.from));
  assert.ok(near(stillViewAt(r.sources.s4, r.sources.s4.end), move.to));
  assert.ok(near(stillViewAt({ origin: 0, end: 10 }, 10), { x: 0.5, y: 0.5, zoom: 1.06 }), "the default move is a slow push to the centre");
  assert.ok(r.warnings.some((w) => /the still plates\/harbour\.png is not approved/.test(w.message)));
  assert.match(errorsOf(check(withStill({ still: "plates/harbour.png" }), { approved: true })), /the still plates\/harbour\.png is not approved; a final uses approved stills only/);
  const twice = edit();
  twice.sources.s4 = { still: "plates/harbour.png", origin: B(12, 0.5), end: 32 };
  twice.sources.again = { still: "plates/harbour.png", origin: 31, end: 32 };
  assert.match(errorsOf(check(twice)), /plates\/harbour\.png is already placed as "s4"; a still has one placement/);
  assert.match(errorsOf(check(withStill({ still: "plates/harbour.png", move: { from: { x: 0.5, y: 0.5, zoom: 0.5 }, to: move.to } }))), /move\.from: needs x and y from 0 to 1 and a zoom from 1 to 3/);
  assert.match(errorsOf(check(withStill({ still: "plates/harbour.png", inSec: 1 }))), /a still has no in-point/);
  assert.match(errorsOf(check(withStill({ still: "plates/harbour.gif" }))), /must be a PNG, JPEG or WebP image/);
  assert.match(errorsOf(check(withStill({ clip: "w4", still: "plates/harbour.png" }))), /names a clip or a still, not both and not neither/);
  assert.match(errorsOf(check(withStill({ still: "plates/harbour.png" }), {})), /^$/, "a draft takes an unapproved still");
  // The view's centre moves the region, kept inside the frame.
  assert.deepEqual(coverRegion(200, 100, [0, 0, 1, 1], 100, 100, 1, 0, 0.5), [0, 0, 100, 100]);
  assert.deepEqual(coverRegion(200, 100, [0, 0, 1, 1], 100, 100, 1, 1, 0.5), [100, 0, 100, 100]);
  assert.deepEqual(coverRegion(200, 100, [0, 0, 1, 1], 100, 100, 2, 0.5, 0), [75, 0, 50, 50]);
});

test("landings sit on the eighth-note grid, and a layout changes only at a musical edge or where a cue starts", () => {
  const off = edit();
  off.blocks[1] = { ...off.blocks[1], land: 4.6 };
  assert.match(errorsOf(check(off)), /blocks\[1\]\.land: 4\.600 s is 0\.100 s off the eighth-note grid/);
  // 7.5 s: inside the first phrase, two beats or more from its edges, and no cue starts there.
  const mid = edit();
  mid.blocks[1] = { ...mid.blocks[1], land: B(3, 2) };
  assert.match(errorsOf(check(mid)), /blocks\[1\]\.land: the layout changes \(one to three\) at 7\.500 s, not within a beat of the voice entering or leaving, nor where a cue starts/);
  // The outro's split at bar 14 has no voice near it, but its cue starts there.
  assert.ok(check(edit()).ok);
});

test("while the voice sings the singer's face is on screen at least 95% of the time", () => {
  const e = edit();
  e.blocks[2] = { ...e.blocks[2], cells: { world2: "full" }, primary: undefined };
  e.content.world2 = [{ kind: "story", source: "s5", from: start("hook"), to: B(8) }];
  e.sources.s5 = { clip: "w5", origin: start("hook"), end: B(8) };
  e.content.face = [e.content.face[1], e.content.face[2]];
  e.content.face.unshift({ kind: "take", take: "sing", view: "face", from: start("verse"), to: B(6) });
  const r = check(e);
  assert.match(errorsOf(r), /lipSync: the singer's face is on screen for 66\.\d% of the sung time; it needs 95%\. Missing at: 12\.50 s/);
  const none = check(edit(), { lyrics: null });
  assert.match(errorsOf(none), /lyrics: the edit sets lyrics, but the song has no lyric timing/);
});

test("a final refuses stand-in takes, drawn instrument stand-ins and draft lyrics; a draft only warns", () => {
  const e = edit();
  e.content.face[2] = { kind: "kirtled", view: "overhead", from: start("outro"), to: 32 };
  const draft = check(e);
  assert.ok(draft.ok, errorsOf(draft));
  assert.ok(draft.warnings.some((w) => /"sing" is a stand-in take/.test(w.message)));
  assert.ok(draft.warnings.some((w) => /Kirtled overhead view here is a drawn stand-in/.test(w.message)));
  const { lyrics } = fixture();
  const final = check(e, { approved: true, lyrics: { ...lyrics, status: "draft" } });
  const msg = errorsOf(final);
  assert.match(msg, /takes\.sing: "sing" is a stand-in take; a final shows the character's own performance/);
  assert.match(msg, /the Kirtled overhead view here is a drawn stand-in; a final shows the instrument itself/);
  assert.match(msg, /the lyric timing is a draft; a final shows approved lyrics only \(GOV-23\)/);
  assert.match(msg, /principals: the song has no principal list/);
});

test("structure: every slot filled, a reason for each change, gold triangles at most three a second, no empty cell on screen", () => {
  const e = edit();
  e.blocks[1] = { ...e.blocks[1], cells: { face: "big", world: "tr" } };
  assert.match(errorsOf(check(e)), /a "three" layout fills each of big, tr, br once/);
  const why = edit();
  why.blocks[2] = { ...why.blocks[2], why: " " };
  assert.match(errorsOf(check(why)), /blocks\[2\]\.why: say the musical reason/);
  const fast = edit();
  fast.blocks.splice(3, 0, { id: "flash", land: B(6, 0.5), layout: "one", cells: { face: "full" }, transition: "cut", why: "a stab" });
  assert.match(errorsOf(check(fast)), /lands too soon after the block before: the gold triangles would flash more than three times a second/);
  const gap = edit();
  gap.content.body = [gap.content.body[0]];
  assert.match(errorsOf(check(gap)), /content\.body: has nothing to show at 20\.250 s while it is on screen \(block "verse2"\)/);
});

test("the frame plan: the primary carries the picture, new cells open from the shared edge, cells that leave are covered", () => {
  const r = check(edit());
  const mid = framePlan(r, 4.375); // halfway through the split into the verse
  assert.equal(mid.kind, "geometry");
  const by = Object.fromEntries(mid.layers[0].cells.map((c) => [c.cell, c]));
  const full = r.slots.one.full!, tr = r.slots.three.tr!, big = r.slots.three.big!, br = r.slots.three.br!;
  assert.deepEqual(by.world.rect, { x: (full.x + tr.x) / 2, y: (full.y + tr.y) / 2, w: (full.w + tr.w) / 2, h: (full.h + tr.h) / 2 }, "the world moves to its cell");
  assert.equal(by.world.clip, null);
  // The face is left of the world's cell: it opens leftward from its right edge. The body is below: it opens downward.
  assert.ok(Math.abs(by.face.clip!.x + by.face.clip!.w - (big.x + big.w)) < 1e-9 && Math.abs(by.face.clip!.w - big.w / 2) < 1e-9);
  assert.ok(Math.abs(by.body.clip!.y - br.y) < 1e-9 && Math.abs(by.body.clip!.h - br.h / 2) < 1e-9);
  assert.equal(by.face.entry?.kind, "take");
  const diss = framePlan(r, 16.25);
  assert.equal(diss.kind, "dissolve");
  assert.equal(diss.layers.length, 2);
  assert.equal(diss.layers[1].alpha, 0.5);
  const leaving = framePlan(r, 12.375).layers[0].cells.find((c) => c.cell === "world")!;
  assert.equal(leaving.alpha, 0.5, "the world fades as the face covers it");
  assert.equal(framePlan(r, 10).kind, "steady");
});

test("openFrom: a corner cell opens from the corner nearest the primary", () => {
  const P: Rect = { x: 0, y: 0, w: 100, h: 100 };
  assert.deepEqual(openFrom({ x: 110, y: 110, w: 100, h: 50 }, P, 0.5), { x: 110, y: 110, w: 50, h: 25 });
  assert.deepEqual(openFrom({ x: 110, y: 0, w: 100, h: 100 }, P, 0.25), { x: 110, y: 0, w: 25, h: 100 });
});

test("lyrics: stutters take the time of the word they stutter, capitals spell the acrostic, fades follow the take", () => {
  const t = tokenTimes({ text: "B-B-Boats lost", start: 1, end: 2, words: [{ w: "boats", start: 1, end: 1.5 }, { w: "lost", start: 1.5, end: 2 }] });
  assert.deepEqual(t, { tokens: ["B-B-Boats", "lost"], times: [1, 1.5] });
  assert.deepEqual(tokenTimes({ text: "no words", start: 1, end: 2 }).times, [null, null]);
  assert.deepEqual(acrosticOf(fixture().lyrics, "Verse 2").map((x) => x.letter).join(""), "UNS");
  const r = check(edit());
  const e = { ...r.content.face[0], fadeInSec: 0.25, fadeOutSec: 0 };
  assert.equal(performerAlpha(e, e.t0), 0);
  assert.equal(performerAlpha(e, e.t0 + 0.125), 0.5);
  assert.equal(performerAlpha(e, e.t0 + 1), 1);
});

test("slots: every cell inside the frame and apart; the primary is square in landscape and portrait", () => {
  const inside = (r: Rect, w: number, h: number) => r.x >= 0 && r.y >= 0 && r.x + r.w <= w + 1e-9 && r.y + r.h <= h + 1e-9;
  const apart = (a: Rect, b: Rect) => !(a.x < b.x + b.w - 1e-9 && b.x < a.x + a.w - 1e-9 && a.y < b.y + b.h - 1e-9 && b.y < a.y + a.h - 1e-9);
  for (const aspect of Object.keys(FRAME_SIZE) as AspectRatio[]) {
    const [w, h] = FRAME_SIZE[aspect];
    const s = editSlots(w, h);
    for (const layout of ["three", "nine"] as const) {
      const rs = Object.values(s[layout]) as Rect[];
      rs.forEach((r, i) => { assert.ok(inside(r, w, h), `${aspect} ${layout} ${i}`); rs.slice(i + 1).forEach((q) => assert.ok(apart(r, q), `${aspect} ${layout} overlap`)); });
    }
    if (aspect === "16:9" || aspect === "9:16") assert.equal(s.three.big!.w, s.three.big!.h, `${aspect}: square primary`);
  }
  assert.deepEqual(editSlots(1280, 720).three.big, { x: 12, y: 12, w: 696, h: 696 }, "the approved EDO v2 frame");
});

test("the house look: a teal studio, the performer warmed into it, the matte decides, the same bytes every time", () => {
  const s = studio(64, 36, 0);
  const c = (32 + 15 * 64) * 3;
  assert.ok(s.d[c + 1] > s.d[c] && s.d[c + 2] > s.d[c], "teal ground");
  // A packed take, 8 x 8 each half: a grey picture; the matte white on the left four columns, black on the right.
  const pack = new Uint8Array(16 * 8 * 3);
  for (let y = 0; y < 8; y++) for (let x = 0; x < 16; x++) {
    const o = (y * 16 + x) * 3, v = x < 8 ? 200 : x < 12 ? 255 : 0;
    pack[o] = pack[o + 1] = pack[o + 2] = v;
  }
  const bg = img(8, 8);
  const out = placePerformer(bg, pack, 8, 8, [0, 0, 1, 1], "cover", 1);
  const at = (x: number, y: number) => out.d[(y * 8 + x) * 3];
  assert.ok(at(1, 4) > 0.5, "matte white: the performer");
  assert.ok(at(7, 4) < 0.2, "matte black: the backdrop shows (plus a little gold rim)");
  const frame = () => { const f = cover(new Uint8Array(32 * 18 * 3).fill(128), 32, 18, [0, 0, 1, 1], 32, 18); grade(f, 3); return Buffer.from(toRgb24(f)).toString("hex"); };
  assert.equal(frame(), frame(), "fixed grain seed");
});

test("fontName reads the family and style from a font file", { skip: !existsSync("/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf") && "no DejaVu font here" }, () => {
  assert.equal(fontName("/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf"), "DejaVu Sans, Bold");
});

function wavOf(sec: number, f: (t: number) => number, rate = 22050): Buffer {
  const n = Math.round(sec * rate), data = Buffer.alloc(n * 4);
  for (let i = 0; i < n; i++) { const v = Math.max(-1, Math.min(1, f(i / rate))) * 32767; data.writeInt16LE(v | 0, i * 4); data.writeInt16LE(v | 0, i * 4 + 2); }
  const h = Buffer.alloc(44);
  h.write("RIFF", 0, "ascii"); h.writeUInt32LE(36 + data.length, 4); h.write("WAVE", 8, "ascii"); h.write("fmt ", 12, "ascii");
  h.writeUInt32LE(16, 16); h.writeUInt16LE(1, 20); h.writeUInt16LE(2, 22);
  h.writeUInt32LE(rate, 24); h.writeUInt32LE(rate * 4, 28); h.writeUInt16LE(4, 32); h.writeUInt16LE(16, 34);
  h.write("data", 36, "ascii"); h.writeUInt32LE(data.length, 40);
  return Buffer.concat([h, data]);
}

test("end to end: an edit renders frame-exact over the voice master, with a manifest", { skip: !hasFfmpeg && "ffmpeg not installed" }, async () => {
  const root = mkdtempSync(join(tmpdir(), "dance8-edit-"));
  const lines: string[] = [];
  const c: Ctx = { library: join(root, "library"), now: () => "2026-11-21T00:00:00.000Z", log: (l) => lines.push(l) };
  try {
    const inbox = join(root, "inbox", "Edit Song");
    mkdirSync(inbox, { recursive: true });
    const dur = 33;
    writeFileSync(join(inbox, "0 Lead Vocal.wav"), wavOf(dur, (t) => 0.2 * Math.sin(2 * Math.PI * 440 * t)));
    writeFileSync(join(inbox, "1 Drum Kit.wav"), wavOf(dur, (t) => ((t % 0.5) < 0.05 ? 0.4 * Math.sin(2 * Math.PI * 60 * t) : 0)));
    writeFileSync(join(inbox, "Edit Song.wav"), wavOf(dur, (t) => 0.2 * Math.sin(2 * Math.PI * 330 * t)));
    addSong(c, { folder: inbox });
    buildMaster(c, { trackId: "edit-song", suno: true });
    const p = songPaths(c, "edit-song");
    for (const d of [p.clipDir, join(p.dir, "takes"), join(p.dir, "edits")]) mkdirSync(d, { recursive: true });
    const f = fixture();
    const map: CueMap = {
      id: "edit-song-cues", schemaVersion: 1, version: 1, trackId: "edit-song", analysisProfileId: "synthetic", aspect: "16:9",
      tempo: f.map.tempo, firstDownbeatSec: 0.5, cues: f.map.cues as CueMap["cues"], fallbackClipId: "w1", maxDriftScore: 0.3, approvalStatus: "draft",
    };
    writeFileSync(p.cuemap, JSON.stringify(map));
    writeFileSync(p.clips, JSON.stringify(f.library));
    writeFileSync(join(p.dir, "edit-song.lyrics.json"), JSON.stringify(f.lyrics));
    const colours = ["red", "green", "blue", "yellow", "cyan"];
    colours.forEach((col, i) => assert.equal(spawnSync("ffmpeg", ["-v", "error", "-y", "-f", "lavfi", "-i", `color=c=${col}:s=320x180:r=24:d=10`, "-c:v", "libx264", "-pix_fmt", "yuv420p", join(p.clipDir, `w${i + 1}.mp4`)]).status, 0));
    // Packed takes: a picture on the left, a white matte on the right.
    for (const [name, col] of [["sing", "orange"], ["dance", "purple"]]) {
      assert.equal(spawnSync("ffmpeg", ["-v", "error", "-y", "-f", "lavfi", "-i", `color=c=${col}:s=160x160:r=24:d=33`, "-f", "lavfi", "-i", "color=c=white:s=160x160:r=24:d=33",
        "-filter_complex", "[0][1]hstack=2", "-c:v", "libx264", "-pix_fmt", "yuv420p", join(p.dir, "takes", `${name}.mp4`)]).status, 0);
    }
    mkdirSync(join(p.dir, "plates"), { recursive: true });
    assert.equal(spawnSync("ffmpeg", ["-v", "error", "-y", "-f", "lavfi", "-i", "testsrc2=s=320x180", "-frames:v", "1", join(p.dir, "plates", "harbour.png")]).status, 0);
    const proof = { ...edit(), trackId: "edit-song" };
    proof.sources.s4 = { still: "plates/harbour.png", origin: B(12, 0.5), end: 32, move: { from: { x: 0.4, y: 0.5, zoom: 1 }, to: { x: 0.6, y: 0.5, zoom: 1.1 } } };
    const file = join(p.dir, "edits", "proof.json");
    writeFileSync(file, JSON.stringify(proof));
    const checked = await editRender(c, "edit-song", file, { checkOnly: true });
    assert.equal(checked.out, null);
    assert.ok(lines.some((l) => /^checked: 5 layout changes, all at musical edges; the singer's face covers 100% of the sung time/.test(l)));
    const r = await editRender(c, "edit-song", file, { from: 4, to: 6, height: 144 });
    assert.ok(r.out && existsSync(r.out));
    const probe = spawnSync("ffprobe", ["-v", "error", "-count_packets", "-show_entries", "stream=codec_type,width,height,nb_read_packets", "-of", "json", r.out!], { encoding: "utf8" });
    const streams = (JSON.parse(probe.stdout) as { streams: { codec_type: string; width?: number; height?: number; nb_read_packets: string }[] }).streams;
    const v = streams.find((s) => s.codec_type === "video")!;
    assert.deepEqual([v.width, v.height, Number(v.nb_read_packets)], [256, 144, 48]);
    assert.ok(streams.some((s) => s.codec_type === "audio"));
    const man = JSON.parse(readFileSync(r.manifest!, "utf8"));
    assert.equal(man.schema, "dance8.edit-render.v1");
    assert.equal(man.metrics.faceOnScreenPct, 100);
    assert.equal(man.totalFrames, 48);
    assert.deepEqual(man.sources.map((s: { clip?: string; still?: string }) => s.clip ?? s.still), ["w1", "w2", "w3", "plates/harbour.png"]);
    const still = await editRender(c, "edit-song", file, { from: 29, to: 29.5, height: 144 });
    assert.ok(still.out && existsSync(still.out), "a still renders");

    // V5: the dancer's take read as body points (an invented body, its left foot lifting each second) draws
    // a trace cell and lights the Kirtled floor; the calm version renders; the score comes out beside the renders.
    const mp = join(c.library, "edit-song", "dance8", "moves");
    mkdirSync(mp, { recursive: true });
    const frames = Array.from({ length: 33 * 24 }, (_, k) => {
      const pts = Array.from({ length: 33 }, () => [0.5, 0.5, 0, 0.9]);
      const set = (i: number, x: number, y: number) => { pts[i] = [x, y, 0, 0.95]; };
      const lift = k % 24 < 8 ? 0.04 * Math.sin((Math.PI * (k % 24)) / 8) : 0;
      set(0, 0.5, 0.2); set(11, 0.55, 0.3); set(12, 0.45, 0.3); set(23, 0.54, 0.55); set(24, 0.46, 0.55); set(25, 0.54, 0.72); set(26, 0.46, 0.72);
      set(27, 0.54, 0.88 - lift); set(29, 0.53, 0.9 - lift); set(31, 0.56, 0.9 - lift); set(28, 0.46, 0.88); set(30, 0.45, 0.9); set(32, 0.47, 0.9);
      return { t: k / 24, image: pts.flat(), world: null };
    });
    writeFileSync(join(mp, "take1.poses.json"), JSON.stringify({ schemaVersion: 1, takeId: "take1", video: { file: "dance.mp4", sha256: "0".repeat(64), width: 160, height: 160, durationSec: 33, videoStartSec: 0, audioStartSec: 0 },
      fps: 24, model: { id: "synthetic", sha256: "0".repeat(64), library: "none", delegate: "CPU" }, capturedAt: "2026-11-21T00:00:00Z", frames }));
    writeFileSync(join(mp, "take1.moves.json"), JSON.stringify({ schemaVersion: 1, analyzer: "synthetic", trackId: "edit-song", takeId: "take1", source: "owner_take",
      sync: { method: "manual", songAtCapture0: 0, r: null, rNext: null, driftMs: null, overlapSec: null, status: "manual", checkedAt: "" },
      beats: [], words: [], coverage: { fromBar: 0, toBar: 16, beats: 0, knownBeats: 0 }, approvalStatus: "draft", createdAt: "" }));
    const v5: EditList = JSON.parse(JSON.stringify({ ...proof, id: "v5" }));
    v5.takes.dance.motion = "take1";
    v5.content.face[2] = { kind: "kirtled", view: "floor", take: "dance", from: start("outro"), to: 32 };
    v5.content.body[2] = { kind: "trace", take: "dance", view: "upper", from: start("outro"), to: 32 };
    const f5 = join(p.dir, "edits", "v5.json");
    writeFileSync(f5, JSON.stringify(v5));
    const r5 = await editRender(c, "edit-song", f5, { from: 29, to: 29.5, height: 144, calm: true });
    assert.ok(r5.out && /-calm-144p-29\.0-29\.5\.mp4$/.test(r5.out), r5.out ?? "");
    const m5 = JSON.parse(readFileSync(r5.manifest!, "utf8"));
    assert.equal(m5.calm, true);
    assert.ok(Number.isInteger(m5.flashesPerSecondMax));
    assert.equal(m5.takes.find((t: { id: string }) => t.id === "dance").moves.approvalStatus, "draft");
    assert.ok(m5.takes.find((t: { id: string }) => t.id === "dance").moves.footfalls >= 30, "a footfall each second");
    const sc = editScore(c, "edit-song", f5, { planFps: 2 });
    assert.ok(existsSync(sc.json) && existsSync(sc.csv));
    assert.deepEqual(sc.score.states.at(-1)!.cells.map((x) => x.role), ["kirtled", "story", "dance8 trace"]);
    assert.ok(sc.score.events.some((e) => e.kind === "footfall" && e.draws === "ring"));
    assert.ok(lines.some((l) => /no feature track at .*energy peaks left out/.test(l)));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
