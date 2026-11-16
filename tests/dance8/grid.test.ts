/**
 * The Ocular Director grid (lib/dance8/render/grid.ts, lib/dance8/gridPipeline.ts).
 * Synthetic data only: made-up clips, a made-up cue map and tones for the song.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { spawnSync } from "node:child_process";
import { FRAME_SIZE, type AspectRatio, type CueMap, type VisualClip, type VisualClipLibrary } from "../../lib/dance8/contracts/scene";
import { gridBlockArgs, gridJoinArgs, gridMuxArgs, layoutRects, lyricsCellArgs, pulsePeriodSec, resolveGrid, type GridLayout, type GridPlan, type LyricTiming, type Rect } from "../../lib/dance8/render/grid";
import { createHash } from "node:crypto";
import { kirtledFrames, kirtledGeometry } from "../../lib/dance8/render/kirtledView";
import { gridRender } from "../../lib/dance8/gridPipeline";
import { songPaths } from "../../lib/dance8/pipeline";
import { addSong, buildMaster, type Ctx } from "../../lib/stuttr/commands";

const hasFfmpeg = spawnSync("ffmpeg", ["-version"]).status === 0;

const clip = (id: string, durationSec: number, extra: Partial<VisualClip> = {}): VisualClip => ({
  id, schemaVersion: 1, sceneId: "street", camera: "wide", durationSec, aspect: "16:9", file: `${id}.mp4`,
  source: { type: "ai_generated", createdAt: "2026-11-15T00:00:00Z", license: "proprietary" },
  drift: { status: "known", driftScore: 0.1, method: "human_review" }, approvalStatus: "approved", ...extra,
});

/** 120 BPM from bar 0 (a bar is 2 s), the first downbeat 0.5 s into the song; a sung line in bars 4-6. */
function fixture(tempo: CueMap["tempo"] = [{ startBar: 0, bpm: 120, beatsPerBar: 4 }]) {
  const map = {
    trackId: "song", tempo, firstDownbeatSec: 0.5, maxDriftScore: 0.3,
    vocals: [{ id: "v1", voice: "Stuttr", startBar: 4, endBar: 6 }],
    cues: [{ id: "all", section: "verse" as const, startBar: 0, endBar: 16, sceneId: "street", cameras: ["wide" as const], shotBars: 2 }],
  };
  const library: VisualClipLibrary = {
    version: 1,
    clips: [
      clip("a", 6), clip("b", 6), clip("c", 1), clip("d", 6, { approvalStatus: "draft" }),
      clip("m", 6, { mouthVisible: true }),
      clip("ls", 4, { mouthVisible: true, lipSync: { voice: "Stuttr", songStartSec: 8.5 } }),
      clip("tr", 4, { trick: { trick: "floor_carve", landingSec: 2 } }),
      ...Array.from({ length: 9 }, (_, i) => clip(`n${i}`, 6)),
    ],
  };
  return { map, library };
}

const plan = (blocks: GridPlan["blocks"], extra: Partial<GridPlan> = {}): GridPlan => ({ id: "t", schemaVersion: 1, trackId: "song", aspect: "16:9", blocks, ...extra });
const cells = (...ids: string[]) => ids.map((clipId) => ({ clipId }));
const nine = cells(...Array.from({ length: 9 }, (_, i) => `n${i}`));

function overlaps(a: Rect, b: Rect) {
  return a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
}

test("layouts: every cell inside the frame, none overlapping, even sizes; the primary slot is the largest", () => {
  for (const aspect of Object.keys(FRAME_SIZE) as AspectRatio[]) {
    const [w, h] = FRAME_SIZE[aspect];
    for (const layout of ["one", "three", "nine"] as GridLayout[]) {
      const rects = layoutRects(layout, w, h, 8);
      assert.equal(rects.length, { one: 1, three: 3, nine: 9 }[layout]);
      rects.forEach((r, i) => {
        assert.ok(r.x >= 0 && r.y >= 0 && r.x + r.w <= w && r.y + r.h <= h, `${aspect} ${layout} cell ${i} inside`);
        assert.ok(r.w % 2 === 0 && r.h % 2 === 0, `${aspect} ${layout} cell ${i} even`);
        rects.slice(i + 1).forEach((s) => assert.ok(!overlaps(r, s), `${aspect} ${layout} cells overlap`));
      });
      if (layout === "three") assert.ok(rects[0].w * rects[0].h > 2 * rects[1].w * rects[1].h, `${aspect}: the primary is the large cell`);
    }
  }
  assert.deepEqual(layoutRects("one", 1920, 1080, 8), [{ x: 0, y: 0, w: 1920, h: 1080 }]);
  const portrait = layoutRects("three", 1080, 1920, 8);
  assert.ok(portrait[1].y > portrait[0].y + portrait[0].h - 1, "portrait: the small cells sit below the primary");
});

test("the beat pulse stays at or under three a second", () => {
  assert.equal(pulsePeriodSec(93.995), 0.638332, "EDO at 94 BPM: every beat (1.57 a second)");
  assert.equal(pulsePeriodSec(120), 0.5);
  assert.equal(pulsePeriodSec(180), 0.333333, "exactly three a second is allowed");
  assert.equal(pulsePeriodSec(200), 0.6, "every second beat");
  assert.equal(pulsePeriodSec(400), 0.6, "every fourth beat");
});

test("resolve: times from the bar grid, the primary in the large cell, short clips hold, the pulse off in one-cell blocks", () => {
  const { map, library } = fixture();
  const r = resolveGrid(plan([
    { startBar: 0, endBar: 2, layout: "one", primary: 0, cells: cells("a") },
    { startBar: 2, endBar: 4, layout: "three", primary: 1, cells: cells("a", "b", "c") },
  ]), map, library, { fps: 24 });
  assert.deepEqual(r.errors, []);
  assert.equal(r.ok, true);
  assert.deepEqual(r.blocks.map((b) => [b.startSec, b.endSec, b.frames, b.pulseEverySec]), [[0, 4, 96, null], [4, 8, 96, 0.5]]);
  assert.equal(r.totalFrames, 192);
  assert.equal(r.audioOffsetSec, 0.5, "the first downbeat is 0.5 s into the song");
  const [, three] = r.blocks;
  const big = layoutRects("three", 1920, 1080, 9)[0];
  assert.deepEqual(three.cells.find((x) => x.primary)!.rect, big, "cell 1 is primary, so it takes the large slot");
  assert.deepEqual(three.cells.map((x) => x.clipId), ["a", "b", "c"]);
  const short = three.cells[2];
  assert.deepEqual([short.playFrames, short.holdFrames], [24, 72]);
  assert.ok(r.warnings.some((w) => w.message === "c runs out 3.00 s early and holds its last frame"));
});

test("resolve refuses broken plans and says where", () => {
  const { map, library } = fixture();
  const errs = (p: GridPlan, o: { approved?: boolean } = {}) => resolveGrid(p, map, library, { fps: 24, ...o }).errors.map((e) => `${e.path}: ${e.message}`);
  assert.deepEqual(errs(plan([{ startBar: 0, endBar: 2, layout: "three", primary: 0, cells: cells("a", "b") }])), ['blocks[0].cells: a "three" layout has 3 cells']);
  assert.deepEqual(errs(plan([{ startBar: 0, endBar: 2, layout: "nine", primary: 9, cells: nine }])), ["blocks[0].primary: must be a cell number from 0 to 8"]);
  assert.deepEqual(errs(plan([
    { startBar: 0, endBar: 2, layout: "one", primary: 0, cells: cells("a") },
    { startBar: 3, endBar: 4, layout: "one", primary: 0, cells: cells("b") },
  ])), ["blocks[1].startBar: must be 2, where the block before ends (blocks run on without gaps)"]);
  assert.deepEqual(errs(plan([
    { startBar: 0, endBar: 1, layout: "one", primary: 0, cells: cells("a") },
    { startBar: 1, endBar: 2, layout: "one", primary: 0, cells: cells("b") },
  ], { phraseBars: 2 })), [
    "blocks[0]: bar 1 is not on a 2-bar phrase line counted from bar 0; layouts change only on phrases",
    "blocks[1]: bar 1 is not on a 2-bar phrase line counted from bar 0; layouts change only on phrases",
  ]);
  assert.deepEqual(errs(plan([{ startBar: 14, endBar: 18, layout: "one", primary: 0, cells: cells("a") }])), ["blocks[0].endBar: is past the song's last bar (16)"]);
  assert.deepEqual(errs(plan([{ startBar: 0, endBar: 2, layout: "one", primary: 0, cells: cells("zz") }])), ['blocks[0].cells[0].clipId: no clip "zz" in the clip library']);
  assert.deepEqual(errs(plan([{ startBar: 0, endBar: 2, layout: "three", primary: 0, cells: cells("a", "a", "b") }])),
    ["blocks[0].cells: shows a in 2 cells at once; mark all but one as replay, memory or future"]);
  assert.deepEqual(errs(plan([{ startBar: 0, endBar: 2, layout: "three", primary: 0, cells: [{ clipId: "a" }, { clipId: "a", time: "replay", inSec: 2 }, { clipId: "b" }] }])), [],
    "the same clip twice is fine when one copy is marked as a replay");
  assert.deepEqual(errs(plan([{ startBar: 0, endBar: 2, layout: "one", primary: 0, cells: cells("tr") }])),
    ["blocks[0].cells[0]: tr is a skate-trick clip; tricks land on their chord change and are never free footage (D8-16)"]);
  assert.deepEqual(errs(plan([{ startBar: 0, endBar: 2, layout: "one", primary: 0, cells: [{ clipId: "a", inSec: 6 }] }])),
    ["blocks[0].cells[0].inSec: must be from 0 to under 6 s, the clip's length"]);
  assert.deepEqual(errs(plan([{ startBar: 0, endBar: 2, layout: "one", primary: 0, cells: cells("d") }]), { approved: true }),
    ["blocks[0].cells[0]: d is not approved; a final uses approved clips only"]);
  assert.deepEqual(errs(plan([{ startBar: 0, endBar: 2, layout: "one", primary: 0, cells: cells("d") }])), [], "a draft may use a draft clip");
  assert.deepEqual(errs(plan([{ startBar: 0, endBar: 2, layout: "one", primary: 0, cells: cells("a") }], { aspect: "3:2" as AspectRatio })), [
    "aspect: must be one of 9:16, 16:9, 4:5, 1:1, 21:9",
  ]);

  const tempoChange = fixture([{ startBar: 0, bpm: 120, beatsPerBar: 4 }, { startBar: 8, bpm: 90, beatsPerBar: 4 }]);
  assert.deepEqual(resolveGrid(plan([{ startBar: 6, endBar: 10, layout: "one", primary: 0, cells: cells("a") }]), tempoChange.map, tempoChange.library, { fps: 24 }).errors.map((e) => e.message),
    ["spans a tempo change; split it there"]);
});

test("resolve: mouths during a sung line need a lip-sync lock, and locked clips play where they line up with the song", () => {
  const { map, library } = fixture();
  const at = (startBar: number, endBar: number, id: string, inSec?: number) =>
    resolveGrid(plan([{ startBar, endBar, layout: "one", primary: 0, cells: [{ clipId: id, ...(inSec === undefined ? {} : { inSec }) }] }]), map, library, { fps: 24 });
  assert.deepEqual(at(4, 6, "m").errors.map((e) => e.message), ["m shows a singer's mouth during a sung line without a lip-sync lock"]);
  assert.deepEqual(at(0, 2, "m").errors, [], "outside the sung line the mouth may show");
  // ls starts at song 8.5 s, which is bar 4 (8 s after the first downbeat at 0.5 s).
  assert.equal(at(4, 6, "ls").blocks[0].cells[0].inSec, 0);
  assert.equal(at(5, 6, "ls").blocks[0].cells[0].inSec, 2);
  assert.deepEqual(at(5, 6, "ls", 0).errors.map((e) => e.message), ["ls is locked to the song; here it must start at 2 s (or leave inSec out)"]);
  assert.deepEqual(at(6, 7, "ls").errors.map((e) => e.message), ["ls is locked to song time and does not cover bars 6-7"]);
});

test("ffmpeg arguments: one input per cell, the primary bordered and pulsing, held frames padded", () => {
  const { map, library } = fixture();
  const r = resolveGrid(plan([
    { startBar: 0, endBar: 2, layout: "one", primary: 0, cells: cells("a") },
    { startBar: 2, endBar: 4, layout: "three", primary: 1, cells: cells("a", "b", "c") },
    { startBar: 4, endBar: 6, layout: "nine", primary: 4, cells: nine },
  ], { style: { primaryBorder: "#112233" } }), map, library, { fps: 24 });
  assert.equal(r.ok, true);
  const argsOf = (i: number) => gridBlockArgs(r.blocks[i], { width: r.width, height: r.height, fps: 24, style: { primaryBorder: "#112233" }, cellPath: (c) => `/clips/${c.clipId}.mp4`, outPath: `/out/${i}.mp4` });
  const one = argsOf(0);
  assert.equal(one.filter((x) => x === "-i").length, 1);
  assert.ok(!one[one.indexOf("-filter_complex") + 1].includes("drawbox"), "no border on a single view");
  assert.equal(one[one.indexOf("-frames:v") + 1], "96");
  const three = argsOf(1);
  const fg = three[three.indexOf("-filter_complex") + 1];
  assert.equal(three.filter((x) => x === "-i").length, 3);
  assert.match(fg, /tpad=stop_mode=clone:stop=72/, "the 1 s clip holds its last frame for the other 72");
  assert.match(fg, /drawbox=[^;]*color=0x112233:t=4/);
  assert.match(fg, /enable='gte\(t\\,0\.250000\)\*lt\(mod\(t-0\.250000\\,0\.500000\)\\,0\.120\)'/, "the pulse counts from the bar line, after the dissolve's pre-roll");
  assert.equal(three[three.indexOf("-frames:v") + 1], String(96 + 6), "a half-beat dissolve (6 frames at 120 BPM) into this block");
  assert.match(fg, /tpad=start_mode=clone:start=6/, "a clip with no earlier frames waits on its first frame through the pre-roll");
  assert.match(fg, /\[c0\]overlay=x=\d+:y=\d+/);
  assert.ok(fg.includes("eq=brightness=-0.060"), "context cells are a little darker");
  const nineArgs = argsOf(2);
  assert.equal(nineArgs.filter((x) => x === "-i").length, 9);

  const mux = gridMuxArgs({ picturePath: "/w/picture.mp4", audioPath: "/a.wav", audioOffsetSec: 0.5, totalFrames: 288, fps: 24, outPath: "/o.mp4" });
  assert.deepEqual(mux.slice(mux.indexOf("-ss"), mux.indexOf("-ss") + 2), ["-ss", "0.500000"]);
  assert.equal(mux[mux.indexOf("-frames:v") + 1], "288");
  assert.ok(mux.includes("copy"), "no caption: the picture is copied, not re-encoded");
  const fin = gridMuxArgs({ picturePath: "/w/picture.mp4", audioPath: "/a.wav", audioOffsetSec: 0, totalFrames: 288, fps: 24, outPath: "/o.mp4", caption: { text: "All characters are fictional and AI-generated.", fontFile: "/f.ttf", seconds: 4 } });
  assert.ok(!fin.includes("-ss"));
  assert.match(fin[fin.indexOf("-filter_complex") + 1], /drawtext=fontfile='\/f\.ttf':text='All characters are fictional and AI-generated\.'/);
});

/** Mono 16-bit 44.1 kHz WAV from a sample function. */
function wavOf(sec: number, f: (t: number) => number): Buffer {
  const rate = 44100;
  const n = Math.round(sec * rate);
  const data = Buffer.alloc(n * 2);
  for (let i = 0; i < n; i++) data.writeInt16LE(Math.max(-32767, Math.min(32767, Math.round(f(i / rate) * 32767))), i * 2);
  const h = Buffer.alloc(44);
  h.write("RIFF", 0, "ascii"); h.writeUInt32LE(36 + data.length, 4); h.write("WAVE", 8, "ascii");
  h.write("fmt ", 12, "ascii"); h.writeUInt32LE(16, 16); h.writeUInt16LE(1, 20); h.writeUInt16LE(1, 22);
  h.writeUInt32LE(rate, 24); h.writeUInt32LE(rate * 2, 28); h.writeUInt16LE(2, 32); h.writeUInt16LE(16, 34);
  h.write("data", 36, "ascii"); h.writeUInt32LE(data.length, 40);
  return Buffer.concat([h, data]);
}

test("end to end: a grid renders over the voice master, frame-exact, with a manifest", { skip: !hasFfmpeg && "ffmpeg not installed" }, async () => {
  const root = mkdtempSync(join(tmpdir(), "dance8-grid-"));
  const lines: string[] = [];
  const c: Ctx = { library: join(root, "library"), now: () => "2026-11-15T00:00:00.000Z", log: (l) => lines.push(l) };
  try {
    const inbox = join(root, "inbox", "Grid Song");
    mkdirSync(inbox, { recursive: true });
    const dur = 8;
    writeFileSync(join(inbox, "0 Lead Vocal.wav"), wavOf(dur, (t) => 0.2 * Math.sin(2 * Math.PI * 440 * t)));
    writeFileSync(join(inbox, "1 Drum Kit.wav"), wavOf(dur, (t) => ((t % 0.5) < 0.05 ? 0.4 * Math.sin(2 * Math.PI * 60 * t) : 0)));
    writeFileSync(join(inbox, "Grid Song.wav"), wavOf(dur, (t) => 0.2 * Math.sin(2 * Math.PI * 330 * t)));
    addSong(c, { folder: inbox });
    const p = songPaths(c, "grid-song");
    mkdirSync(p.clipDir, { recursive: true });
    const map: CueMap = {
      id: "grid-song-cues", schemaVersion: 1, version: 1, trackId: "grid-song", analysisProfileId: "synthetic", aspect: "16:9",
      tempo: [{ startBar: 0, bpm: 120, beatsPerBar: 4 }], firstDownbeatSec: 0.25,
      cues: [{ id: "all", section: "verse", startBar: 0, endBar: 3, sceneId: "street", cameras: ["wide"], shotBars: 1 }],
      fallbackClipId: "g0", maxDriftScore: 0.3, approvalStatus: "draft",
    };
    writeFileSync(p.cuemap, JSON.stringify(map));
    const colours = ["red", "green", "blue", "yellow", "cyan", "magenta", "white", "gray", "orange"];
    const library: VisualClipLibrary = { version: 1, clips: colours.map((_, i) => clip(`g${i}`, 3, { file: `g${i}.mp4` })) };
    writeFileSync(p.clips, JSON.stringify(library));
    colours.forEach((col, i) => assert.equal(spawnSync("ffmpeg", ["-v", "error", "-y", "-f", "lavfi", "-i", `color=c=${col}:s=320x180:r=24:d=3`, "-c:v", "libx264", "-pix_fmt", "yuv420p", join(p.clipDir, `g${i}.mp4`)]).status, 0));

    const lyrics: LyricTiming = { status: "draft", lines: [{ text: "first line", start: 2.3, end: 3.4 }, { text: "second line", start: 3.6, end: 4.2 }] };
    writeFileSync(join(p.dir, "grid-song.lyrics.json"), JSON.stringify(lyrics));
    const planFile = join(root, "proof.json");
    writeFileSync(planFile, JSON.stringify(plan([
      { startBar: 0, endBar: 1, layout: "one", primary: 0, cells: cells("g0") },
      { startBar: 1, endBar: 2, layout: "three", primary: 0, cells: [{ clipId: "g1" }, { view: "lyrics" }, { view: "kirtled" }] },
      { startBar: 2, endBar: 3, layout: "nine", primary: 4, cells: cells(...colours.map((_, i) => `g${i}`)) },
    ], { id: "proof", trackId: "grid-song" })));

    await assert.rejects(() => gridRender(c, "grid-song", planFile), /no voice master yet/);
    buildMaster(c, { trackId: "grid-song", suno: true });
    const bad = join(root, "bad.json");
    writeFileSync(bad, JSON.stringify(plan([{ startBar: 0, endBar: 1, layout: "three", primary: 0, cells: cells("g1") }], { id: "bad", trackId: "grid-song" })));
    await assert.rejects(() => gridRender(c, "grid-song", bad), /the grid plan does not check out:\n {2}blocks\[0\]\.cells: a "three" layout has 3 cells/);

    const r = await gridRender(c, "grid-song", planFile);
    assert.equal(r.out, join(p.dir, "renders", "grid-song-grid-proof-draft.mp4"));
    assert.equal(r.fps, 24, "the clips' own rate");
    assert.equal(r.totalFrames, 144, "three bars of 2 s at 24 fps");
    const probe = spawnSync("ffprobe", ["-v", "error", "-count_packets", "-show_entries", "stream=codec_type,width,height,nb_read_packets", "-of", "json", r.out], { encoding: "utf8" });
    const streams = (JSON.parse(probe.stdout) as { streams: { codec_type: string; width?: number; height?: number; nb_read_packets?: string }[] }).streams;
    const v = streams.find((s) => s.codec_type === "video")!;
    assert.deepEqual([v.width, v.height, Number(v.nb_read_packets)], [1920, 1080, 144]);
    assert.ok(streams.some((s) => s.codec_type === "audio"), "the voice master plays under the grid");
    const m = JSON.parse(readFileSync(r.manifest, "utf8")) as { audio: { master: string; offsetSec: number }; checks: { pass: boolean }[]; blocks: { layout: string; frames: number }[] };
    assert.deepEqual([m.audio.master, m.audio.offsetSec], ["suno", 0.25]);
    assert.ok(m.checks.every((x) => x.pass));
    assert.deepEqual(m.blocks.map((b) => [b.layout, b.frames]), [["one", 48], ["three", 48], ["nine", 48]]);
    assert.ok(lines.includes("warning: draft audio: the Suno vocals master isn't approved yet"));
    assert.ok(!existsSync(join(p.dir, "renders", ".grid-song-grid-proof-draft.blocks")), "the block files are cleaned up");

    // A frame from the nine-cell block: cells run row by row, so the centre is cell 4 (cyan) and the top left cell 0 (red).
    const png = join(root, "f.png");
    assert.equal(spawnSync("ffmpeg", ["-v", "error", "-y", "-ss", "4.5", "-i", r.out, "-frames:v", "1", "-vf", "scale=192:108", "-f", "rawvideo", "-pix_fmt", "rgb24", png]).status, 0);
    const px = readFileSync(png);
    const at = (x: number, y: number) => [...px.subarray((y * 192 + x) * 3, (y * 192 + x) * 3 + 3)];
    const centre = at(96, 54);
    assert.ok(centre[0] < 60 && centre[1] > 150 && centre[2] > 150, `the centre cell shows the cyan clip, got ${centre}`);
    const corner = at(30, 18);
    assert.ok(corner[0] > 150 && corner[1] < 60 && corner[2] < 60, `the top-left cell shows the red clip, got ${corner}`);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("the Kirtled view: three equal arms of eight triangles; the pulse travels out over the bar; the same bytes every time", () => {
  const g = kirtledGeometry(640, 360);
  assert.equal(g.arms.length, 3);
  for (const arm of g.arms) assert.equal(arm.length, 8);
  assert.deepEqual(g.angles, [90, 210, 330], "120 degrees apart, the stem down");
  const pts = [...g.hub, ...g.arms.flat(2)];
  for (const [x, y] of pts) assert.ok(x >= 0 && x <= 640 && y >= 0 && y <= 360, `point ${x},${y} inside`);
  // Arm A's first triangle touches the hub's lower side; its last is the farthest out.
  const dist = (t: readonly (readonly [number, number])[]) => Math.hypot(t.reduce((a, p) => a + p[0], 0) / 3 - 320, t.reduce((a, p) => a + p[1], 0) / 3 - g.hub.reduce((a, p) => a + p[1], 0) / 3);
  assert.ok(dist(g.arms[0][7]) > dist(g.arms[0][0]) * 4);
  const run = () => [...kirtledFrames({ width: 320, height: 180, fps: 24, startSec: 0, frames: 48, bpm: 120, beatsPerBar: 4 })];
  const a = run();
  assert.equal(a.length, 48);
  assert.equal(a[0].length, 320 * 180 * 3);
  const hash = (fs: Uint8Array[]) => createHash("sha256").update(Buffer.concat(fs)).digest("hex");
  assert.equal(hash(a), hash(run()));
  // Brightness near the hub vs near the tip of the stem, early and late in the bar.
  const gs = kirtledGeometry(320, 180);
  const lum = (f: Uint8Array, t: readonly (readonly [number, number])[]) => {
    const cx = Math.round(t.reduce((s, p) => s + p[0], 0) / 3); const cy = Math.round(t.reduce((s, p) => s + p[1], 0) / 3);
    let v = 0;
    for (let y = cy - 6; y <= cy + 6; y++) for (let x = cx - 6; x <= cx + 6; x++) { const i = (y * 320 + x) * 3; v += f[i] + f[i + 1] + f[i + 2]; }
    return v;
  };
  const early = a[3], late = a[44]; // 0.125 s and 1.83 s into a 2 s bar
  assert.ok(lum(early, gs.arms[0][0]) > lum(late, gs.arms[0][0]), "near the hub: bright early");
  assert.ok(lum(late, gs.arms[0][7]) > lum(early, gs.arms[0][7]), "at the tip: bright late");
});

test("lyrics and Kirtled cells: lyrics need a timing file, finals need it approved, one of each per block", () => {
  const { map, library } = fixture();
  const lyrics: LyricTiming = { status: "draft", lines: [{ text: "a line", start: 1, end: 3 }] };
  const three = (cells: GridPlan["blocks"][number]["cells"]) => plan([{ startBar: 0, endBar: 2, layout: "three", primary: 0, cells }]);
  const errs = (p: GridPlan, o: { approved?: boolean; lyrics?: LyricTiming | null } = {}) => resolveGrid(p, map, library, { fps: 24, ...o }).errors.map((e) => e.message);
  assert.deepEqual(errs(three([{ clipId: "a" }, { view: "lyrics" }, { view: "kirtled" }])), ["no lyric timing for this song yet (<song>/dance8/<song>.lyrics.json)"]);
  const ok = resolveGrid(three([{ clipId: "a" }, { view: "lyrics" }, { view: "kirtled" }]), map, library, { fps: 24, lyrics });
  assert.deepEqual(ok.errors, []);
  assert.deepEqual(ok.blocks[0].cells.map((c) => [c.view, c.clipId, c.inSec]), [["clip", "a", 0], ["lyrics", "lyrics", 0.5], ["kirtled", "kirtled", 0.5]], "views carry the block's song time");
  assert.ok(ok.warnings.some((w) => w.message === "the lyric timing is a draft (fine for a draft)"));
  assert.deepEqual(errs(three([{ clipId: "a" }, { view: "lyrics" }, { view: "kirtled" }]), { approved: true, lyrics }).filter((m) => m.includes("lyric")),
    ["the lyric timing is a draft; a final shows approved lyrics only (GOV-23)"]);
  assert.deepEqual(errs(three([{ clipId: "a" }, { view: "kirtled", clipId: "b" }, { view: "kirtled" }]), { lyrics }), ["a kirtled cell shows no clip; leave out clipId"]);
  assert.deepEqual(errs(three([{ clipId: "a" }, { view: "kirtled" }, { view: "kirtled" }]), { lyrics }), ["shows the kirtled view in more than one cell"]);
  assert.deepEqual(errs(three([{ clipId: "a" }, {}, { view: "kirtled" }]), { lyrics }), ["a clip cell needs a clipId"]);
  assert.deepEqual(errs(plan([{ startBar: 0, endBar: 2, layout: "one", primary: 0, cells: cells("a") }], { transition: { kind: "fade", beats: 3 } })), ["must be more than 0 and at most 2 beats"]);
});

test("lyrics view: the sung line large with the next one under it, on its own times; dissolves end on the bar line", () => {
  const lyrics: LyricTiming = { status: "approved", lines: [{ text: "first: it's here", start: 10, end: 11.5 }, { text: "second", start: 12, end: 13 }, { text: "later", start: 40, end: 41 }] };
  const args = lyricsCellArgs({ lyrics, width: 640, height: 360, fps: 24, frames: 96, fromSec: 9, fontFile: "/f.ttf", outPath: "/o.mp4" });
  const vf = args[args.indexOf("-vf") + 1];
  assert.match(vf, /text='first\\: it\u2019s here':fontsize=\d+:fontcolor=0xF4E3B5:[^,]*enable='between\(t\\,1\.000\\,3\.000\)'/);
  assert.match(vf, /text='second':fontsize=\d+:fontcolor=0x8C8577/, "the next line, small and dim");
  assert.match(vf, /text='second':fontsize=\d+:fontcolor=0xF4E3B5:[^,]*enable='between\(t\\,3\.000\\,6\.000\)'/, "up until two seconds after it ends");
  assert.ok(!/text='later':fontsize=\d+:fontcolor=0xF4E3B5/.test(vf), "a line outside the block is never shown large");
  assert.equal(args[args.indexOf("-frames:v") + 1], "96");

  const join = gridJoinArgs({ parts: ["/a.mp4", "/b.mp4", "/c.mp4"], frames: [48, 48, 48], fade: 6, fps: 24, outPath: "/p.mp4" });
  const fc = join[join.indexOf("-filter_complex") + 1];
  assert.equal(fc, "[0:v][1:v]xfade=transition=fade:duration=0.250000:offset=1.750000[x1];[x1][2:v]xfade=transition=fade:duration=0.250000:offset=3.750000[v]");
  assert.equal(join[join.indexOf("-frames:v") + 1], "144");
  const cut = gridJoinArgs({ parts: ["/a.mp4", "/b.mp4"], frames: [48, 48], fade: 0, fps: 24, outPath: "/p.mp4" });
  assert.equal(cut[cut.indexOf("-filter_complex") + 1], "[0:v][1:v]concat=n=2:v=1:a=0[v]");
});
