/**
 * Dance8 plan, clips and approve-clip. Synthetic data only: a made-up
 * analysis, and a short made-up song (tones and clicks) for the end-to-end run.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { spawnSync } from "node:child_process";
import type { SongAnalysis } from "../../lib/stuttr/analysis";
import { lyricGroups, lyricLines, parseKey, planSong, spreadLines, sungRuns } from "../../lib/dance8/authoring/plan";
import { validateCueMap } from "../../lib/dance8/authoring/validateCueMap";
import { planCuts } from "../../lib/dance8/runtime/CutPlanner";
import { aspectOf, briefForFile, ingestClips, planTrack, setClipStatus, songPaths, standInClip } from "../../lib/dance8/pipeline";
import { addSong, analyzeTrack, type Ctx } from "../../lib/stuttr/commands";
import type { ShotBrief } from "../../lib/dance8/authoring/shotBriefs";
import type { CueMap, VisualClipLibrary } from "../../lib/dance8/contracts/scene";

const hasFfmpeg = spawnSync("ffmpeg", ["-version"]).status === 0;

/** 16 bars: lead sings bars 2-6 and 10-14, backing bars 8-12; C for 8 bars, then Am with one unclear half bar. */
function analysis(): SongAnalysis {
  const eighths = (ranges: [number, number][]) => Array.from({ length: 128 }, (_, k) => (ranges.some(([a, b]) => k >= a * 8 && k < b * 8) ? -20 : -80));
  const chords = Array.from({ length: 32 }, (_, i) => ({ bar: i >> 1, half: (i & 1) as 0 | 1, chord: i < 16 ? "C" : "Am", fit: i === 20 ? 0.5 : 0.95 }));
  return {
    schemaVersion: 1, analyzer: "stuttr-analysis-1", trackId: "synthetic", sources: [], bpm: 120, beatSec: 0.5, firstBeatSec: 0.04,
    beatsPerBar: 4, downbeatPhase: 0, phaseScores: [3, 1, 1, 1], firstDownbeatSec: 0.04, gridResidP95ms: 5, bars: 16, durationSec: 33,
    barDb: { lead: null, backing: null, drums: null, bass: null, harmony: null, fx: null },
    eighthDb: { lead: eighths([[2, 6], [10, 14]]), backing: eighths([[8, 12]]) },
    chords, warnings: ["4/4 time is assumed"],
  };
}

test("sung runs split at a beat of silence; lyric lines skip stage directions", () => {
  const db = [-80, -20, -20, -80, -20, -80, -80, -20, -20, -80];
  assert.deepEqual(sungRuns(db), [[1, 5], [7, 9]], "a one-eighth breath stays inside the phrase");
  assert.deepEqual(lyricLines("[Verse 1 | close]\nfirst line\n\n[two clicks]\nsecond [softly] line\n"), ["first line", "second line"]);
  assert.deepEqual(spreadLines([4, 4], ["a", "b", "c", "d"]), [["a", "b"], ["c", "d"]]);
  assert.deepEqual(spreadLines([6, 2], ["a", "b", "c", "d"]), [["a", "b", "c"], ["d"]]);
  assert.deepEqual(lyricGroups("[Verse 1]\na\nb\n[Hook | shouts]\nc\n[Verse 2]\nd\n[Hook]\ne").map((g) => [g.chorus, g.lines.length]), [[false, 2], [true, 1], [false, 1], [true, 1]]);
  assert.deepEqual(parseKey("Eb"), { startBar: 0, startBeat: 0, tonic: 3, quality: "maj" });
  assert.equal(parseKey("F#m")!.tonic, 6);
  assert.equal(parseKey("H"), null);
});

test("plan: sections from the vocals, lyrics by section, chords with N.C. holds; valid and deterministic", () => {
  const lyrics = "[Intro]\n[Verse 1]\nverse line one\nverse line two\n[Hook]\nhook line\n[Verse 2]\nlast line";
  const d = planSong({ analysis: analysis(), lyrics, leadVoice: "Stuttr", key: parseKey("C")! });
  assert.deepEqual(d.map.cues.map((c) => [c.id, c.section, c.startBar, c.endBar, c.sceneId]), [
    ["intro", "intro", 0, 2, "intro"],
    ["verse-1", "verse", 2, 8, "verse-1"],
    ["chorus-1", "chorus", 8, 12, "chorus"],
    ["verse-2", "verse", 12, 14, "verse-2"],
    ["outro", "outro", 14, 16, "outro"],
  ]);
  assert.equal(d.map.firstDownbeatSec, 0.04);
  assert.deepEqual(d.map.vocals!.map((v) => [v.voice, v.startBar, v.endBar, v.text ?? null]), [
    ["Stuttr", 2, 6, "verse line one verse line two"],
    ["Backing", 8, 12, null],
    ["Stuttr", 10, 14, "hook line last line"],
  ], "the second lead phrase starts in the chorus, so the lyric sections don't line up and lines are spread by length");
  assert.ok(d.notes.some((n) => n.includes("did not line up")));
  assert.deepEqual(d.harmony.events.map((e) => [e.startBar, e.startBeat, e.symbol]), [[0, 0, "C"], [8, 0, "Am"], [10, 0, "N.C."], [10, 2, "Am"]]);
  assert.deepEqual(d.harmony.keys, [parseKey("C")]);
  const lib: VisualClipLibrary = { version: 1, clips: [standInClip("9:16", "2026-10-18T00:00:00Z")] };
  assert.deepEqual(validateCueMap(d.map, lib).issues, []);
  assert.deepEqual(planSong({ analysis: analysis(), lyrics, leadVoice: "Stuttr", key: parseKey("C")! }), d);
});

test("clip files match their brief by name, with or without a take number; shapes are recognised", () => {
  const briefs = [{ id: "broll-intro-drone_wide" }, { id: "broll-intro-drone_wide-2x" }, { id: "lipsync-verse-1-medium-1" }] as ShotBrief[];
  assert.equal(briefForFile("broll-intro-drone_wide.mp4", briefs)!.id, "broll-intro-drone_wide");
  assert.equal(briefForFile("broll-intro-drone_wide-3.mp4", briefs)!.id, "broll-intro-drone_wide");
  assert.equal(briefForFile("broll-intro-drone_wide (2).mov", briefs)!.id, "broll-intro-drone_wide");
  assert.equal(briefForFile("broll-intro-drone_wide-2x.mp4", briefs)!.id, "broll-intro-drone_wide-2x");
  assert.equal(briefForFile("lipsync-verse-1-medium-1.mp4", briefs)!.id, "lipsync-verse-1-medium-1");
  assert.equal(briefForFile("kling_20261018_001.mp4", briefs), null);
  assert.equal(aspectOf(1080, 1920), "9:16");
  assert.equal(aspectOf(720, 1280), "9:16");
  assert.equal(aspectOf(1920, 1080), "16:9");
  assert.equal(aspectOf(1000, 1000), "1:1");
  assert.equal(aspectOf(1000, 1600), null);
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

test("end to end: analyze, plan (kept on rerun), clips by name, approve with a drift score", { skip: !hasFfmpeg && "ffmpeg not installed" }, () => {
  const root = mkdtempSync(join(tmpdir(), "dance8-plan-"));
  const lines: string[] = [];
  const c: Ctx = { library: join(root, "library"), now: () => "2026-10-18T00:00:00.000Z", log: (l) => lines.push(l) };
  try {
    const dur = 33;
    const beat = 0.5;
    const hit = (t: number, every: number, freq: number, amp: number, decay: number) => {
      const p = t % every;
      return p < 0.1 ? Math.sin(2 * Math.PI * freq * p) * Math.exp(-p / decay) * amp : 0;
    };
    const sing = (t: number, ranges: [number, number][], f: number) => (ranges.some(([a, b]) => t >= a * 2 && t < b * 2) ? 0.3 * Math.sin(2 * Math.PI * f * t) : 0);
    const triad = (t: number) => (t < 16 ? [261.63, 329.63, 392] : [220, 261.63, 329.63]).reduce((s, f) => s + 0.12 * Math.sin(2 * Math.PI * f * t), 0);
    const inbox = join(root, "inbox", "Synthetic Song");
    mkdirSync(inbox, { recursive: true });
    writeFileSync(join(inbox, "0 Lead Vocal.wav"), wavOf(dur, (t) => sing(t, [[2, 6], [10, 14]], 440)));
    writeFileSync(join(inbox, "1 Drum Kit.wav"), wavOf(dur, (t) => (t < 32 ? hit(t, beat, 60, 0.5, 0.03) + hit(t, 4 * beat, 60, 0.4, 0.03) + hit(t, beat, 2500, 0.2, 0.004) : 0)));
    writeFileSync(join(inbox, "2 Bass.wav"), wavOf(dur, (t) => (t < 32 ? hit(t, 4 * beat, 55, 0.6, 0.08) : 0)));
    writeFileSync(join(inbox, "3 Backing Vocals.wav"), wavOf(dur, (t) => sing(t, [[8, 12]], 550)));
    writeFileSync(join(inbox, "4 Piano.wav"), wavOf(dur, (t) => (t < 32 ? triad(t) : 0)));
    writeFileSync(join(inbox, "Synthetic Song.wav"), wavOf(dur, (t) => 0.5 * triad(t)));
    writeFileSync(join(inbox, "lyrics.txt"), "[Verse 1]\nfirst line\nsecond line\n[Hook]\nhook line\n[Verse 2]\nlast line\n");
    addSong(c, { folder: inbox });

    assert.throws(() => planTrack(c, "synthetic-song"), /run: npm run stuttr -- analyze synthetic-song/);
    analyzeTrack(c, "synthetic-song");
    const a = JSON.parse(readFileSync(songPaths(c, "synthetic-song").analysis, "utf8")) as SongAnalysis;
    assert.ok(Math.abs(a.bpm - 120) < 0.2, `bpm ${a.bpm}`);
    assert.equal(a.bars, 16);
    assert.ok(a.chords.filter((x) => x.bar < 8).every((x) => x.chord === "C"));

    const p = planTrack(c, "synthetic-song", { key: "C" });
    for (const f of [p.cuemap, p.harmony, p.kirtled, p.clips, p.briefs, p.readme, p.standIn]) assert.ok(existsSync(f), f);
    const map = JSON.parse(readFileSync(p.cuemap, "utf8")) as CueMap;
    assert.deepEqual(map.cues.map((q) => q.section), ["intro", "verse", "chorus", "verse", "outro"]);
    const briefs = JSON.parse(readFileSync(p.briefs, "utf8")) as ShotBrief[];
    assert.ok(briefs.length > 0 && briefs.some((b) => b.kind === "lip_sync") && briefs.some((b) => b.kind === "broll"));
    assert.match(readFileSync(p.readme, "utf8"), /npm run dance8 -- clips synthetic-song ~\/Downloads/);

    // Your edits survive a rerun; --replace rebuilds.
    map.cues[0].sceneId = "harbour";
    writeFileSync(p.cuemap, JSON.stringify(map));
    lines.length = 0;
    planTrack(c, "synthetic-song", { key: "C" });
    assert.equal((JSON.parse(readFileSync(p.cuemap, "utf8")) as CueMap).cues[0].sceneId, "harbour");
    assert.ok(lines.some((l) => l.startsWith("kept your ") && l.includes("cuemap.json")));
    const briefs2 = JSON.parse(readFileSync(p.briefs, "utf8")) as ShotBrief[];
    assert.ok(briefs2.some((b) => b.sceneId === "harbour"), "the shot list follows your scene name");

    // Clips named after their brief come in as drafts; others are left alone.
    const dl = join(root, "downloads");
    mkdirSync(dl);
    const lip = briefs2.find((b) => b.kind === "lip_sync")!;
    const broll = briefs2.find((b) => b.kind === "broll")!;
    const mk = (name: string, sec: number) =>
      assert.equal(spawnSync("ffmpeg", ["-v", "error", "-y", "-f", "lavfi", "-i", `color=c=gray:s=270x480:r=24:d=${sec}`, "-c:v", "libx264", "-pix_fmt", "yuv420p", join(dl, name)]).status, 0);
    mk(`${lip.id}.mp4`, lip.generateSec);
    mk(`${broll.id}-2.mp4`, broll.generateSec);
    mk("kling_unnamed.mp4", 3);
    lines.length = 0;
    const added = ingestClips(c, "synthetic-song", dl);
    assert.equal(added.length, 2);
    const lipClip = added.find((x) => x.id === lip.id)!;
    assert.deepEqual([lipClip.approvalStatus, lipClip.mouthVisible, lipClip.lipSync], ["draft", true, { voice: lip.voice, songStartSec: lip.songStartSec }]);
    assert.equal(lipClip.aspect, "9:16");
    assert.ok(existsSync(join(p.clipDir, `${lip.id}.mp4`)));
    assert.ok(lines.some((l) => l.includes("1 video file(s) didn't match")));
    assert.equal(ingestClips(c, "synthetic-song", dl).length, 0, "running it again adds nothing");

    // Approval needs your drift score; nothing guesses it.
    assert.throws(() => setClipStatus(c, "synthetic-song", lip.id, "approved"), /needs --drift/);
    const ok = setClipStatus(c, "synthetic-song", lip.id, "approved", 0.1);
    assert.deepEqual(ok.drift, { status: "known", driftScore: 0.1, method: "human_review", checkedAt: "2026-10-18T00:00:00.000Z" });
    const lib = JSON.parse(readFileSync(p.clips, "utf8")) as VisualClipLibrary;
    assert.deepEqual(validateCueMap(JSON.parse(readFileSync(p.cuemap, "utf8")), lib).issues, []);

    // Skaters play Kirtled in the chorus (canon D8-16): C -> Am at bar 8 is RA, a floor carve.
    planTrack(c, "synthetic-song", { key: "C", skate: "chorus" });
    const tr = JSON.parse(readFileSync(p.tricks, "utf8")) as { sceneId: string; tricks: { atBar: number; atSec: number; trick: string }[] };
    assert.equal(tr.sceneId, "chorus");
    assert.deepEqual(tr.tricks.map((t) => [t.atBar, t.trick]), [[8, "floor_carve"]]);
    const tb = (JSON.parse(readFileSync(p.briefs, "utf8")) as ShotBrief[]).find((b) => b.kind === "trick")!;
    assert.deepEqual([tb.id, tb.trick, tb.keyframesSec[0], tb.generateSec, tb.mouth], ["trick-floor_carve-chorus", "floor_carve", 2, 4, "hidden"]);
    mk(`${tb.id}.mp4`, tb.generateSec);
    const [trickClip] = ingestClips(c, "synthetic-song", dl);
    assert.deepEqual(trickClip.trick, { trick: "floor_carve", landingSec: 2 });
    assert.throws(() => setClipStatus(c, "synthetic-song", lip.id, "approved", 0.1, 1), /not a trick clip/);
    setClipStatus(c, "synthetic-song", trickClip.id, "approved", 0.1, 1.9);
    const lib2 = JSON.parse(readFileSync(p.clips, "utf8")) as VisualClipLibrary;
    assert.equal(lib2.clips.find((x) => x.id === trickClip.id)!.trick!.landingSec, 1.9, "your measured landing is kept");
    const cut = planCuts(JSON.parse(readFileSync(p.cuemap, "utf8")) as CueMap, lib2, { tricks: tr.tricks }).cuts.find((x) => x.reason === "skate_trick")!;
    assert.deepEqual([cut.startBar, cut.clipId, cut.clipInSec], [8, trickClip.id, 1.9]);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
