/**
 * The Kling upload pack: prompts compiled from a fixed template and the
 * reference folders, one card per shot. Synthetic briefs, characters, sets
 * and audio only.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  compileCard, isPlaceholderScene, KLING_PROMPT_MAX, packHtml, parseCast, parseFields, promptsText, sortCards, type RefIndex, type SceneRefs,
} from "../../lib/dance8/authoring/klingPack";
import type { ShotBrief } from "../../lib/dance8/authoring/shotBriefs";
import { klingPack } from "../../lib/dance8/klingPipeline";
import { saveManifest, type Ctx } from "../../lib/stuttr/commands";
import { emptyManifest } from "../../lib/stuttr/library";

const hasFfmpeg = spawnSync("ffmpeg", ["-version"]).status === 0;

const brief = (o: Partial<ShotBrief>): ShotBrief => ({
  id: "broll-verse-1-wide", kind: "broll", cueId: "verse-1", section: "verse", sceneId: "rooftop", camera: "wide", voice: null, lyric: null,
  songStartSec: 10, songEndSec: 15.2, generateSec: 6, keyframesSec: [0, 2.6, 5.2], aspect: "9:16", cropTo: null,
  generator: "kling-4.0-flash", resolution: "720p", referenceSetId: null, mouth: "hidden", notes: [], ...o,
});
const scene = (o: Partial<SceneRefs> = {}): SceneRefs => ({
  id: "rooftop", place: "A fictional rooftop garden of woven canopies over a river city", light: "Warm dusk, lanterns coming on",
  hidden: null, cast: {}, dancer: null, skater: null, master: "/lib/refs/scenes/rooftop/master.png", dancerImage: null, dir: "/lib/refs/scenes/rooftop", issues: [], ...o,
});
const refs = (s: Partial<SceneRefs> = {}, extra: Partial<RefIndex["characters"]> = {}): RefIndex => ({
  scenes: { rooftop: scene(s) },
  characters: {
    stuttr: { id: "stuttr", name: "Stuttr", look: "silver jacket, round dark glasses", face: "/lib/refs/cast/stuttr/face.png", fullbody: null, dir: "/lib/refs/cast/stuttr" },
    "white-sovereign": { id: "white-sovereign", name: "White Sovereign", look: null, face: null, fullbody: "/lib/refs/cast/white-sovereign/fullbody.png", dir: "/lib/refs/cast/white-sovereign" },
    ...extra,
  } as RefIndex["characters"],
});
const opts = { tool: "Kling 4.0 Flash (fast drafts)", downloads: "~/Downloads/s1" };
const NO_MUSIC_WORDS = /\b(beats?|bpm|tempo|bars?|downbeat|verse|chorus|section|rhythm)\b/i;

test("scene and character text: key: value lines, comments and empty values ignored", () => {
  const { fields, issues } = parseFields("# a comment\nplace: A rooftop: woven canopies\nlight:\nPlace: again\nno colon here\n");
  assert.deepEqual(fields, { place: "again" });
  assert.deepEqual(issues, ['"place" is given twice; the last one counts', "line 5 has no \"key:\" (no colon here)"]);
  assert.deepEqual(parseCast("Stuttr=brick-built-stuttr, Mo = mo, junk"), { stuttr: "brick-built-stuttr", mo: "mo" });
  assert.deepEqual(["intro", "verse-2", "chorus", "rooftop_canopy", "verse"].map(isPlaceholderScene), [true, true, true, false, false]);
});

test("lip sync card: the singer's face, the set, the cut audio and a fixed-template prompt", () => {
  const b = brief({ id: "lip_sync-verse-1-close-Stuttr-b4", kind: "lip_sync", camera: "close", voice: "Stuttr", mouth: "lip_sync", songStartSec: 12.5, songEndSec: 17.7 });
  const c = compileCard(b, refs(), { ...opts, audio: { path: "/lib/s1/dance8/kling/audio/lip.wav", problem: null } });
  assert.equal(c.ready, true, c.missing.join("; "));
  assert.equal(c.prompt, [
    "SUBJECT: Stuttr: silver jacket, round dark glasses. One singer.",
    "SETTING: A fictional rooftop garden of woven canopies over a river city",
    "ACTION: Sings straight to camera with clear, natural mouth movement, head steady, an expressive face.",
    "CAMERA: Close-up of the face, head and shoulders; the camera steady.",
    "LIGHT: Warm dusk, lanterns coming on",
    "CONTINUITY: Keep the reference character's face, hair and clothing, and the set's architecture and materials.",
    "AVOID: identity drift, clothing changes, extra limbs or fingers, warped objects, readable text, logos, real people, brands, flicker, hands, a microphone or hair over the lips",
  ].join("\n"));
  assert.ok(!NO_MUSIC_WORDS.test(c.prompt), "a prompt never asks the clip to follow the music (D8-01)");
  assert.deepEqual(c.uploads.map((u) => [u.role, u.path]), [
    ["Singer's face (reference)", "/lib/refs/cast/stuttr/face.png"],
    ["The set (reference)", "/lib/refs/scenes/rooftop/master.png"],
    ["Lip-sync audio (Stuttr, song 0:12.5 to 0:17.7)", "/lib/s1/dance8/kling/audio/lip.wav"],
  ]);
  assert.equal(c.download, "lip_sync-verse-1-close-Stuttr-b4.mp4");
  assert.match(c.steps.at(-1)!, /rename it lip_sync-verse-1-close-Stuttr-b4\.mp4 exactly .* save it in ~\/Downloads\/s1/);

  // Another character plays Stuttr in this scene; with no images yet and no audio, the card says what to add.
  const brick = compileCard(b, refs({ cast: { stuttr: "brick-built-stuttr" } }), { ...opts, audio: { path: null, problem: "no approved Stuttr take covers it" } });
  assert.equal(brick.ready, false);
  assert.deepEqual(brick.missing, [
    "Singer's face (reference): add refs/cast/brick-built-stuttr/face.png: Stuttr's face with the mouth fully visible",
    "lip-sync audio: no approved Stuttr take covers it",
  ]);
  const why = (voice: string) => compileCard({ ...b, voice }, refs(), opts).missing[0];
  assert.match(why("Lead"), /no approved lead take when it was planned/);
  assert.match(why("Backing"), /Suno's own backing singers have no character/);
  assert.match(why("M+Ja"), /2 singers \(M\+Ja\): Kling's lip sync follows one face/);
});

test("b-roll, trick and dance cards", () => {
  const hidden = compileCard(brief({}), refs({ hidden: "Hands on the railing, sneakers on wet tiles" }), opts);
  assert.equal(hidden.prompt.split("\n")[0], "SUBJECT: Hands on the railing, sneakers on wet tiles. No face or mouth is visible at any moment.");
  assert.match(hidden.prompt, /CONTINUITY: Keep the set's architecture, materials and light from the start frame\.\nAVOID: .*faces, mouths$/);
  const freeze = compileCard(brief({ id: "trick-board_freeze-rooftop", kind: "trick", trick: "board_freeze", trickVersion: "freeze_high", keyframesSec: [2.6] }), refs(), opts);
  assert.match(freeze.prompt, /ACTION: The skater rises into a standing freeze balanced on the board, holding the freeze from about 2\.6 s into the clip\./);
  assert.deepEqual(hidden.uploads.map((u) => u.role), ["Start frame"]);
  assert.equal(hidden.ready, true);
  const free = compileCard(brief({ mouth: "any", camera: "drone_wide" }), refs({ master: null }), opts);
  assert.match(free.prompt, /^SUBJECT: The set and its atmosphere; any people only at a distance\.\n.*\nACTION: .*\nCAMERA: High aerial drone shot/);
  assert.deepEqual(free.missing, ["Start frame: add /lib/refs/scenes/rooftop/master.png: the set's master image"]);
  const noWords = compileCard(brief({}), refs({ light: null }), opts);
  assert.deepEqual(noWords.missing, ['describe the set: fill in "place:" and "light:" in /lib/refs/scenes/rooftop/scene.txt']);
  assert.ok(!noWords.prompt.includes("LIGHT:"));

  const trick = compileCard(brief({ id: "trick-handplant_roll-spin_360-half-rooftop", kind: "trick", trick: "handplant_roll", trickVersion: "spin_360", crew: "half", crewCount: 4, keyframesSec: [2.607], camera: "wide" }), refs({ skater: "Stuttr" }), opts);
  assert.match(trick.prompt, /^SUBJECT: 4 skaters moving in unison, dressed like Stuttr, full bodies in frame\./);
  assert.match(trick.prompt, /\nACTION: In unison, each skater spins a full turn on the board, landing cleanly at about 2\.607 s into the clip\. One trick only\.\n/);
  assert.deepEqual(trick.uploads.map((u) => [u.role, u.required]), [["Skater (reference)", false], ["Start frame", true]]);
  assert.match(trick.steps[0], /lands somewhere other than 2\.607 s/);

  const motion = { takeId: "t1", video: "IMG_1.MOV", captureStartSec: 1, captureEndSec: 20, songStartSec: 10, songEndSec: 29, knownShare: 1, refFile: "/lib/s1/dance8/moves/refs/dance-verse-1-b4.mp4" };
  const dance = brief({ id: "dance-verse-1-b4", kind: "dance", mouth: "any", generator: "kling-3.0-motion-control-720p", motionRef: motion });
  const unnamed = compileCard(dance, refs(), opts);
  assert.match(unnamed.missing[0], /name the dancer: add "dancer:"/);
  const d = compileCard(dance, refs({ dancer: "White Sovereign", dancerImage: "/lib/refs/scenes/rooftop/dancer.png" }), opts);
  assert.equal(d.ready, true, d.missing.join("; "));
  assert.ok(!/ACTION:/.test(d.prompt), "Motion Control takes the moves from the video");
  assert.deepEqual(d.uploads.map((u) => u.path), ["/lib/refs/scenes/rooftop/dancer.png", motion.refFile]);
  assert.match(d.steps[0], /character orientation matches video/);
  const noRef = compileCard({ ...dance, motionRef: { ...motion, refFile: null } }, refs({ dancer: "white-sovereign" }), opts);
  assert.deepEqual(noRef.uploads.map((u) => u.path), ["/lib/refs/cast/white-sovereign/fullbody.png", null]);
  assert.match(noRef.missing[0], /reference cut is missing/);

  const long = compileCard(brief({}), refs({ place: "x".repeat(KLING_PROMPT_MAX) }), opts);
  assert.match(long.missing.at(-1)!, /Kling takes 2500/);
});

test("pack: cards by scene, then kind and song time; the page escapes text and links files relative to itself", () => {
  const a = compileCard(brief({ id: "b2", sceneId: "street", songStartSec: 30 }), refs(), opts);
  const b = compileCard(brief({ id: "b1", sceneId: "rooftop", songStartSec: 40 }), refs(), opts);
  const l = compileCard(brief({ id: "l1", kind: "lip_sync", voice: "Stuttr", sceneId: "rooftop", songStartSec: 5 }), refs(), opts);
  assert.deepEqual(sortCards([a, l, b], ["rooftop", "street"]).map((c) => c.shotId), ["b1", "l1", "b2"]);
  const html = packHtml([{ ...b, prompt: "SUBJECT: <script>alert(1)</script>" }], {
    title: "Song & Co", trackId: "s1", downloads: "~/Downloads/s1", clipsCommand: "npm run dance8 -- clips s1 ~/Downloads/s1", href: (p) => `../../..${p.replace("/lib", "")}`,
  });
  assert.ok(html.includes("SUBJECT: &lt;script&gt;alert(1)&lt;/script&gt;") && !html.includes("<script>alert"));
  assert.ok(html.includes('<img src="../../../refs/scenes/rooftop/master.png"'));
  assert.ok(html.includes("<title>Song &amp; Co · Kling pack</title>"));
  assert.match(promptsText("Song", [b]), /^Song: Kling prompts, one per shot \(1 of 1 ready\)\n\n#1  b1\.mp4  \(broll, Kling 4\.0 Flash \(fast drafts\), 6 s, 9:16\)\nSUBJECT:/);
});

/** 16-bit mono WAV of a tone. */
function wav(sec: number): Buffer {
  const rate = 44100, n = Math.round(sec * rate), data = Buffer.alloc(n * 2);
  for (let i = 0; i < n; i++) data.writeInt16LE(Math.round(Math.sin((2 * Math.PI * 440 * i) / rate) * 9000), i * 2);
  const h = Buffer.alloc(44);
  h.write("RIFF", 0, "ascii"); h.writeUInt32LE(36 + data.length, 4); h.write("WAVE", 8, "ascii"); h.write("fmt ", 12, "ascii"); h.writeUInt32LE(16, 16);
  h.writeUInt16LE(1, 20); h.writeUInt16LE(1, 22); h.writeUInt32LE(rate, 24); h.writeUInt32LE(rate * 2, 28); h.writeUInt16LE(2, 32); h.writeUInt16LE(16, 34);
  h.write("data", 36, "ascii"); h.writeUInt32LE(data.length, 40);
  return Buffer.concat([h, data]);
}

test("kling end to end: folders made once, the lip-sync audio cut, ready after the files arrive", { skip: !hasFfmpeg && "ffmpeg not installed" }, () => {
  const root = mkdtempSync(join(tmpdir(), "dance8-kling-"));
  const lines: string[] = [];
  const c: Ctx = { library: join(root, "library"), now: () => "2026-10-25T00:00:00.000Z", log: (l) => lines.push(l) };
  try {
    mkdirSync(join(c.library, "s1", "voices"), { recursive: true });
    writeFileSync(join(c.library, "s1", "voices", "stuttr.en.wav"), wav(20));
    const m = emptyManifest();
    m.tracks.push({
      trackId: "s1", title: "Synthetic One", sunoPlan: "Pro", addedAt: "2026-10-25T00:00:00.000Z", files: [],
      voices: [{
        voice: "Stuttr", lang: "en", path: "s1/voices/stuttr.en.wav", originalName: "stuttr.en.wav", sha256: "x", bytes: 1, sourceRole: "vocals", sourceSha256: "y",
        method: "elevenlabs_voice_changer", durationSec: 20, timingDeltaMs: 0, timingOk: true, status: "approved", addedAt: "2026-10-25T00:00:00.000Z",
      }],
    });
    saveManifest(c, m);
    const d8 = join(c.library, "s1", "dance8");
    mkdirSync(d8, { recursive: true });
    const briefs = [
      brief({ id: "broll-intro-drone_wide", sceneId: "rooftop", camera: "drone_wide", mouth: "any", songStartSec: 0, songEndSec: 5 }),
      brief({ id: "lip_sync-verse-1-close-Stuttr-b4", kind: "lip_sync", sceneId: "verse-1", camera: "close", voice: "Stuttr", mouth: "lip_sync", songStartSec: 6.25, songEndSec: 9.75 }),
    ];
    writeFileSync(join(d8, "s1.briefs.json"), JSON.stringify(briefs));
    writeFileSync(join(d8, "s1.cuemap.json"), JSON.stringify({ cues: [{ sceneId: "rooftop" }, { sceneId: "verse-1" }] }));

    const first = klingPack(c, "s1");
    assert.deepEqual(first.cards.map((x) => [x.shotId, x.ready]), [["broll-intro-drone_wide", false], ["lip_sync-verse-1-close-Stuttr-b4", false]]);
    const sharedScene = join(c.library, "refs", "scenes", "rooftop");
    const songScene = join(c.library, "s1", "refs", "scenes", "verse-1");
    const stuttr = join(c.library, "refs", "cast", "stuttr");
    for (const f of [join(sharedScene, "scene.txt"), join(songScene, "scene.txt"), join(stuttr, "character.txt")]) assert.ok(existsSync(f), f);
    assert.match(readFileSync(join(songScene, "scene.txt"), "utf8"), /"verse-1" is a placeholder from plan/);
    assert.match(readFileSync(join(stuttr, "character.txt"), "utf8"), /^name: Stuttr$/m);
    const audio = join(first.dir, "audio", "lip_sync-verse-1-close-Stuttr-b4.wav");
    const len = Number(spawnSync("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", audio], { encoding: "utf8" }).stdout);
    assert.ok(Math.abs(len - 3.5) < 0.02, `lip-sync cut ${len} s`);
    assert.ok(lines.some((l) => l.startsWith("downloads: mkdir -p ~/Downloads/s1")));

    // Daniel adds the words and images; nothing he wrote is overwritten.
    writeFileSync(join(sharedScene, "scene.txt"), "place: A fictional rooftop of woven canopies\nlight: Blue hour\n");
    writeFileSync(join(songScene, "scene.txt"), "place: A fictional market street at night\nlight: Neon spill on wet stone\n");
    writeFileSync(join(stuttr, "character.txt"), "name: Stuttr\nlook: silver jacket\n");
    for (const f of [join(sharedScene, "master.png"), join(songScene, "master.png"), join(stuttr, "face.png")]) writeFileSync(f, Buffer.from([0x89, 0x50, 0x4e, 0x47]));
    const second = klingPack(c, "s1");
    assert.deepEqual(second.cards.map((x) => x.ready), [true, true], second.cards.flatMap((x) => x.missing).join("; "));
    assert.equal(second.made.length, 0);
    assert.equal(readFileSync(join(sharedScene, "scene.txt"), "utf8"), "place: A fictional rooftop of woven canopies\nlight: Blue hour\n");
    const html = readFileSync(join(second.dir, "index.html"), "utf8");
    assert.ok(html.includes('src="../../../refs/scenes/rooftop/master.png"') && html.includes('href="audio/lip_sync-verse-1-close-Stuttr-b4.wav"'));
    assert.match(readFileSync(join(second.dir, "prompts.txt"), "utf8"), /SUBJECT: Stuttr: silver jacket\. One singer\.\nSETTING: A fictional market street at night/);
    assert.equal((JSON.parse(readFileSync(join(second.dir, "cards.json"), "utf8")) as unknown[]).length, 2);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
