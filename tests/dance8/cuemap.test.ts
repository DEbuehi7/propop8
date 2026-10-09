/**
 * Scene/camera cue map: validator, cut planner and ffmpeg render arguments.
 * All data is synthetic (fixtures/cuemap-ghost-network-pilot.json and
 * fixtures/visual-clips-pilot.json). The cut plan is pinned by a golden file;
 * regenerate deliberately with UPDATE_GOLDEN=1 and review the diff.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, writeFileSync, existsSync, mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { spawnSync } from "node:child_process";
import cueMapData from "../../fixtures/cuemap-ghost-network-pilot.json";
import libraryData from "../../fixtures/visual-clips-pilot.json";
import type { CueMap, Cut, VisualClipLibrary } from "../../lib/dance8/contracts/scene";
import { validateCueMap, barToSec } from "../../lib/dance8/authoring/validateCueMap";
import { planCuts, sliceCuts } from "../../lib/dance8/runtime/CutPlanner";
import { buildFfmpegArgs, frameAt } from "../../lib/dance8/render/ffmpegArgs";

const clone = <T,>(x: T): T => JSON.parse(JSON.stringify(x));
const baseMap = () => clone(cueMapData) as unknown as CueMap;
const baseLib = () => clone(libraryData) as unknown as VisualClipLibrary;
const codes = (r: { issues: { code: string }[] }) => r.issues.map((i) => i.code);
const FONT = "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf";

/** The two promises every plan must keep, whatever the seed. */
function assertLipSyncRules(map: CueMap, lib: VisualClipLibrary, cuts: Cut[], offsetSec = 0) {
  const byId = new Map(lib.clips.map((c) => [c.id, c]));
  const vocals = map.vocals ?? [];
  for (const c of cuts) {
    const clip = byId.get(c.clipId)!;
    if (c.reason === "lip_sync") {
      // Clip time + where the clip starts in the song = song time, to the microsecond.
      assert.ok(Math.abs(clip.lipSync!.songStartSec + c.clipInSec - (c.startSec + offsetSec)) < 1e-5, `cut ${c.index} out of sync`);
      assert.ok(c.clipInSec + (c.endSec - c.startSec) <= clip.durationSec + 1e-6, `cut ${c.index} runs past its lip-synced clip`);
    } else {
      const sung = vocals.some((v) => v.startBar < c.endBar && c.startBar < v.endBar);
      assert.ok(!(sung && clip.mouthVisible), `cut ${c.index} shows an unsynced mouth during vocals`);
    }
  }
}

test("pilot cue map validates as a draft", () => {
  const r = validateCueMap(baseMap(), baseLib());
  assert.deepEqual(r.issues, []);
  assert.equal(r.ok, true);
});

test("cut plan is pinned (golden)", () => {
  const plan = planCuts(baseMap(), baseLib());
  assert.equal(plan.ok, true);
  const path = join(__dirname, "..", "fixtures", "dance8_cutplan_golden.json");
  if (process.env.UPDATE_GOLDEN === "1" || !existsSync(path)) {
    writeFileSync(path, JSON.stringify(plan, null, 2) + "\n");
    return;
  }
  assert.deepEqual(plan, JSON.parse(readFileSync(path, "utf8")));
});

test("cuts cover the song with no gaps, on bar lines, never longer than their clip", () => {
  const map = baseMap();
  const lib = baseLib();
  const plan = planCuts(map, lib);
  const dur = new Map(lib.clips.map((c) => [c.id, c.durationSec]));
  assert.equal(plan.cuts[0].startBar, 0);
  for (let i = 0; i < plan.cuts.length; i++) {
    const c = plan.cuts[i];
    if (i > 0) assert.equal(c.startBar, plan.cuts[i - 1].endBar);
    assert.ok(Number.isInteger(c.startBar) && Number.isInteger(c.endBar));
    assert.ok(c.endSec - c.startSec <= dur.get(c.clipId)! + 1e-9, `cut ${i} longer than ${c.clipId}`);
  }
  assert.equal(plan.cuts.at(-1)!.endBar, 36);
  // 36 bars of 4 beats at 124 bpm = 144 * 60 / 124 seconds.
  assert.equal(plan.totalSec, Math.round(((144 * 60) / 124) * 1e6) / 1e6);
});

test("same inputs give the same plan on 10 runs", () => {
  const first = JSON.stringify(planCuts(baseMap(), baseLib()));
  for (let i = 0; i < 10; i++) assert.equal(JSON.stringify(planCuts(baseMap(), baseLib())), first);
});

test("unmeasured draft clip is never placed on screen", () => {
  const plan = planCuts(baseMap(), baseLib());
  assert.ok(!plan.cuts.some((c) => c.clipId === "stage-close-02-draft"));
});

test("clips for the same scene + camera rotate instead of repeating", () => {
  const plan = planCuts(baseMap(), baseLib());
  const tracking = plan.cuts.filter((c) => c.sceneId === "street" && c.camera === "tracking").map((c) => c.clipId);
  assert.deepEqual(tracking.slice(0, 2), ["street-tracking-01", "street-tracking-02"]);
});

test("a shot is shortened to fit a 5 second clip, never stretched", () => {
  const map = baseMap();
  map.cues[1].shotBars = 4; // verse-1: 4 bars = 7.74 s, street-wide-01 is 5 s
  const plan = planCuts(map, baseLib());
  const short = plan.cuts.filter((c) => c.cueId === "verse-1" && c.reason === "shortened_to_clip");
  assert.ok(short.length > 0);
  for (const c of short) assert.equal(c.endBar - c.startBar, 2);
});

test("tempo change moves cut times by the exact bar arithmetic", () => {
  const map = baseMap();
  map.tempo.push({ startBar: 16, bpm: 140, beatsPerBar: 4 });
  assert.equal(barToSec(map.tempo, 16), Math.round(((64 * 60) / 124) * 1e6) / 1e6);
  assert.equal(barToSec(map.tempo, 17), Math.round(((64 * 60) / 124 + 240 / 140) * 1e6) / 1e6);
  const plan = planCuts(map, baseLib());
  assert.equal(plan.ok, true);
  const chorus = plan.cuts.find((c) => c.cueId === "chorus-1")!;
  assert.equal(chorus.startSec, barToSec(map.tempo, 16));
});

test("validator catches gaps, bad tempo, drift problems and bad fallback", () => {
  const map = baseMap();
  map.cues[1].startBar = 5; // gap after intro
  map.tempo[0].startBar = 1;
  map.fallbackClipId = "stage-close-02-draft";
  const lib = baseLib();
  lib.clips[0].drift.driftScore = 0.9; // above 0.25
  lib.clips[1].drift = { status: "unknown", driftScore: null };
  const r = validateCueMap(map, lib);
  const c = codes(r);
  for (const want of ["cue_order", "tempo_invalid", "fallback_invalid", "drift_too_high", "drift_unmeasured"]) {
    assert.ok(c.includes(want), `expected ${want} in ${c.join(", ")}`);
  }
  assert.equal(planCuts(map, lib).cuts.length, 0, "an invalid map produces no cuts");
});

test("draft previews with the fallback; render-ready maps refuse missing footage", () => {
  const map = baseMap();
  map.cues[4].cameras = ["orbit"]; // no aim_b5r orbit clip exists
  const draft = planCuts(map, baseLib());
  assert.equal(draft.ok, true);
  assert.ok(draft.cuts.some((c) => c.cueId === "break" && c.reason === "fallback_no_match"));

  map.approvalStatus = "approved";
  map.approvedBy = "Daniel";
  map.approvedAt = "2026-10-08T00:00:00Z";
  const strict = validateCueMap(map, baseLib(), { requireApproved: true });
  assert.ok(codes(strict).includes("no_clip_for_shot"));

  const draftStrict = validateCueMap(baseMap(), baseLib(), { requireApproved: true });
  assert.deepEqual(codes(draftStrict), ["not_approved"]);
});

test("ffmpeg frame counts add up to the song length with no drift", () => {
  const plan = planCuts(baseMap(), baseLib());
  const fps = 30;
  const sum = plan.cuts.reduce((s, c) => s + frameAt(c.endSec, fps) - frameAt(c.startSec, fps), 0);
  assert.equal(sum, frameAt(plan.totalSec, fps));
  const args = buildFfmpegArgs(plan.cuts, baseLib(), {
    clipDir: "clips", audioPath: "song.mp3", outPath: "out.mp4", width: 1080, height: 1920, fps,
  });
  assert.equal(args.filter((a) => a === "-i").length, plan.cuts.length + 1);
  assert.equal(args[args.indexOf("-frames:v") + 1], String(sum));
});

const hasFfmpeg = spawnSync("ffmpeg", ["-version"]).status === 0;

test("renders a synthetic pilot to the exact song length", { skip: !hasFfmpeg && "ffmpeg not installed" }, () => {
  const dir = mkdtempSync(join(tmpdir(), "dance8-render-"));
  try {
    const lib = baseLib();
    for (const c of lib.clips) {
      const r = spawnSync("ffmpeg", ["-y", "-loglevel", "error", "-f", "lavfi", "-i",
        `testsrc2=size=90x160:rate=12:duration=${c.durationSec}`, "-pix_fmt", "yuv420p", join(dir, c.file)]);
      assert.equal(r.status, 0, String(r.stderr));
    }
    const plan = planCuts(baseMap(), lib);
    const audio = join(dir, "song.m4a");
    assert.equal(spawnSync("ffmpeg", ["-y", "-loglevel", "error", "-f", "lavfi", "-i",
      `sine=frequency=220:duration=${Math.ceil(plan.totalSec) + 2}`, "-c:a", "aac", audio]).status, 0);
    const out = join(dir, "pilot.mp4");
    const fps = 12;
    const r = spawnSync("ffmpeg", buildFfmpegArgs(plan.cuts, lib, {
      clipDir: dir, audioPath: audio, outPath: out, width: 90, height: 160, fps,
    }));
    assert.equal(r.status, 0, String(r.stderr));
    const probe = spawnSync("ffprobe", ["-v", "error", "-select_streams", "v:0", "-count_frames",
      "-show_entries", "stream=nb_read_frames", "-of", "csv=p=0", out]);
    assert.equal(Number(String(probe.stdout).trim()), frameAt(plan.totalSec, fps));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("lip sync: synced shots line up with the song; no unsynced mouth during vocals", () => {
  const map = baseMap();
  const lib = baseLib();
  const plan = planCuts(map, lib);
  assert.ok(plan.cuts.some((c) => c.reason === "lip_sync"));
  assertLipSyncRules(map, lib, plan.cuts);
});

test("seeds: same seed same video; different seeds differ; rules hold for every seed", () => {
  const map = baseMap();
  const lib = baseLib();
  const seen = new Set<string>();
  for (let seed = 0; seed < 25; seed++) {
    const a = planCuts(map, lib, { seed });
    const b = planCuts(map, lib, { seed });
    assert.equal(JSON.stringify(a), JSON.stringify(b), `seed ${seed} is not repeatable`);
    assert.equal(a.ok, true);
    assert.equal(a.totalSec, planCuts(map, lib).totalSec);
    assertLipSyncRules(map, lib, a.cuts);
    seen.add(JSON.stringify(a.cuts.map((c) => [c.clipId, c.startBar])));
  }
  assert.ok(seen.size >= 10, `only ${seen.size} distinct edits from 25 seeds`);
  assert.equal(planCuts(map, lib, { seed: -1 }).ok, false);
});

test("final render refuses shots that would need the stand-in clip", () => {
  const map = baseMap();
  map.approvalStatus = "approved";
  map.approvedBy = "Daniel";
  map.approvedAt = "2026-10-08T00:00:00Z";
  const plan = planCuts(map, baseLib(), { requireApproved: true });
  assert.equal(plan.ok, false);
  assert.ok(plan.issues.every((i) => i.code === "no_clip_for_shot"));
  assert.match(plan.issues[0].message, /without a visible singer/);
});

test("validator catches broken lip-sync clips, vocal lines and a fallback with a mouth", () => {
  const map = baseMap();
  const lib = baseLib();
  const ls = lib.clips.find((c) => c.lipSync)!;
  ls.lipSync!.songStartSec = -1;
  map.vocals!.push({ id: "bad", voice: "", startBar: 30, endBar: 99 });
  lib.clips.find((c) => c.id === map.fallbackClipId)!.mouthVisible = true;
  const c = codes(validateCueMap(map, lib));
  for (const want of ["lip_sync_invalid", "vocal_invalid", "mouth_unsynced"]) {
    assert.ok(c.includes(want), `expected ${want} in ${c.join(", ")}`);
  }
});

test("shorts: a sliced chorus starts at 0, keeps its length and stays in sync", () => {
  const map = baseMap();
  const lib = baseLib();
  const plan = planCuts(map, lib, { seed: 7 });
  const chorus = map.cues.find((c) => c.id === "chorus-2")!;
  const s = sliceCuts(plan, map.tempo, chorus.startBar, chorus.endBar);
  assert.equal(s.cuts[0].startSec, 0);
  assert.equal(s.offsetSec, barToSec(map.tempo, chorus.startBar));
  assert.ok(Math.abs(s.cuts.at(-1)!.endSec - s.totalSec) < 1e-6);
  assertLipSyncRules(map, lib, s.cuts, s.offsetSec);
  // A slice that starts mid-shot moves the in-point with it.
  const mid = sliceCuts(plan, map.tempo, 17, 20);
  assertLipSyncRules(map, lib, mid.cuts, mid.offsetSec);
});

test("renders a short with beat punch and the AI caption to the exact length", {
  skip: (!hasFfmpeg && "ffmpeg not installed") || (!existsSync(FONT) && "font not installed"),
}, () => {
  const dir = mkdtempSync(join(tmpdir(), "dance8-short-"));
  try {
    const map = baseMap();
    const lib = baseLib();
    for (const c of lib.clips) {
      assert.equal(spawnSync("ffmpeg", ["-y", "-loglevel", "error", "-f", "lavfi", "-i",
        `testsrc2=size=90x160:rate=12:duration=${c.durationSec}`, "-pix_fmt", "yuv420p", join(dir, c.file)]).status, 0);
    }
    const audio = join(dir, "song.m4a");
    assert.equal(spawnSync("ffmpeg", ["-y", "-loglevel", "error", "-f", "lavfi", "-i",
      "sine=frequency=220:duration=75", "-c:a", "aac", audio]).status, 0);
    const plan = planCuts(map, lib, { seed: 3 });
    const s = sliceCuts(plan, map.tempo, 16, 24);
    const out = join(dir, "short.mp4");
    const fps = 12;
    const r = spawnSync("ffmpeg", buildFfmpegArgs(s.cuts, lib, {
      clipDir: dir, audioPath: audio, outPath: out, width: 90, height: 160, fps,
      audioOffsetSec: s.offsetSec, punch: 0.06,
      caption: { text: "All characters are fictional and AI-generated.", fontFile: FONT, seconds: 3 },
    }));
    assert.equal(r.status, 0, String(r.stderr));
    const probe = spawnSync("ffprobe", ["-v", "error", "-select_streams", "v:0", "-count_frames",
      "-show_entries", "stream=nb_read_frames", "-of", "csv=p=0", out]);
    assert.equal(Number(String(probe.stdout).trim()), frameAt(s.cuts.at(-1)!.endSec, fps));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
