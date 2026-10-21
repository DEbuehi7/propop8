/**
 * Who sings which section (cast.json): the pure rules, then one synthetic
 * song end to end with a fake ElevenLabs. All audio is synthetic tones and
 * clicks written to a temp folder.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { spawnSync } from "node:child_process";
import { castRuns, sectionEdgeSec, starterCast, validateCast, type CastCue, type CastFile } from "../lib/stuttr/cast";
import {
  addSong, analyzeTrack, buildMaster, castCommand, castDrift, castMixPlan, convertCast, loadCast, loadManifest, mixCast, setMasterStatus, setVoiceStatus, type Ctx,
} from "../lib/stuttr/commands";
import { castVocals } from "../lib/dance8/authoring/castVoices";
import { planTrack, renderArgs } from "../lib/dance8/pipeline";
import type { ShotBrief } from "../lib/dance8/authoring/shotBriefs";
import type { CueMap, VocalPhrase } from "../lib/dance8/contracts/scene";
import type { Fetch } from "../lib/stuttr/elevenlabs";

const hasFfmpeg = spawnSync("ffmpeg", ["-version"]).status === 0;
const cues: CastCue[] = [
  { id: "intro", startBar: 0, endBar: 2 }, { id: "verse-1", startBar: 2, endBar: 8 }, { id: "chorus-1", startBar: 8, endBar: 12 },
  { id: "verse-2", startBar: 12, endBar: 14 }, { id: "outro", startBar: 14, endBar: 16 },
];
const castOf = (sections: CastFile["sections"]): CastFile => ({ schemaVersion: 1, trackId: "s", lang: "en", sections });
const sec = (id: string, lead: string | null, backing: string[] | "suno" = []) => ({ id, lead, backing });

test("cast: every section once, real voice names, and suno standing alone", () => {
  const ok = castOf(cues.map((q) => sec(q.id, "Stuttr")));
  assert.deepEqual(validateCast(ok, cues, "s"), []);
  const bad = castOf([
    sec("intro", null), sec("verse-1", "Stuttr"), sec("verse-1", "Mo"), sec("chorus-9", "Mo"),
    sec("verse-2", "Stu/ttr"), { id: "outro", lead: null, backing: ["M", "m"] },
  ]);
  const issues = validateCast({ ...bad, trackId: "other" }, cues, "s");
  for (const want of [/trackId is "other"/, /section "verse-1" is listed twice/, /section "chorus-9" is not in the cue map/, /verse-2 lead: "Stu\/ttr" is not a voice name/, /outro backing names a voice twice/, /section "chorus-1" is missing/]) {
    assert.ok(issues.some((i) => want.test(i)), `${want} in ${issues.join(" | ")}`);
  }
  assert.ok(validateCast(castOf([...cues.slice(1).map((q) => sec(q.id, null)), { id: "intro", lead: null, backing: ["suno"] }]), cues, "s").some((i) => /stands alone/.test(i)));
});

test("a change of singer falls on the quietest eighth note within a beat of the bar line", () => {
  const g = { firstDownbeatSec: 0, beatSec: 0.5, beatsPerBar: 4 as const };
  const db = Array.from({ length: 32 }, () => -20);
  assert.equal(sectionEdgeSec(db, 2, g), 3.875, "all equally loud: the eighth just before the line (closest, then earlier)");
  db[17] = -60;
  assert.equal(sectionEdgeSec(db, 2, g), 4.375, "a breath just after the line");
  db[14] = -Infinity;
  assert.equal(sectionEdgeSec(db, 2, g), 3.625, "silence beats a breath");
  assert.equal(sectionEdgeSec(null, 2, g), 4, "no loudness data: the bar line");
});

test("runs: one per stretch a voice sings, neighbours share their edge, backing gain by layers", () => {
  const a = { firstDownbeatSec: 0, beatSec: 0.5, beatsPerBar: 4 as const, eighthDb: { lead: null, backing: null } };
  const cast = castOf([sec("intro", null), sec("verse-1", "Stuttr"), sec("chorus-1", "Mo", ["M", "Ja"]), sec("verse-2", "Mo", ["Ja"]), sec("outro", "Stuttr", "suno")]);
  const runs = castRuns(cast, cues, a, 33);
  assert.deepEqual(runs.map((r) => [r.role, r.voice, r.key, r.startSec, r.endSec, r.gain]), [
    ["vocals", "Stuttr", "verse-1", 4, 16, 1],
    ["vocals", "Mo", "chorus-1--verse-2", 16, 28, 1],
    ["vocals", "Stuttr", "outro", 28, 33, 1],
    ["backing_vocals", "Ja", "chorus-1--verse-2", 16, 28, 0.707],
    ["backing_vocals", "M", "chorus-1", 16, 24, 0.707],
    ["backing_vocals", "suno", "outro", 28, 33, 1],
  ], "the last section runs to the song's end; Ja's run takes the smaller gain of its two sections");
  const starter = starterCast("s", cues, { beatsPerBar: 4, eighthDb: { lead: Array.from({ length: 128 }, (_, k) => (k >= 16 && k < 48 ? -20 : -80)), backing: Array.from({ length: 128 }, (_, k) => (k >= 64 && k < 96 ? -20 : -80)) } }, "Stuttr");
  assert.deepEqual(starter.sections.map((s) => [s.id, s.lead, s.backing]), [
    ["intro", null, []], ["verse-1", "Stuttr", []], ["chorus-1", null, "suno"], ["verse-2", null, []], ["outro", null, []],
  ]);
});

test("cue map singers: lines split where the singer changes, dropped where nobody sings that part, stable on rerun", () => {
  const vocals: VocalPhrase[] = [
    { id: "lead-1", voice: "Lead", startBar: 2, endBar: 6, text: "first" },
    { id: "lead-2", voice: "Lead", startBar: 10, endBar: 14, text: "second" },
    { id: "backing-1", voice: "Backing", startBar: 8, endBar: 12 },
    { id: "lead-3", voice: "Lead", startBar: 14, endBar: 15 },
  ];
  const cast = castOf([sec("intro", null), sec("verse-1", "Stuttr"), sec("chorus-1", "Mo", ["M", "Ja"]), sec("verse-2", "Stuttr"), sec("outro", null)]);
  const r = castVocals({ cues: cues as CueMap["cues"], vocals }, cast);
  assert.deepEqual(r.vocals.map((v) => [v.id, v.voice, v.startBar, v.endBar, v.text ?? null]), [
    ["lead-1", "Stuttr", 2, 6, "first"],
    ["backing-1", "M+Ja", 8, 12, null],
    ["lead-2a", "Mo", 10, 12, "second"],
    ["lead-2b", "Stuttr", 12, 14, null],
  ]);
  assert.deepEqual(r.dropped, ["lead-3"], "the outro has no lead in the cast");
  assert.deepEqual(castVocals({ cues: cues as CueMap["cues"], vocals: r.vocals }, cast).vocals, r.vocals);
  const suno = castVocals({ cues: cues as CueMap["cues"], vocals }, castOf(cues.map((q) => sec(q.id, "Stuttr", "suno"))));
  assert.equal(suno.vocals.find((v) => v.id === "backing-1")!.voice, "Backing");
});

/** 16-bit mono WAV of f(t). */
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

const TEST_KEY = "synthetic-test-key";
/** Converts by re-encoding the uploaded WAV as MP3, so lengths line up like a real take. */
function fakeEleven(posts: string[]): Fetch {
  const voices = [{ voice_id: "id-stuttr", name: "Stuttr" }, { voice_id: "id-mo", name: "Mo" }, { voice_id: "id-m", name: "M - Shenzhen Syndicate" }, { voice_id: "id-ja", name: "Ja" }];
  return async (url, init) => {
    if (url.endsWith("/v1/voices")) return new Response(JSON.stringify({ voices }));
    const form = init!.body as FormData;
    posts.push(`${decodeURIComponent(url.split("/v1/speech-to-speech/")[1].split("?")[0])} ${(form.get("audio") as File).name}`);
    const wavIn = Buffer.from(await (form.get("audio") as Blob).arrayBuffer());
    const r = spawnSync("ffmpeg", ["-v", "error", "-f", "wav", "-i", "pipe:0", "-c:a", "libmp3lame", "-b:a", "192k", "-f", "mp3", "pipe:1"], { input: wavIn, maxBuffer: 1 << 28 });
    return new Response(new Uint8Array(r.stdout));
  };
}

test("cast end to end: convert only what each voice sings, master from the cast, singers in the shot list", { skip: !hasFfmpeg && "ffmpeg not installed" }, async () => {
  const root = mkdtempSync(join(tmpdir(), "stuttr-cast-"));
  const lines: string[] = [];
  const c: Ctx = { library: join(root, "library"), now: () => "2026-10-21T00:00:00.000Z", log: (l) => lines.push(l) };
  try {
    // 120 BPM, 16 bars of 2 s: the lead sings bars 2-6 and 10-14, the backing bars 8-12.
    const dur = 33;
    const hit = (t: number, every: number, freq: number, amp: number, decay: number) => {
      const p = t % every;
      return p < 0.1 ? Math.sin(2 * Math.PI * freq * p) * Math.exp(-p / decay) * amp : 0;
    };
    const sing = (t: number, ranges: [number, number][], f: number) => (ranges.some(([a, b]) => t >= a * 2 && t < b * 2) ? 0.3 * Math.sin(2 * Math.PI * f * t) : 0);
    const triad = (t: number) => (t < 16 ? [261.63, 329.63, 392] : [220, 261.63, 329.63]).reduce((s, f) => s + 0.12 * Math.sin(2 * Math.PI * f * t), 0);
    const inbox = join(root, "inbox", "Cast Song");
    mkdirSync(inbox, { recursive: true });
    writeFileSync(join(inbox, "0 Lead Vocal.wav"), wavOf(dur, (t) => sing(t, [[2, 6], [10, 14]], 440)));
    writeFileSync(join(inbox, "1 Drum Kit.wav"), wavOf(dur, (t) => (t < 32 ? hit(t, 0.5, 60, 0.5, 0.03) + hit(t, 2, 60, 0.4, 0.03) + hit(t, 0.5, 2500, 0.2, 0.004) : 0)));
    writeFileSync(join(inbox, "2 Bass.wav"), wavOf(dur, (t) => (t < 32 ? hit(t, 2, 55, 0.6, 0.08) : 0)));
    writeFileSync(join(inbox, "3 Backing Vocals.wav"), wavOf(dur, (t) => sing(t, [[8, 12]], 550)));
    writeFileSync(join(inbox, "4 Piano.wav"), wavOf(dur, (t) => (t < 32 ? triad(t) : 0)));
    writeFileSync(join(inbox, "Cast Song.wav"), wavOf(dur, (t) => 0.5 * triad(t)));
    writeFileSync(join(inbox, "lyrics.txt"), "[Verse 1]\nfirst line\nsecond line\n[Hook]\nhook line\n[Verse 2]\nlast line\n");
    addSong(c, { folder: inbox });
    const id = "cast-song";
    assert.throws(() => castCommand(c, id), /run npm run stuttr -- analyze cast-song, then npm run dance8 -- plan cast-song/);
    analyzeTrack(c, id);
    const p = planTrack(c, id, { key: "C" });
    const yours = readFileSync(p.cuemap, "utf8");
    assert.deepEqual((JSON.parse(yours) as CueMap).cues.map((q) => q.id), ["intro", "verse-1", "chorus-1", "verse-2", "outro"]);

    // The starter cast: the lead where the lead stem sings, Suno's own backing where the backing stem sings.
    const starter = castCommand(c, id);
    assert.deepEqual(starter.sections.map((s) => [s.id, s.lead, s.backing]), [
      ["intro", null, []], ["verse-1", "Stuttr", []], ["chorus-1", "Stuttr", "suno"], ["verse-2", "Stuttr", []], ["outro", null, []],
    ]);
    // Mo takes the chorus lead; M and Ja replace Suno's backing there.
    const castPath = join(c.library, id, "cast.json");
    writeFileSync(castPath, JSON.stringify({ ...starter, sections: starter.sections.map((s) => (s.id === "chorus-1" ? { ...s, lead: "Mo", backing: ["M", "Ja"] } : s)) }, null, 2));
    lines.length = 0;
    castCommand(c, id);
    assert.ok(lines.some((l) => /^ {2}lead {4}Mo: chorus-1 \(0:1\d\.\d-0:2\d\.\d\)$/.test(l)), lines.join("\n"));

    // Dry run: cuts the parts and prices them; sends nothing to convert.
    const posts: string[] = [];
    const base = { trackId: id, key: TEST_KEY, fetch: fakeEleven(posts) };
    assert.deepEqual(await convertCast(c, { ...base, dry: true }), []);
    assert.equal(posts.length, 0);
    assert.ok(lines.some((l) => l.startsWith("would convert Stuttr lead verse-1 (") && l.includes("Mo lead chorus-1") && l.includes("M backing chorus-1") && l.endsWith(" credits")), lines.join("\n"));

    // Each voice converts only its own parts, each placed back at its time.
    const takes = await convertCast(c, base);
    assert.deepEqual(takes.map((t) => t.path), [
      `${id}/voices/stuttr.en.verse-1.mp3`, `${id}/voices/mo.en.chorus-1.mp3`, `${id}/voices/stuttr.en.verse-2.mp3`,
      `${id}/voices/ja.en.backing.chorus-1.mp3`, `${id}/voices/m.en.backing.chorus-1.mp3`,
    ]);
    assert.deepEqual(posts.map((x) => x.split(" ")[0]), ["id-stuttr", "id-mo", "id-stuttr", "id-ja", "id-m"]);
    for (const t of takes) {
      assert.equal(t.timingOk, true, `${t.voice} ${t.section} timing ${t.timingDeltaMs} ms`);
      assert.ok(t.runSec && (t.startSec ?? 0) >= t.runSec[0] - 1e-9 && (t.startSec ?? 0) + (t.durationSec ?? 0) <= t.runSec[1] + 0.06, `${t.voice} ${t.section} inside its run`);
    }
    const verse1 = takes[0];
    assert.ok(verse1.startSec! > 3.4 && verse1.startSec! < 4.1 && verse1.durationSec! < 9.5, `verse-1 trimmed to the singing: ${verse1.startSec} + ${verse1.durationSec}`);
    assert.equal(takes[1].runSec![0], verse1.runSec![1], "Mo starts exactly where Stuttr's verse ends");
    assert.deepEqual(await convertCast(c, base), [], "running it again spends nothing");
    assert.equal(posts.length, 5);

    // The master waits for approval of every part; the listening mix doesn't.
    assert.throws(() => buildMaster(c, { trackId: id }), /needs an approved take, made for this cast, for every part: Stuttr lead verse-1: draft/);
    const mixRel = mixCast(c, id);
    assert.ok(existsSync(join(c.library, mixRel)));
    assert.throws(() => setVoiceStatus(c, id, "Stuttr", "en", "approved", "vocals", "chorus-1"), /no Stuttr \(en\) lead take for chorus-1/);
    setVoiceStatus(c, id, "Stuttr", "en", "approved");
    assert.deepEqual(loadManifest(c).tracks[0].voices.filter((v) => v.voice === "Stuttr").map((v) => [v.section, v.status]), [["verse-1", "approved"], ["verse-2", "approved"]], "approve covers every part of that voice");
    setVoiceStatus(c, id, "Mo", "en", "approved");
    setVoiceStatus(c, id, "M", "en", "approved", "backing_vocals");
    setVoiceStatus(c, id, "Ja", "en", "approved", "backing_vocals");

    const master = buildMaster(c, { trackId: id });
    assert.deepEqual(master.parts!.map((x) => [x.voice, x.section]), [["Stuttr", "verse-1"], ["Mo", "chorus-1"], ["Stuttr", "verse-2"]]);
    assert.deepEqual(master.backing.map((x) => [x.voice, x.section]), [["Ja", "chorus-1"], ["M", "chorus-1"]]);
    assert.deepEqual([master.lead, master.sunoBacking, master.castPins!.map((x) => x.path)], [null, [], [`${id}/cast.json`, `${id}/dance8/${id}.cuemap.json`]]);
    assert.ok(Math.abs(master.durationSec! - dur) < 0.001 && Math.abs(master.lengthDeltaMs!) <= 1);
    assert.ok(lines.includes("cast: Stuttr verse-1, Mo chorus-1, Stuttr verse-2"));

    // What goes into it: the beds whole, each take cut to its own run and placed at its time.
    const t0 = loadManifest(c).tracks[0];
    const plan = castMixPlan(c.library, t0, loadCast(c, t0)!, true);
    assert.deepEqual(plan.problems, []);
    const voiced = plan.inputs.filter((x) => x.cut);
    assert.equal(voiced.length, 5);
    for (const x of voiced) {
      const take = t0.voices.find((v) => join(c.library, v.path) === x.path)!;
      assert.equal(x.delayMs, Math.round((take.startSec ?? 0) * 1000));
      assert.ok(x.cut!.durSec <= take.runSec![1] - (take.startSec ?? 0) + 1e-6, `${take.voice} ${take.section} never runs past its part`);
    }
    assert.deepEqual(voiced.filter((x) => x.path.includes(".backing.")).map((x) => x.gain), [0.707, 0.707]);

    // plan: the shot list is per singer; your cue map is left as it was.
    lines.length = 0;
    planTrack(c, id, { key: "C" });
    assert.equal(readFileSync(p.cuemap, "utf8"), yours, "your cue map is never changed");
    const castMap = JSON.parse(readFileSync(p.castCuemap, "utf8")) as CueMap;
    assert.deepEqual(castMap.vocals!.map((v) => [v.id, v.voice, v.startBar, v.endBar]), [
      ["lead-1", "Stuttr", 2, 6], ["backing-1", "M+Ja", 7, 12], ["lead-2a", "Mo", 9, 12], ["lead-2b", "Stuttr", 12, 14],
    ]);
    const briefs = JSON.parse(readFileSync(p.briefs, "utf8")) as ShotBrief[];
    const singers = [...new Set(briefs.filter((b) => b.kind === "lip_sync").map((b) => `${b.cueId}:${b.voice}`))].sort();
    assert.deepEqual(singers, ["chorus-1:M+Ja", "chorus-1:Mo", "verse-1:Stuttr", "verse-2:Stuttr"]);
    assert.match(readFileSync(p.readme, "utf8"), /cuemap\.cast\.json {3}the same with the singers from cast\.json: Stuttr, M\+Ja, Mo/);
    for (const m of ["stuttr.en.verse-1", "mo.en.chorus-1", "m.en.backing.chorus-1"]) assert.ok(existsSync(join(p.dir, `${id}.${m}.mouth.json`)), `${m} mouth track`);

    // The render plays the cast master over the cast cue map. A scene edit leaves the master
    // as it is; a cast edit makes it out of date until it is rebuilt and approved again.
    setMasterStatus(c, id, "en", "approved");
    const ra = renderArgs(c, id, { approved: true });
    assert.equal(ra.args[0], p.castCuemap);
    assert.deepEqual([ra.audio.key, ra.audio.status], ["en", "approved"]);
    const edited = JSON.parse(yours) as CueMap;
    edited.cues[0].sceneId = "harbour";
    writeFileSync(p.cuemap, JSON.stringify(edited));
    assert.equal(castDrift(c, loadManifest(c).tracks[0].masters![0]), null, "scenes and sung lines don't touch the audio");
    const cast2 = JSON.parse(readFileSync(castPath, "utf8")) as CastFile;
    writeFileSync(castPath, JSON.stringify({ ...cast2, sections: cast2.sections.map((s) => (s.id === "verse-2" ? { ...s, lead: "Mo" } : s)) }, null, 2));
    assert.throws(() => renderArgs(c, id, { approved: true }), /can't be used in a final: cast\.json changed since it was built/);
    assert.throws(() => setMasterStatus(c, id, "en", "approved"), /cast\.json changed since it was built/);
    // Mo now sings the chorus and verse 2 in one run: a new part to convert; nothing else is spent.
    posts.length = 0;
    const more = await convertCast(c, base);
    assert.deepEqual(more.map((t) => [t.voice, t.section]), [["Mo", "chorus-1--verse-2"]]);
    assert.equal(posts.length, 1);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
