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
  compileCard, isPlaceholderScene, KLING_PROMPT_MAX, packHtml, parseCast, parseFields, parseProps, promptsText, sortCards, type RefIndex, type SceneRefs,
} from "../../lib/dance8/authoring/klingPack";
import { mergeRates, parseRates, planCredits, summarize } from "../../lib/dance8/authoring/klingCredits";
import { crc32, readZip, zipStore } from "../../lib/dance8/authoring/zipStore";
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

test("credits: published rates, your own rates, lip sync; an unknown rate stays unknown", () => {
  const { rates: own, issues } = parseRates({ "kling-4.0-flash": 5, "lip-sync": 2, "kling-9": 1, "kling-3.0": -1 });
  assert.deepEqual(Object.keys(own).sort(), ["kling-4.0-flash", "lip-sync"]);
  assert.equal(issues.length, 2);
  assert.match(parseRates([]).issues[0], /must be an object/);
  const rates = mergeRates(own);
  assert.equal(rates["kling-3.0-720p"].perSec, 6, "published Kling 3.0 720p rate, native audio off");
  assert.equal(mergeRates({ "kling-3.0-720p": { perSec: 5, source: "mine" } })["kling-3.0-720p"].perSec, 5, "your plan's rate wins");

  const b720 = compileCard(brief({ generator: "kling-3.0-720p", generateSec: 6 }), refs(), opts);
  const lip = compileCard(brief({ id: "lip_sync-verse-1-close-Stuttr-b4", kind: "lip_sync", camera: "close", voice: "Stuttr", mouth: "lip_sync", songStartSec: 12.5, songEndSec: 17.7 }), refs(), { ...opts, audio: { path: "/a.wav", problem: null } });
  const finals = compileCard(brief({ id: "broll-x", sceneId: "street", generator: "kling-4.0" }), refs(), opts);
  const [a, l, f] = planCredits([b720, lip, finals], rates);
  assert.deepEqual([a.credit!.video, a.credit!.total], [36, 36]);
  assert.deepEqual([l.credit!.video, l.credit!.lipSync, l.credit!.total], [30, 12, 42], "5.2 s of audio is billed as 6");
  assert.deepEqual([f.credit!.video, f.credit!.total], [null, null]);
  const noLipRate = planCredits([lip], mergeRates({ "kling-4.0-flash": { perSec: 5, source: "mine" } }))[0].credit!;
  assert.deepEqual([noLipRate.video, noLipRate.total], [30, null], "lip sync with no rate leaves the total unknown");
  const sum = summarize([a, l, f], rates);
  assert.deepEqual(sum.unknownTools, ["Kling 4.0 Flash (fast drafts)"], "the label of the tool whose rate is unknown");
});

test("credits: one b-roll clip per set and camera, a test card per new set, then the budget", () => {
  const rates = mergeRates(parseRates({ "kling-4.0-flash": 5, "lip-sync": 2 }).rates);
  const set = refs();
  const street = { ...scene({ id: "street", dir: "/lib/refs/scenes/street", master: "/lib/refs/scenes/street/master.png" }) };
  const two: RefIndex = { ...set, scenes: { ...set.scenes, street } };
  const a = compileCard(brief({ id: "broll-verse-1-wide", mouth: "hidden", generateSec: 6 }), two, opts);
  const b = compileCard(brief({ id: "broll-chorus-1-wide", cueId: "chorus-1", mouth: "any", generateSec: 8, songStartSec: 40 }), two, opts);
  const l1 = compileCard(brief({ id: "lip_sync-verse-1-close-Stuttr-b4", kind: "lip_sync", camera: "close", voice: "Stuttr", mouth: "lip_sync", songStartSec: 12, songEndSec: 18, generateSec: 6 }), two, { ...opts, audio: { path: "/a.wav", problem: null } });
  const c = compileCard(brief({ id: "broll-bridge-wide", sceneId: "street", generateSec: 5, songStartSec: 60 }), two, opts);
  const cards = planCredits([a, b, l1, c], rates);
  const note = (id: string) => cards.find((x) => x.shotId === id)!.credit!;
  // The hidden-mouth card leads its group at the group's longest length and covers the other.
  assert.deepEqual([note("broll-verse-1-wide").generateSec, note("broll-verse-1-wide").covers, note("broll-verse-1-wide").total], [8, ["broll-chorus-1-wide"], 40]);
  assert.deepEqual([note("broll-chorus-1-wide").batch, note("broll-chorus-1-wide").coveredBy, note("broll-chorus-1-wide").total], ["covered", "broll-verse-1-wide", 0]);
  // Each new set's first own card is its test; the set's other cards wait for it.
  assert.deepEqual(cards.map((x) => [x.shotId, x.credit!.testFirst, x.credit!.batch]), [
    ["broll-verse-1-wide", true, "now"], ["broll-chorus-1-wide", false, "covered"], ["lip_sync-verse-1-close-Stuttr-b4", false, "after_test"], ["broll-bridge-wide", true, "now"],
  ]);
  const s = summarize(cards, rates);
  assert.deepEqual([s.now, s.nowCredits, s.covered, s.savedByCover, s.afterTest], [2, 65, 1, 40, 1]);
  // A budget of 50: the rooftop test (40) fits, the street test (25) waits.
  const tight = planCredits([a, b, l1, c], rates, { budget: 50 });
  assert.deepEqual(tight.map((x) => x.credit!.batch), ["now", "covered", "after_test", "later"]);
  // Once the rooftop set has a clip, nothing there is a test: the street test goes first, then lip sync before b-roll.
  const tested = planCredits([a, b, l1, c], rates, { budget: 70, testedScenes: new Set(["rooftop"]) });
  assert.deepEqual(tested.map((x) => [x.credit!.testFirst, x.credit!.batch]), [[false, "later"], [false, "covered"], [false, "now"], [true, "now"]]);
  const unknown = planCredits([compileCard(brief({ generator: "kling-4.0" }), two, opts)], rates, { budget: 500 });
  assert.equal(unknown[0].credit!.batch, "no_rate", "a budget never counts a card whose cost is unknown");
  const missing = planCredits([compileCard(brief({}), refs({ master: null }), opts)], rates);
  assert.equal(missing[0].credit!.batch, "not_ready");

  const html = packHtml(cards, {
    title: "S", trackId: "s1", downloads: "~/Downloads/s1", clipsCommand: "x", href: (p) => p, credits: { summary: s, ratesFile: "/lib/kling-rates.json" },
  });
  for (const want of ["covered by #1", "test first", "about 40 credits", "8 s (covers #2)", "native audio off", "Generate now: 2 shots, about 65 credits", "saving about 40 credits"]) {
    assert.ok(html.includes(want), want);
  }
  assert.match(promptsText("S", cards), /#1  broll-verse-1-wide\.mp4  \(broll, Kling 4\.0 Flash \(fast drafts\), 8 s, 9:16\)  \[TEST FIRST, generate now; about 40 credits\]/);
  assert.match(promptsText("S", cards), /#2  broll-chorus-1-wide\.mp4 .*\[covered: skip it; covered by #1\]/);
});

test("props: a vehicle's image and words go on b-roll and trick cards, never on lip sync", () => {
  assert.deepEqual(parseProps("Equus-X, tri mop, equus-x,"), ["equus-x", "tri-mop"]);
  const withBike: RefIndex = {
    ...refs({ props: ["equus-x"], hidden: "A rider seen from behind on a hover bike" }),
    props: { "equus-x": { id: "equus-x", name: "the Equus-X", look: "a ribbed black-and-gold hover bike shaped like a running horse", image: "/lib/refs/props/equus-x/prop.png", dir: "/lib/refs/props/equus-x" } },
  };
  const b = compileCard(brief({}), withBike, opts);
  assert.equal(b.prompt.split("\n")[0], "SUBJECT: A rider seen from behind on a hover bike. No face or mouth is visible at any moment. In the shot: the Equus-X: a ribbed black-and-gold hover bike shaped like a running horse.");
  assert.match(b.prompt, /CONTINUITY: Keep the set's architecture, materials and light from the start frame, and the look of the prop\./);
  assert.deepEqual(b.uploads.map((u) => [u.role, u.required]), [["Start frame", true], ["Prop (reference): the Equus-X", false]]);
  assert.equal(b.ready, true);
  const noImage = compileCard(brief({}), { ...withBike, props: {} }, opts);
  assert.match(noImage.uploads[1].need, /add refs\/props\/equus-x\/prop\.png/);
  const lip = compileCard(brief({ kind: "lip_sync", camera: "close", voice: "Stuttr", mouth: "lip_sync" }), withBike, { ...opts, audio: { path: "/a.wav", problem: null } });
  assert.ok(!lip.prompt.includes("Equus") && !lip.uploads.some((u) => u.role.startsWith("Prop")));
});

test("kling options: your rates file, --model for non-dance shots, a budget, prop folders made once", () => {
  const root = mkdtempSync(join(tmpdir(), "dance8-kling-credits-"));
  const lines: string[] = [];
  const c: Ctx = { library: join(root, "library"), now: () => "2026-11-02T00:00:00.000Z", log: (l) => lines.push(l) };
  try {
    const m = emptyManifest();
    m.tracks.push({ trackId: "s2", title: "Synthetic Two", sunoPlan: "Pro", addedAt: "2026-11-02T00:00:00.000Z", files: [], voices: [] });
    saveManifest(c, m);
    const d8 = join(c.library, "s2", "dance8");
    mkdirSync(d8, { recursive: true });
    writeFileSync(join(d8, "s2.briefs.json"), JSON.stringify([
      brief({ id: "broll-intro-wide", sceneId: "boulevard", aspect: "16:9", generateSec: 5 }),
      brief({ id: "broll-outro-wide", cueId: "outro", sceneId: "boulevard", aspect: "16:9", generateSec: 18, songStartSec: 90 }),
    ]));
    writeFileSync(join(d8, "s2.cuemap.json"), JSON.stringify({ cues: [{ sceneId: "boulevard" }] }));
    const sceneDir = join(c.library, "refs", "scenes", "boulevard");
    mkdirSync(sceneDir, { recursive: true });
    writeFileSync(join(sceneDir, "scene.txt"), "place: A fictional palm boulevard at dusk\nlight: Pink sky, wet road\nprops: equus-x\n");
    writeFileSync(join(sceneDir, "master.png"), Buffer.from([0x89, 0x50, 0x4e, 0x47]));
    writeFileSync(join(c.library, "kling-rates.json"), JSON.stringify({ "kling-4.0-flash": 4 }));

    assert.throws(() => klingPack(c, "s2", { budget: 0 }), /--budget takes a number/);
    assert.throws(() => klingPack(c, "s2", { model: "kling-9" }), /no generator "kling-9"/);
    assert.throws(() => klingPack(c, "s2", { model: "kling-3.0-motion-control-720p" }), /follows a motion video/);

    const r = klingPack(c, "s2", { model: "kling-3.0-720p", budget: 100 });
    const propTxt = join(c.library, "refs", "props", "equus-x", "prop.txt");
    assert.match(readFileSync(propTxt, "utf8"), /^name: the equus x$/m);
    // The 18 s shot is too long for Kling 3.0 (15 s), so it keeps Flash. Both are b-roll of one set and camera,
    // so one clip covers both: the one that can be 18 s leads, and the 5 s shot is skipped (72 credits, not 30 + 72).
    assert.deepEqual(r.cards.map((x) => [x.shotId, x.generator, x.credit!.batch]), [["broll-intro-wide", "kling-3.0-720p", "covered"], ["broll-outro-wide", "kling-4.0-flash", "now"]]);
    assert.deepEqual(r.cards.map((x) => x.credit!.total), [0, 72]);
    assert.ok(r.cards[1].credit!.testFirst);
    assert.ok(lines.some((l) => /kept the planned generator for 1 shot\(s\) .*broll-outro-wide/.test(l)));
    assert.ok(lines.includes("generate now: 1 shot(s), about 72 credits (budget 100)"), lines.join("\n"));
    assert.ok(lines.some((l) => /1 b-roll shot\(s\) covered by another card's clip: skip them \(saves about 30 credits\)/.test(l)));

    writeFileSync(propTxt, "name: the Equus-X\nlook: a ribbed hover bike\n");
    const again = klingPack(c, "s2", { budget: 50 });
    assert.equal(readFileSync(propTxt, "utf8"), "name: the Equus-X\nlook: a ribbed hover bike\n", "never overwritten");
    assert.match(again.cards[0].prompt, /In the shot: the Equus-X: a ribbed hover bike\./);
    assert.deepEqual(again.cards.map((x) => x.credit!.batch), ["covered", "later"], "72 credits is past a budget of 50");
    assert.ok(existsSync(join(again.dir, "index.html")));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("zip: stored entries round-trip with their CRCs; bad paths are refused", () => {
  assert.equal(crc32(Buffer.from("123456789")), 0xcbf43926, "the standard CRC-32 check value");
  const when = new Date(2026, 10, 2, 9, 30, 0);
  const entries = [{ name: "README.txt", data: Buffer.from("hello") }, { name: "refs/cast/stuttr/face.png", data: Buffer.from([0x89, 0x50, 0x4e, 0x47]) }];
  const z = zipStore(entries, when);
  assert.deepEqual(readZip(z).map((e) => [e.name, e.data.toString("hex")]), entries.map((e) => [e.name, e.data.toString("hex")]));
  assert.ok(zipStore(entries, when).equals(z), "same entries and date, same bytes");
  assert.throws(() => zipStore([{ name: "../x", data: Buffer.alloc(0) }], when), /bad zip path/);
  assert.throws(() => zipStore([{ name: "/x", data: Buffer.alloc(0) }], when), /bad zip path/);
  assert.throws(() => zipStore([entries[0], entries[0]], when), /two zip entries/);
  if (spawnSync("unzip", ["-v"]).status === 0) {
    const dir = mkdtempSync(join(tmpdir(), "dance8-zip-"));
    try {
      writeFileSync(join(dir, "t.zip"), z);
      assert.equal(spawnSync("unzip", ["-tq", join(dir, "t.zip")]).status, 0, "a standard unzip accepts it");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  }
});

test("kling --zip: only this batch, every upload inside, links inside the zip", () => {
  const root = mkdtempSync(join(tmpdir(), "dance8-kling-zip-"));
  const lines: string[] = [];
  const c: Ctx = { library: join(root, "library"), now: () => "2026-11-02T17:00:00.000Z", log: (l) => lines.push(l) };
  try {
    const m = emptyManifest();
    m.tracks.push({ trackId: "s3", title: "Synthetic Three", sunoPlan: "Pro", addedAt: "2026-11-02T00:00:00.000Z", files: [], voices: [] });
    saveManifest(c, m);
    const d8 = join(c.library, "s3", "dance8");
    mkdirSync(d8, { recursive: true });
    writeFileSync(join(d8, "s3.briefs.json"), JSON.stringify([
      brief({ id: "broll-intro-drone_wide", sceneId: "harbour", camera: "drone_wide", aspect: "16:9", generateSec: 5, songStartSec: 0 }),
      brief({ id: "broll-verse-1-wide", sceneId: "harbour", camera: "wide", aspect: "16:9", generateSec: 6, songStartSec: 10 }),
      brief({ id: "broll-bridge-wide", sceneId: "market", camera: "wide", aspect: "16:9", generateSec: 7, songStartSec: 60 }),
    ]));
    writeFileSync(join(d8, "s3.cuemap.json"), JSON.stringify({ cues: [{ sceneId: "harbour" }, { sceneId: "market" }] }));
    for (const [id, place] of [["harbour", "A fictional harbour of coloured houses"], ["market", "A fictional covered market"]]) {
      const d = join(c.library, "refs", "scenes", id);
      mkdirSync(d, { recursive: true });
      writeFileSync(join(d, "scene.txt"), `place: ${place}\nlight: Late sun\n`);
      writeFileSync(join(d, "master.png"), Buffer.from(`png-${id}`));
    }

    const r = klingPack(c, "s3", { model: "kling-3.0-720p", zip: true });
    // Harbour's first card is its test and the other waits; market's only card is its test.
    assert.deepEqual(r.cards.map((x) => x.credit!.batch), ["now", "after_test", "now"]);
    const zipFile = join(r.dir, "s3-kling.zip");
    const entries = readZip(readFileSync(zipFile));
    assert.deepEqual(entries.map((e) => e.name), [
      "README.txt", "index.html", "prompts.txt", "cards.json", "refs/scenes/harbour/master.png", "refs/scenes/market/master.png",
    ]);
    const get = (n: string) => entries.find((e) => e.name === n)!.data.toString("utf8");
    assert.equal(get("refs/scenes/market/master.png"), "png-market");
    const html = get("index.html");
    assert.ok(html.includes('src="refs/scenes/harbour/master.png"') && !html.includes(c.library), "links stay inside the zip");
    assert.ok(html.includes("broll-intro-drone_wide.mp4") && !html.includes("broll-verse-1-wide.mp4"), "the waiting card stays out");
    assert.ok(html.includes("Generate now: 2 shots, about 72 credits"));
    const cards = JSON.parse(get("cards.json")) as { uploads: { path: string | null }[] }[];
    assert.deepEqual(cards.flatMap((x) => x.uploads.map((u) => u.path)), ["refs/scenes/harbour/master.png", "refs/scenes/market/master.png"]);
    assert.match(get("README.txt"), /^Synthetic Three: Kling batch \(2 shots, about 72 credits\)/);
    assert.match(get("README.txt"), /npm run dance8 -- clips s3 ~\/Downloads\/s3/);
    assert.ok(lines.some((l) => /^zip: .*s3-kling\.zip \(2 shot\(s\), 2 file\(s\) to upload, 0\.0 MB\)$/.test(l)), lines.join("\n"));

    // Nothing to generate now: no zip, and the old one is left as it was.
    const before = readFileSync(zipFile);
    klingPack(c, "s3", { zip: true, budget: 1 });
    assert.ok(lines.some((l) => l.startsWith("zip: nothing to generate now")));
    assert.ok(readFileSync(zipFile).equals(before));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
