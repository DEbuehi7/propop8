/**
 * The Dance8 visual reaction layer (canon D8-25) and Stuttr's visual feature
 * track. Synthetic audio and synthetic feature tracks only: no song, footage
 * or media from the owner is in this repository (GOV-16, D8-17).
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { CANON_REGISTER } from "../../lib/canon";
import {
  FEATURE_NAMES, frameCount, readFeatures, validateFeatures, visualFeatures, VISUAL_FEATURES_SCHEMA, type VisualFeatureTrack,
} from "../../lib/stuttr/visualFeatures";
import { parseFps } from "../../lib/stuttr/visualFeaturesFile";
import {
  baseExcerptArgs, compositeArgs, DEFAULT_ZONES, frameStream, maxFlashesPerSecond, overlayEncodeArgs, parseWindows, planReactionTrack,
  previewHtml, renderWindow, tileLuma, type VerifiedEventInput, type WindowSpec,
} from "../../lib/dance8/reaction";

const SHA = "a".repeat(64);
const SIZE = { width: 320, height: 180 };

/** A valid feature file whose values come from `fn(feature, frame)` (0-1). */
function fakeFeatures(frames: number, fn: (name: string, k: number) => number, sha = SHA): string {
  const q8 = Object.fromEntries(FEATURE_NAMES.map((n) => [n, Buffer.from(Uint8Array.from({ length: frames }, (_, k) => Math.round(255 * Math.max(0, Math.min(1, fn(n, k)))))).toString("base64")]));
  const t: VisualFeatureTrack = {
    schema: VISUAL_FEATURES_SCHEMA, trackId: "synthetic", source: { file: "synthetic.wav", sha256: sha }, sampleRate: 22050,
    fps: { num: 24, den: 1 }, frames, durationSec: frames / 24, evidence: "MEASURED_AUDIO_FEATURES", limits: "synthetic", q8: q8 as VisualFeatureTrack["q8"],
  };
  return JSON.stringify(t);
}
/** Song-like: a pulse every 12 frames, slow swells in the bands. */
const songLike = (n: string, k: number) => n === "onset" ? (k % 12 === 0 ? 1 : 0.1) : 0.5 + 0.4 * Math.sin(k / (n === "low" ? 17 : n === "mid" ? 11 : 7));
const PROOF: WindowSpec[] = [
  { id: "loom", family: "GENOME_LOOM", scene: "SC06", musicStartSec: 29.5, musicEndSec: 33.5 },
  { id: "cypher", family: "ALGORITHMIC_CYPHER", scene: "SC05", musicStartSec: 58, musicEndSec: 65.25 },
  { id: "chamber", family: "RESONANCE_CHAMBER", scene: "SC06", musicStartSec: 97, musicEndSec: 103.5 },
];
const plan = (o: Partial<Parameters<typeof planReactionTrack>[0]> = {}) => planReactionTrack({ songId: "synthetic", featuresText: fakeFeatures(3022, songLike), featuresSha256: SHA, windows: PROOF, ...o });
const sha = (b: Uint8Array) => createHash("sha256").update(b).digest("hex");

test("canon: D8-25 is registered as the reaction layer", () => {
  const e = CANON_REGISTER.find((x) => x.id === "D8-25");
  assert.ok(e, "D8-25 exists");
  assert.equal(e!.domain, "DANCE8");
  assert.match(e!.statement, /reaction layer/);
  assert.match(e!.statement, /HOLD/);
});

test("features: the right band answers in the right frames, repeatably", () => {
  const sr = 22050;
  const x = new Float32Array(sr * 4);
  for (let i = sr; i < 2 * sr; i++) x[i] = 0.5 * Math.sin((2 * Math.PI * 100 * i) / sr);
  for (let i = 2 * sr; i < 3 * sr; i++) x[i] = 0.5 * Math.sin((2 * Math.PI * 4000 * i) / sr);
  for (let n = 0; n < 4; n++) { const c = Math.round(3 * sr + (n * sr) / 4); for (let i = 0; i < 64; i++) x[c + i] = 0.9 * (1 - i / 64); }
  const t = visualFeatures(x, sr, { num: 24, den: 1 }, { trackId: "s", file: "s.wav", sha256: SHA });
  assert.equal(t.frames, 96);
  const f = readFeatures(t);
  const argmax = (v: Float64Array) => v.reduce((best, val, i) => (val > v[best] ? i : best), 0);
  assert.ok(argmax(f.low) >= 24 && argmax(f.low) < 48, `low peaks in second 1 (${argmax(f.low)})`);
  assert.ok(argmax(f.high) >= 48 && argmax(f.high) < 72, `high peaks in second 2 (${argmax(f.high)})`);
  assert.ok(f.rms.slice(0, 20).every((v) => v === 0), "silence is zero");
  const clicks = [72, 78, 84, 90];
  for (const c of clicks) {
    const at = Math.max(f.onset[c], f.onset[c + 1]);
    const between = Math.max(f.onset[c + 3], f.onset[c + 4]);
    assert.ok(at > 0.05 && at > 3 * between, `onset at the click near frame ${c} (${at} vs ${between})`);
  }
  assert.equal(JSON.stringify(visualFeatures(x, sr, { num: 24, den: 1 }, { trackId: "s", file: "s.wav", sha256: SHA })), JSON.stringify(t));
  assert.match(t.limits, /Not beats, chords/);
  assert.equal(frameCount(Math.round(125.92 * 48000), 48000, { num: 24, den: 1 }), 3022, "125.92 s at 24 fps is 3022 whole frames");
});

test("features: a damaged file is rejected, not repaired; frame rates parse exactly", () => {
  const good = JSON.parse(fakeFeatures(48, () => 0.5));
  assert.ok(validateFeatures(good).track);
  assert.ok(validateFeatures({ ...good, q8: { ...good.q8, low: Buffer.from([1, 2]).toString("base64") } }).errors.some((e) => /low/.test(e)));
  assert.ok(validateFeatures({ ...good, evidence: "VERIFIED" }).errors.length);
  assert.deepEqual(parseFps("24"), { num: 24, den: 1 });
  assert.deepEqual(parseFps("23.976"), { num: 24000, den: 1001 });
  assert.deepEqual(parseFps("30000/1001"), { num: 30000, den: 1001 });
  assert.throws(() => parseFps("fast"));
});

test("plan: the three proof windows are 426 frames on the musical clock", () => {
  const { track } = plan();
  assert.deepEqual(track.windows.map((w) => [w.startFrame, w.frames]), [[708, 96], [1392, 174], [2328, 156]]);
  assert.equal(track.windows.reduce((s, w) => s + w.frames, 0), 426);
  assert.ok(track.windows.every((w) => w.renderable && w.snapShiftSec === 0 && w.geometry === "CONCEPTUAL"));
  assert.ok(track.events.every((e) => e.clock === "MUSIC"));
  assert.equal(track.uiStatus, "DRAFT");
  const off = plan({ windows: [{ id: "x", family: "GENOME_LOOM", musicStartSec: 10.01, musicEndSec: 12 }] }).track.windows[0];
  assert.equal(off.startFrame, 240);
  assert.equal(off.snapShiftSec, -0.01, "the move onto the frame grid is recorded");
});

test("plan: energy peaks are measured light, never beats; unverified musical events are HOLD", () => {
  const { track } = plan();
  const onsets = track.events.filter((e) => e.kind === "onset_like");
  assert.ok(onsets.length > 0);
  assert.ok(onsets.every((e) => e.evidenceState === "MEASURED" && /not a verified beat/.test(e.note)));
  assert.ok(!onsets.some((e) => e.window === "chamber"), "the chamber follows the bands only");
  assert.ok(!track.events.some((e) => e.kind === "chord_change" || e.kind === "move_word" || e.kind === "beat"));
  const held = track.holds.filter((h) => h.window === "cypher").map((h) => h.kind).sort();
  assert.deepEqual(held, ["beat", "chord_change", "move_word"]);
  assert.match(track.holds.find((h) => h.kind === "chord_change")!.reason, /D8-16/);
  assert.match(track.holds.find((h) => h.kind === "move_word")!.reason, /D8-17/);
  assert.equal(plan({ reducedMotion: true }).track.events.filter((e) => e.kind === "onset_like").length, 0, "no pulses in reduced motion");
});

test("plan: only a chord change with VERIFIED and a named reviewer is drawn", () => {
  const events: VerifiedEventInput[] = [
    { kind: "chord_change", musicSec: 60, label: "Em", evidence: { state: "VERIFIED", reviewer: "Owner", source: "chord chart v1" } },
    { kind: "chord_change", musicSec: 62, label: "G", evidence: { state: "VERIFIED" } },
    { kind: "chord_change", musicSec: 63, label: "C", evidence: { state: "PROPOSED", reviewer: "Owner" } },
  ];
  const { track } = plan({ events });
  const drawn = track.events.filter((e) => e.kind === "chord_change");
  assert.deepEqual(drawn.map((e) => [e.frame, e.reviewer, e.evidenceState]), [[1440, "Owner", "VERIFIED"]]);
  assert.match(track.holds.find((h) => h.kind === "chord_change")!.reason, /2 chord_change event\(s\) lack/);
});

test("plan: fails closed on a bad, mismatched or out-of-range input", () => {
  const mismatch = plan({ expectSourceSha256: "b".repeat(64) }).track;
  assert.ok(mismatch.windows.every((w) => !w.renderable));
  assert.ok(mismatch.holds.some((h) => h.kind === "features" && /not the expected/.test(h.reason)));
  const broken = plan({ featuresText: "{not json" }).track;
  assert.ok(broken.windows.every((w) => !w.renderable) && broken.events.length === 0);
  const bad = plan({ windows: [...PROOF, { id: "late", family: "GENOME_LOOM", musicStartSec: 125, musicEndSec: 130 }, { id: "loom", family: "GENOME_LOOM", musicStartSec: 1, musicEndSec: 2 }] }).track;
  assert.equal(bad.windows.find((w) => w.id === "late")?.renderable, false);
  assert.ok(bad.holds.some((h) => h.window === "late" && /after the song/.test(h.reason)));
  assert.ok(bad.holds.some((h) => h.window === "loom" && /twice/.test(h.reason)));
  assert.throws(() => frameStream(mismatch, mismatch.windows[0], readFeatures(JSON.parse(fakeFeatures(3022, songLike))), SIZE).next(), /held/);
});

test("plan: reads the proof package's overlay map", () => {
  const csv = "proof_part,song_start_s,song_end_s,song_duration_s,proof_start_s,proof_end_s,source_scene,visual_family,evidence\n1,29.5,33.5,4.0,0.0,4.0,SC06,GENOME_LOOM,x\n2,58.0,65.25,7.25,4.0,11.25,SC05,ALGORITHMIC_CYPHER,x\n";
  const w = parseWindows(csv, "map.csv");
  assert.deepEqual(w.map((x) => [x.id, x.family, x.musicStartSec, x.musicEndSec]), [["01-genome-loom-sc06", "GENOME_LOOM", 29.5, 33.5], ["02-algorithmic-cypher-sc05", "ALGORITHMIC_CYPHER", 58, 65.25]]);
});

const features = () => readFeatures(JSON.parse(fakeFeatures(3022, songLike)));

test("render: same inputs give the same frames; another seed gives others", () => {
  const { track } = plan();
  const f = features();
  for (const w of track.windows) {
    const a = renderWindow(track, w, f, SIZE);
    assert.equal(a.frames, w.frames);
    assert.equal(renderWindow(track, w, f, SIZE).framesSha256, a.framesSha256, `${w.id} repeats`);
    const other = { ...w, seed: w.seed + 1 };
    assert.notEqual(renderWindow({ ...track }, other, f, SIZE).framesSha256, a.framesSha256, `${w.id} follows its seed`);
  }
});

test("render: each family draws only inside its zone, so faces and captions stay clear", () => {
  const { track } = plan();
  const f = features();
  const margin = 8;
  for (const w of track.windows) {
    const z = DEFAULT_ZONES[w.family];
    const [x0, y0, x1, y1] = [z.x * SIZE.width - margin, z.y * SIZE.height - margin, (z.x + z.w) * SIZE.width + margin, (z.y + z.h) * SIZE.height + margin];
    let outside = 0;
    renderWindow(track, w, f, SIZE, (_k, rgb) => {
      for (let y = 0; y < SIZE.height; y++) for (let x = 0; x < SIZE.width; x++) {
        const i = (y * SIZE.width + x) * 3;
        if ((rgb[i] || rgb[i + 1] || rgb[i + 2]) && (x < x0 || x > x1 || y < y0 || y > y1)) outside++;
      }
    });
    assert.equal(outside, 0, `${w.id} stays in its zone (${outside} pixels outside)`);
  }
});

test("render: reduced motion keeps every line still; normal motion moves", () => {
  const f = features();
  const level = (rgb: Uint8Array, i: number) => Math.max(rgb[i], rgb[i + 1], rgb[i + 2]);
  // Pixels that are clearly lit in one frame and dark in the other: lines that moved (brightness alone may change).
  const moved = (a: Uint8Array, b: Uint8Array) => { let n = 0; for (let i = 0; i < a.length; i += 3) if ((level(a, i) >= 8 && level(b, i) === 0) || (level(b, i) >= 8 && level(a, i) === 0)) n++; return n; };
  for (const reducedMotion of [true, false]) {
    const { track } = plan({ reducedMotion });
    for (const w of track.windows) {
      const at: Record<number, Uint8Array> = {};
      renderWindow(track, w, f, SIZE, (k, rgb) => { if (k === 12 || k === 60) at[k] = rgb; });
      const n = moved(at[12], at[60]);
      if (reducedMotion) assert.equal(n, 0, `${w.id}: nothing moves in reduced motion`);
      else assert.ok(n > 20, `${w.id}: lines move in normal motion (${n})`);
    }
  }
});

test("render: never more than three flashes a second, even on harsh input", () => {
  const harsh = fakeFeatures(3022, (n, k) => (n === "onset" ? (k % 2 ? 1 : 0) : k % 2));
  for (const reducedMotion of [false, true]) {
    const { track, features: ft } = planReactionTrack({ songId: "harsh", featuresText: harsh, featuresSha256: SHA, windows: PROOF, reducedMotion });
    const f = readFeatures(ft!);
    for (const w of track.windows) {
      const tiles: number[][] = [];
      renderWindow(track, w, f, SIZE, (_k, rgb) => tiles.push(tileLuma(rgb, SIZE.width, SIZE.height)));
      const series = tiles[0].map((_, i) => Float64Array.from(tiles, (t) => t[i]));
      assert.ok(maxFlashesPerSecond(series, 24) <= 3, `${w.id} ${reducedMotion ? "reduced" : "normal"}`);
    }
  }
  assert.equal(maxFlashesPerSecond([Float64Array.from({ length: 24 }, (_, k) => (k % 2 ? 0.5 : 0))], 24), 11, "the counter does count real flashes");
});

test("render: windows fade in, and a landing ring appears only for a verified chord change", () => {
  const f = features();
  const { track } = plan();
  const cy = track.windows.find((w) => w.id === "cypher")!;
  const frames: Uint8Array[] = [];
  renderWindow(track, cy, f, SIZE, (_k, rgb) => frames.push(rgb));
  const mean = (b: Uint8Array) => b.reduce((s, v) => s + v, 0) / b.length;
  assert.ok(mean(frames[0]) < mean(frames[12]) * 0.3, "the first frame is nearly dark");
  const verified = plan({ events: [{ kind: "chord_change", musicSec: 60, evidence: { state: "VERIFIED", reviewer: "Owner" } }] }).track;
  const unverified = plan({ events: [{ kind: "chord_change", musicSec: 60, evidence: { state: "PROPOSED" } }] }).track;
  const frameAt = (t: typeof track, k: number) => { let out: Uint8Array = new Uint8Array(); renderWindow(t, t.windows.find((w) => w.id === "cypher")!, f, SIZE, (i, rgb) => { if (i === k) out = rgb; }); return sha(out); };
  const k = 1440 - 1392 + 3;
  assert.notEqual(frameAt(verified, k), frameAt(track, k), "the verified change draws a ring");
  assert.equal(frameAt(unverified, k), frameAt(track, k), "an unverified change draws nothing");
});

test("ffmpeg: overlays are silent; a composite cuts on frames and keeps the footage's sound once", () => {
  const ov = overlayEncodeArgs({ width: 960, height: 540, fps: { num: 24, den: 1 }, outPath: "o.mp4" });
  assert.ok(ov.includes("-an") && ov.includes("pipe:0") && ov.includes("rgb24"));
  const c = compositeArgs({ basePath: "b.mp4", overlayPath: "o.mp4", startFrame: 708, frames: 96, fps: { num: 24, den: 1 }, outPath: "h.mp4" });
  const graph = c[c.indexOf("-filter_complex") + 1];
  assert.match(graph, /trim=start_frame=708:end_frame=804/);
  assert.match(graph, /atrim=start=29\.500000:end=33\.500000/);
  assert.match(graph, /blend=all_mode=screen/);
  assert.equal(c.filter((a) => a === "[a]").length, 1, "one audio stream, from the footage");
  assert.ok(!graph.includes("[1:a]"), "nothing from the overlay's (absent) audio");
  const b = baseExcerptArgs({ basePath: "b.mp4", startFrame: 2328, frames: 156, fps: { num: 24000, den: 1001 }, outPath: "x.mp4" });
  assert.match(b[b.indexOf("-filter_complex") + 1], /atrim=start=97\.097000:end=103\.603500/);
});

test("preview: screen blend, an original/hybrid switch and reduced motion by system setting", () => {
  const html = previewHtml("edo <draft>", [{ id: "a", family: "GENOME_LOOM", scene: "SC06", musicStartSec: 29.5, musicEndSec: 33.5, base: "01.original.mp4", overlay: "01.overlay.mp4", reduced: "01.overlay-reduced.mp4" }], ["Not hardware."]);
  assert.match(html, /mix-blend-mode: screen/);
  assert.match(html, /prefers-reduced-motion: reduce/);
  assert.match(html, /Show the overlay/);
  assert.match(html, /edo &lt;draft&gt;/);
  assert.match(html, /0:29\.50 to 0:33\.50/);
});

const hasFfmpeg = spawnSync("ffmpeg", ["-version"]).status === 0 && spawnSync("ffprobe", ["-version"]).status === 0;

test("end to end: features, overlays, composites and manifest from synthetic media", { skip: !hasFfmpeg && "ffmpeg not installed" }, async () => {
  const { writeVisualFeatures } = await import("../../lib/stuttr/visualFeaturesFile");
  const { renderReaction } = await import("../../lib/dance8/reactionPipeline");
  const dir = mkdtempSync(join(tmpdir(), "reaction-"));
  try {
    const wav = join(dir, "song.wav");
    const base = join(dir, "cut.mp4");
    const ff = (args: string[]) => assert.equal(spawnSync("ffmpeg", ["-v", "error", "-y", ...args]).status, 0);
    ff(["-f", "lavfi", "-i", "sine=frequency=110:duration=4:beep_factor=4", "-ar", "48000", "-ac", "2", wav]);
    ff(["-f", "lavfi", "-i", "testsrc2=size=320x180:rate=24:duration=4", "-i", wav, "-c:v", "libx264", "-pix_fmt", "yuv420p", "-c:a", "aac", "-shortest", base]);
    const wavBefore = createHash("sha256").update(readFileSync(wav)).digest("hex");
    const t = writeVisualFeatures(wav, join(dir, "f.json"), { num: 24, den: 1 }, "synthetic");
    assert.equal(t.frames, 96);
    writeFileSync(join(dir, "w.json"), JSON.stringify({ windows: [
      { id: "a", family: "GENOME_LOOM", musicStartSec: 0.5, musicEndSec: 1.5 },
      { id: "b", family: "ALGORITHMIC_CYPHER", musicStartSec: 1.5, musicEndSec: 2.5 },
      { id: "c", family: "RESONANCE_CHAMBER", musicStartSec: 2.5, musicEndSec: 3.5 },
    ] }));
    const r = await renderReaction({ featuresPath: join(dir, "f.json"), windowsPath: join(dir, "w.json"), outDir: join(dir, "out"), basePath: base, expectSourceSha256: wavBefore });
    assert.deepEqual(r.failed, [], JSON.stringify(r.failed));
    assert.equal(r.manifest.outputs.length, 6, "an overlay and a reduced overlay per window");
    assert.ok(r.manifest.outputs.every((o) => o.audioStreams === 0 && o.frames === 24));
    assert.equal(r.manifest.proof?.frames, 72);
    assert.equal(r.manifest.proof?.audioStreams, 1);
    assert.equal(r.manifest.paidCalls, 0);
    assert.equal(createHash("sha256").update(readFileSync(wav)).digest("hex"), wavBefore, "the audio is only read");
    const manifest = JSON.parse(readFileSync(join(dir, "out", "reaction-manifest.json"), "utf8"));
    assert.equal(manifest.inputs.features.audioSha256, wavBefore);
    assert.match(readFileSync(join(dir, "out", "placements.csv"), "utf8"), /a,GENOME_LOOM,,0\.500,1\.500,12,24,01-genome-loom\.overlay\.mp4/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
