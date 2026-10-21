/**
 * Stuttr song library: file roles, WAV headers, copy-in, voice takes, mixes.
 * All audio here is synthetic tones written to a temp folder.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  activeSpan, classifyFolder, lengthWarnings, masterProblem, parseWav, pickMaster, roleFromName, sharedPrefix, slugify, stemDownloadParts, timingCheck,
  type LibraryFile, type LibraryTrack, type VoiceMaster, type VoiceTake,
} from "../lib/stuttr/library";
import {
  addSong, addVoice, buildMaster, convertVoices, loadManifest, mixVoice, mouthTrack, prepVoice, setMasterStatus, setVoiceStatus, type Ctx,
} from "../lib/stuttr/commands";
import { matchVoice, type Fetch } from "../lib/stuttr/elevenlabs";
import { checkMouthTrack } from "../lib/dance8/authoring/mouthTrack";
import type { MouthTrack } from "../lib/dance8/contracts/mouth";

/** A PCM WAV of a sine tone. */
function wav(opts: { sec: number; rate?: number; ch?: number; bits?: 16 | 24; freq?: number; extraChunk?: boolean }): Buffer {
  const rate = opts.rate ?? 48000, ch = opts.ch ?? 2, bits = opts.bits ?? 16, bps = bits / 8;
  const frames = Math.round(opts.sec * rate);
  const data = Buffer.alloc(frames * ch * bps);
  for (let i = 0; i < frames; i++) {
    const v = Math.round(Math.sin((2 * Math.PI * (opts.freq ?? 440) * i) / rate) * 0.3 * (bits === 16 ? 32767 : 8388607));
    for (let c = 0; c < ch; c++) {
      const o = (i * ch + c) * bps;
      if (bits === 16) data.writeInt16LE(v, o);
      else data.writeIntLE(v, o, 3);
    }
  }
  const fmt = Buffer.alloc(24);
  fmt.write("fmt ", 0, "ascii"); fmt.writeUInt32LE(16, 4); fmt.writeUInt16LE(1, 8); fmt.writeUInt16LE(ch, 10);
  fmt.writeUInt32LE(rate, 12); fmt.writeUInt32LE(rate * ch * bps, 16); fmt.writeUInt16LE(ch * bps, 20); fmt.writeUInt16LE(bits, 22);
  const list = opts.extraChunk ? Buffer.concat([Buffer.from("LIST", "ascii"), Buffer.from([5, 0, 0, 0]), Buffer.from("INFOx\0", "ascii")]) : Buffer.alloc(0);
  const dh = Buffer.alloc(8);
  dh.write("data", 0, "ascii"); dh.writeUInt32LE(data.length, 4);
  const body = Buffer.concat([Buffer.from("WAVE", "ascii"), fmt, list, dh, data]);
  const riff = Buffer.alloc(8);
  riff.write("RIFF", 0, "ascii"); riff.writeUInt32LE(body.length, 4);
  return Buffer.concat([riff, body]);
}

const sha = (p: string) => createHash("sha256").update(readFileSync(p)).digest("hex");
const hasFfmpeg = spawnSync("ffmpeg", ["-version"]).status === 0;

function sandbox() {
  const root = mkdtempSync(join(tmpdir(), "stuttr-lib-"));
  const inbox = join(root, "inbox", "Bass Drop Anthem");
  mkdirSync(inbox, { recursive: true });
  writeFileSync(join(inbox, "Bass Drop Anthem (Full Song).wav"), wav({ sec: 2 }));
  writeFileSync(join(inbox, "Bass Drop Anthem (Vocals).wav"), wav({ sec: 2, freq: 330 }));
  writeFileSync(join(inbox, "Bass Drop Anthem (Backing Vocals).wav"), wav({ sec: 2, freq: 550 }));
  writeFileSync(join(inbox, "Bass Drop Anthem (Drums).wav"), wav({ sec: 2, freq: 110 }));
  writeFileSync(join(inbox, "Bass Drop Anthem (Synth).wav"), wav({ sec: 2, freq: 660 }));
  writeFileSync(join(inbox, "lyrics.txt"), "Synthetic lyric line one\n");
  const lines: string[] = [];
  const ctx: Ctx = { library: join(root, "library"), now: () => "2026-10-16T00:00:00.000Z", log: (l) => lines.push(l) };
  return { root, inbox, ctx, lines, done: () => rmSync(root, { recursive: true, force: true }) };
}

test("slugify and roles from file names", () => {
  assert.equal(slugify("C.L.O.Y.N.E."), "cloyne");
  assert.equal(slugify("Three Laps (9.3)"), "three-laps-93");
  assert.equal(slugify("Coquí"), "coqui");
  assert.deepEqual(roleFromName("Song (Vocals).wav"), { role: "vocals" });
  assert.deepEqual(roleFromName("Song (Backing Vocals).wav"), { role: "backing_vocals" });
  assert.deepEqual(roleFromName("Song (Instrumental).wav"), { role: "instrumental" });
  assert.deepEqual(roleFromName("Song (Drums).wav"), { role: "stem", stemName: "drums" });
  assert.deepEqual(roleFromName("Song.wav"), { role: "full_mix" });
  assert.deepEqual(roleFromName("lyrics.txt"), { role: "lyrics" });
  assert.deepEqual(roleFromName("cover.png"), { role: "unclassified" });
  assert.deepEqual(roleFromName("1. Song Style.txt"), { role: "unclassified" });
  assert.deepEqual(roleFromName("prompt.txt"), { role: "unclassified" });
  const { warnings } = classifyFolder(["Song.wav", "Song Lyrics.rtf", "Song Style.rtf"]);
  assert.ok(warnings.some((w) => w.includes("Song Lyrics.rtf is rich text")));
  assert.ok(!warnings.some((w) => w.includes("Song Style.rtf")));
});

test("a song title with a stem word is not mistaken for a stem", () => {
  assert.equal(sharedPrefix(["Bass Drop Anthem (Full Song)", "Bass Drop Anthem (Vocals)"]), "Bass Drop Anthem (");
  const { roles, warnings } = classifyFolder(["Bass Drop Anthem (Full Song).wav", "Bass Drop Anthem (Vocals).wav", "Bass Drop Anthem (Drums).wav"]);
  assert.equal(roles.get("Bass Drop Anthem (Full Song).wav")!.role, "full_mix");
  assert.equal(roles.get("Bass Drop Anthem (Drums).wav")!.stemName, "drums");
  assert.deepEqual(warnings, []);
});

test("two unnamed mixes stay unclassified with a warning", () => {
  const { roles, warnings } = classifyFolder(["take one.wav", "take two.wav"]);
  assert.equal(roles.get("take one.wav")!.role, "unclassified");
  assert.ok(warnings.some((w) => w.includes("more than one possible full mix")));
});

test("Suno stem download names: <part>_<title>, a click track, and the bare title as the full mix", () => {
  const names = [
    "1. Bass Drop, One Accent.wav",
    "bass_1. Bass Drop, One Accent.mp3",
    "click_1. Bass Drop, One Accent.mp3",
    "drums_1. Bass Drop, One Accent.mp3",
    "other_1. Bass Drop, One Accent.mp3",
    "vocals_1. Bass Drop, One Accent.mp3",
    "lyrics.txt",
  ];
  const { roles, warnings } = classifyFolder(names);
  assert.equal(roles.get("1. Bass Drop, One Accent.wav")!.role, "full_mix");
  assert.equal(roles.get("vocals_1. Bass Drop, One Accent.mp3")!.role, "vocals");
  assert.deepEqual(roles.get("bass_1. Bass Drop, One Accent.mp3"), { role: "stem", stemName: "bass" });
  assert.deepEqual(roles.get("click_1. Bass Drop, One Accent.mp3"), { role: "stem", stemName: "click" });
  assert.deepEqual(roles.get("other_1. Bass Drop, One Accent.mp3"), { role: "stem", stemName: "other" });
  assert.equal(roles.get("lyrics.txt")!.role, "lyrics");
  assert.ok(!warnings.some((w) => w.includes("full mix")), warnings.join("; "));
  assert.ok(!warnings.some((w) => w.includes("role unknown")), warnings.join("; "));
});

test("Suno Studio Multitrack names: '<n> <Part>.wav' are all parts, never the full mix", () => {
  const names = [
    "0 Lead Vocal.wav", "1 Drum Kit.wav", "2 Bass.wav", "3 Backing Vocals.wav", "7 String Section.wav",
    "10 Sound Effects.wav", "15 Organ.wav", "21 Keyboards.wav", "4 Piano.wav", "5 Electric Guitar.wav",
    "6 Percussion.wav", "8 Synth.wav", "9 Acoustic Guitar.wav", "11 Synth Pad.wav", "12 Synth Bass.wav",
    "13 Guitar.wav", "14 Brass Section.wav", "16 Lead Electric Guitar.wav", "17 Synth Keys.wav",
    "18 Rhythm Electric Guitar.wav", "19 Electric Piano.wav", "20 Upright Bass.wav",
    "Bass Drop Anthem.wav", "lyrics.txt", "style.txt",
  ];
  const { roles, warnings } = classifyFolder(names);
  assert.equal(roles.get("0 Lead Vocal.wav")!.role, "vocals");
  assert.equal(roles.get("3 Backing Vocals.wav")!.role, "backing_vocals");
  assert.deepEqual(roles.get("1 Drum Kit.wav"), { role: "stem", stemName: "drums" });
  assert.deepEqual(roles.get("15 Organ.wav"), { role: "stem", stemName: "organ" });
  assert.deepEqual(roles.get("10 Sound Effects.wav"), { role: "stem", stemName: "sound-effects" });
  assert.deepEqual(roles.get("21 Keyboards.wav"), { role: "stem", stemName: "keyboards" });
  assert.deepEqual(roles.get("7 String Section.wav"), { role: "stem", stemName: "string-section" });
  assert.equal(roles.get("16 Lead Electric Guitar.wav")!.stemName, "guitar");
  assert.equal(roles.get("Bass Drop Anthem.wav")!.role, "full_mix");
  assert.equal(roles.get("lyrics.txt")!.role, "lyrics");
  assert.equal(roles.get("style.txt")!.role, "unclassified");
  assert.deepEqual(warnings, []);
  // A title that starts with a number outside the run from 0 stays the full mix.
  assert.equal(classifyFolder(["0 Lead Vocal.wav", "1 Drum Kit.wav", "99 Problems.wav"]).roles.get("99 Problems.wav")!.role, "full_mix");
  // Old 15-second previews left next to the Studio export: two lead vocals is flagged.
  const mixed = classifyFolder([...names, "vocals_Bass Drop Anthem.mp3", "drums_Bass Drop Anthem.mp3"]);
  assert.ok(mixed.warnings.some((w) => w.startsWith("more than one lead vocal file")), mixed.warnings.join("; "));
});

test("names that only look like <part>_<title> keep the old rules", () => {
  assert.equal(stemDownloadParts(["lead_vox.wav", "bass_vox.wav"]), null);
  assert.equal(stemDownloadParts(["vocals_Song A.wav", "drums_Song B.wav"]), null);
  assert.equal(stemDownloadParts(["vocals_Song.wav", "drums_Song.wav", "Song (Full).wav"]), null);
  const { roles } = classifyFolder(["lead_vox.wav", "bass_vox.wav"]);
  assert.equal(roles.get("lead_vox.wav")!.role, "vocals");
  assert.equal(roles.get("bass_vox.wav")!.role, "vocals");
});

test("a stem much shorter than the full mix is flagged as a preview", () => {
  const s = sandbox();
  try {
    const inbox = join(s.root, "inbox", "Preview Song");
    mkdirSync(inbox, { recursive: true });
    writeFileSync(join(inbox, "Preview Song.wav"), wav({ sec: 3 }));
    writeFileSync(join(inbox, "vocals_Preview Song.wav"), wav({ sec: 1, freq: 330 }));
    writeFileSync(join(inbox, "drums_Preview Song.wav"), wav({ sec: 3, freq: 110 }));
    addSong(s.ctx, { folder: inbox, dry: true });
    const flagged = s.lines.filter((l) => l.includes("looks like a preview"));
    assert.equal(flagged.length, 1);
    assert.ok(flagged[0].includes("vocals_Preview Song.wav is 1.0 s but the full mix is 3.0 s"));
    assert.equal(lengthWarnings([{ role: "full_mix", path: "x", originalName: "x", sha256: "", bytes: 0 }]).length, 0);
  } finally {
    s.done();
  }
});

test("WAV headers: rate, channels, bits and length, with an extra chunk before data", () => {
  const a = wav({ sec: 1.5 });
  assert.deepEqual(parseWav(a, a.length), { format: "wav", lossy: false, sampleRate: 48000, channels: 2, bitsPerSample: 16, durationSec: 1.5 });
  const b = wav({ sec: 0.25, rate: 44100, ch: 1, bits: 24, extraChunk: true });
  const info = parseWav(b, b.length)!;
  assert.equal(info.bitsPerSample, 24);
  assert.equal(info.channels, 1);
  assert.equal(info.durationSec, 0.25);
  assert.equal(parseWav(Buffer.from("not a wav file at all"), 21), null);
});

test("timing check uses a 50 ms tolerance", () => {
  assert.deepEqual(timingCheck(180, 180.04), { deltaMs: 40, ok: true });
  assert.deepEqual(timingCheck(180, 180.2), { deltaMs: 200, ok: false });
  assert.deepEqual(timingCheck(null, 180), { deltaMs: null, ok: false });
});

test("add copies a song in, leaves the originals untouched, and is safe to re-run", () => {
  const s = sandbox();
  try {
    const before = sha(join(s.inbox, "Bass Drop Anthem (Vocals).wav"));
    const t = addSong(s.ctx, { folder: s.inbox, sunoPlan: "Pro" });
    assert.equal(t.trackId, "bass-drop-anthem");
    assert.deepEqual(t.files.map((f) => (f.role === "stem" ? `stem:${f.stemName}` : f.role)).sort(),
      ["backing_vocals", "full_mix", "lyrics", "stem:drums", "stem:synth", "vocals"]);
    const mix = t.files.find((f) => f.role === "full_mix")!;
    assert.equal(mix.audio!.durationSec, 2);
    assert.equal(mix.sha256, sha(join(s.inbox, "Bass Drop Anthem (Full Song).wav")));
    assert.ok(existsSync(join(s.ctx.library, mix.path)));
    assert.equal(sha(join(s.inbox, "Bass Drop Anthem (Vocals).wav")), before, "original unchanged");

    const again = addSong(s.ctx, { folder: s.inbox });
    assert.equal(again.files.length, 6);
    assert.equal(again.sunoPlan, "Pro");
    assert.equal(loadManifest(s.ctx).tracks.length, 1);

    // A changed export under the same name is refused, and nothing is overwritten.
    writeFileSync(join(s.inbox, "Bass Drop Anthem (Vocals).wav"), wav({ sec: 2, freq: 335 }));
    assert.throws(() => addSong(s.ctx, { folder: s.inbox }), /different content/);
    assert.equal(sha(join(s.ctx.library, "bass-drop-anthem/source/Bass Drop Anthem (Vocals).wav")), before);
  } finally {
    s.done();
  }
});

test("dry run writes nothing", () => {
  const s = sandbox();
  try {
    addSong(s.ctx, { folder: s.inbox, dry: true });
    assert.equal(existsSync(join(s.ctx.library, "library.json")), false);
    assert.ok(s.lines.some((l) => l.startsWith("would copy")));
  } finally {
    s.done();
  }
});

test("add-voice registers a take and checks its timing against the vocal stem", () => {
  const s = sandbox();
  try {
    addSong(s.ctx, { folder: s.inbox });
    const good = join(s.root, "stuttr-take.wav");
    writeFileSync(good, wav({ sec: 2, rate: 44100, ch: 1 }));
    const take = addVoice(s.ctx, { trackId: "bass-drop-anthem", voice: "Stuttr", file: good });
    assert.equal(take.path, "bass-drop-anthem/voices/stuttr.en.wav");
    assert.equal(take.timingDeltaMs, 0);
    assert.equal(take.timingOk, true);
    assert.equal(take.status, "draft");

    const late = join(s.root, "mo-take.wav");
    writeFileSync(late, wav({ sec: 2.2, rate: 44100, ch: 1 }));
    const off = addVoice(s.ctx, { trackId: "bass-drop-anthem", voice: "Mo", file: late, lang: "es" });
    assert.equal(off.path, "bass-drop-anthem/voices/mo.es.wav");
    assert.equal(off.timingOk, false);
    assert.ok(s.lines.some((l) => l.includes("timing is off by 200 ms")));
    assert.throws(() => setVoiceStatus(s.ctx, "bass-drop-anthem", "Mo", "es", "approved"), /cannot be approved/);
    assert.equal(setVoiceStatus(s.ctx, "bass-drop-anthem", "Stuttr", "en", "approved").status, "approved");
    assert.deepEqual(loadManifest(s.ctx).tracks[0].voices.map((v) => [v.voice, v.lang, v.status]), [["Mo", "es", "draft"], ["Stuttr", "en", "approved"]]);
  } finally {
    s.done();
  }
});

/** A mono 16-bit 44.1 kHz WAV of tone and silence segments, e.g. [[1, 0], [1, 440], [1, 0]]; amplitude defaults to 0.3. */
function wavSegments(parts: [sec: number, freq: number, amp?: number][]): Buffer {
  const rate = 44100;
  const chunks = parts.map(([sec, freq, amp = 0.3]) => {
    const n = Math.round(sec * rate);
    const b = Buffer.alloc(n * 2);
    for (let i = 0; i < n; i++) b.writeInt16LE(freq ? Math.round(Math.sin((2 * Math.PI * freq * i) / rate) * amp * 32767) : 0, i * 2);
    return b;
  });
  const data = Buffer.concat(chunks);
  const h = Buffer.alloc(44);
  h.write("RIFF", 0, "ascii"); h.writeUInt32LE(36 + data.length, 4); h.write("WAVE", 8, "ascii");
  h.write("fmt ", 12, "ascii"); h.writeUInt32LE(16, 16); h.writeUInt16LE(1, 20); h.writeUInt16LE(1, 22);
  h.writeUInt32LE(rate, 24); h.writeUInt32LE(rate * 2, 28); h.writeUInt16LE(2, 32); h.writeUInt16LE(16, 34);
  h.write("data", 36, "ascii"); h.writeUInt32LE(data.length, 40);
  return Buffer.concat([h, data]);
}

test("active span from window loudness: faint bleed and clicks are ignored, gaps kept, padded and clamped", () => {
  // 100 ms windows over 20 s: -55 dB bleed, a 0.2 s click at 3 s, singing 6-9 s and 12-14 s.
  const db = Array.from({ length: 200 }, () => -55);
  db[30] = db[31] = -20;
  for (let i = 60; i < 90; i++) db[i] = -18;
  for (let i = 120; i < 140; i++) db[i] = -25;
  assert.deepEqual(activeSpan(db, 0.1, 20), { startSec: 5.5, endSec: 14.5 });
  assert.deepEqual(activeSpan(db, 0.1, 20, { minRunSec: 0.2 }), { startSec: 2.5, endSec: 14.5 }, "a shorter minimum lets the click count");
  assert.deepEqual(activeSpan(db.map(() => -10), 0.1, 20), { startSec: 0, endSec: 20 }, "loud throughout: the whole file");
  assert.equal(activeSpan(db.map(() => -Infinity), 0.1, 20), null, "silent all the way");
  assert.equal(activeSpan(db.map(() => -45), 0.1, 20), null, "bleed alone is not singing");
});

test("four voices on the backing stem: trimmed prep, takes placed at the span, layered in the mix", { skip: !hasFfmpeg && "ffmpeg not installed" }, () => {
  const s = sandbox();
  try {
    // Backing vocal: 1 s of faint bleed (peaks -42 dB, RMS -45 dB, as Suno stems have), 1 s shout, 1 s bleed.
    const inbox = join(s.root, "inbox", "Shout Song");
    mkdirSync(inbox, { recursive: true });
    writeFileSync(join(inbox, "Shout Song (Full Song).wav"), wav({ sec: 3 }));
    writeFileSync(join(inbox, "Shout Song (Vocals).wav"), wav({ sec: 3, freq: 330 }));
    writeFileSync(join(inbox, "Shout Song (Backing Vocals).wav"), wavSegments([[1, 200, 0.008], [1, 550], [1, 200, 0.008]]));
    writeFileSync(join(inbox, "Shout Song (Drums).wav"), wav({ sec: 3, freq: 110 }));
    addSong(s.ctx, { folder: inbox });

    const rel = prepVoice(s.ctx, "shout-song", "backing_vocals");
    const prepped = readFileSync(join(s.ctx.library, rel));
    const pi = parseWav(prepped, prepped.length)!;
    assert.ok(Math.abs(pi.durationSec! - 2) < 0.05, `prepped ${pi.durationSec} s, expected about 2 s (0.5-2.5)`);
    const prep = loadManifest(s.ctx).tracks[0].preps!.find((p) => p.role === "backing_vocals")!;
    assert.ok(Math.abs(prep.startSec - 0.5) < 0.05, `starts at ${prep.startSec}`);
    assert.ok(s.lines.some((l) => l.includes("of the song") && l.includes("credits per voice")));

    // The lead take, then one backing take per shouting voice, each as long as the prepped span.
    const lead = join(s.root, "lead.wav");
    writeFileSync(lead, wav({ sec: 3, rate: 44100, ch: 1 }));
    addVoice(s.ctx, { trackId: "shout-song", voice: "Stuttr", file: lead });
    for (const [voice, freq] of [["Stuttr", 500], ["M", 400], ["Ja", 600], ["Bo", 700]] as const) {
      const f = join(s.root, `${voice}-shout.wav`);
      writeFileSync(f, wavSegments([[prep.durationSec, freq]]));
      const take = addVoice(s.ctx, { trackId: "shout-song", voice, file: f, from: "backing_vocals" });
      assert.equal(take.timingOk, true, `${voice} timing`);
      assert.ok(Math.abs((take.startSec ?? 0) - prep.startSec) < 1e-9);
      assert.equal(take.path, `shout-song/voices/${voice.toLowerCase()}.en.backing.wav`);
    }
    // Approve/reject address the backing take, not the lead.
    setVoiceStatus(s.ctx, "shout-song", "Bo", "en", "rejected", "backing_vocals");
    const voices = loadManifest(s.ctx).tracks[0].voices;
    assert.equal(voices.find((v) => v.voice === "Stuttr" && v.sourceRole === "vocals")!.status, "draft");

    const mixRel = mixVoice(s.ctx, "shout-song", "Stuttr");
    assert.ok(s.lines.some((l) => l === "backing: Ja, M, Stuttr layered at 0.577x each"), s.lines.join("\n"));
    const mixed = readFileSync(join(s.ctx.library, mixRel));
    const mi = parseWav(mixed, mixed.length)!;
    assert.ok(Math.abs(mi.durationSec! - 3) < 0.02, `mix ${mi.durationSec} s`);

    // A converted full stem still lines up: it is compared with the whole stem and placed at 0.
    const full = join(s.root, "Ja-full.wav");
    writeFileSync(full, wavSegments([[3, 600]]));
    const t2 = addVoice(s.ctx, { trackId: "shout-song", voice: "Ja", file: full, from: "backing_vocals", lang: "es" });
    assert.equal(t2.timingOk, true);
    assert.equal(t2.startSec, undefined);

    mixVoice(s.ctx, "shout-song", "Stuttr", "en", true, { sunoBacking: true });
    assert.ok(s.lines.includes("backing: Suno's backing vocals"));
  } finally {
    s.done();
  }
});

test("mouth track: approved takes only, one value per 24 fps frame, written under dance8/", { skip: !hasFfmpeg && "ffmpeg not installed" }, () => {
  const s = sandbox();
  try {
    const inbox = join(s.root, "inbox", "Mouth Song");
    mkdirSync(inbox, { recursive: true });
    writeFileSync(join(inbox, "Mouth Song (Full Song).wav"), wav({ sec: 3 }));
    writeFileSync(join(inbox, "Mouth Song (Vocals).wav"), wav({ sec: 3, freq: 330 }));
    writeFileSync(join(inbox, "Mouth Song (Drums).wav"), wav({ sec: 3, freq: 110 }));
    addSong(s.ctx, { folder: inbox });
    const lead = join(s.root, "lead.wav");
    writeFileSync(lead, wavSegments([[1, 0], [1, 300], [1, 0]]));
    addVoice(s.ctx, { trackId: "mouth-song", voice: "Stuttr", file: lead });
    assert.throws(() => mouthTrack(s.ctx, "mouth-song", "Stuttr"), /approved takes only/);
    setVoiceStatus(s.ctx, "mouth-song", "Stuttr", "en", "approved");
    const rel = mouthTrack(s.ctx, "mouth-song", "Stuttr");
    assert.equal(rel, join("mouth-song", "dance8", "mouth-song.stuttr.en.mouth.json"));
    const t = JSON.parse(readFileSync(join(s.ctx.library, rel), "utf8")) as MouthTrack;
    assert.deepEqual(checkMouthTrack(t), []);
    assert.equal(t.open.length, 72);
    assert.equal(t.startSec, 0);
    assert.equal(t.open[12], 0);
    assert.ok(t.open[36] >= 0.99, String(t.open[36]));
    assert.equal(t.open[60], 0);
    assert.ok(s.lines.some((l) => l.startsWith("mouth track: ") && l.includes("72 frames at 24 fps")));
  } finally {
    s.done();
  }
});

// ---- convert: a fake ElevenLabs. The key is synthetic; nothing reaches the network.
const TEST_KEY = "synthetic-test-key";
const TEST_VOICES = [
  { voice_id: "id-stuttr", name: "Stuttr" },
  { voice_id: "id-m", name: "M - Shenzhen Syndicate" },
  { voice_id: "id-mo", name: "Mo" },
  { voice_id: "id-ja", name: "Ja" },
];
/** Converts by re-encoding the uploaded WAV as MP3, so lengths line up like a real take. */
function fakeEleven(calls: { method: string; url: string; model?: string; voiceId?: string }[], fail?: number): Fetch {
  return async (url, init) => {
    const headers = (init?.headers ?? {}) as Record<string, string>;
    if (headers["xi-api-key"] !== TEST_KEY) return new Response(JSON.stringify({ detail: { status: "invalid_api_key", message: "Invalid API key" } }), { status: 401 });
    if (url.endsWith("/v1/voices")) {
      calls.push({ method: "GET", url });
      return new Response(JSON.stringify({ voices: TEST_VOICES }));
    }
    const form = init!.body as FormData;
    const voiceId = decodeURIComponent(url.split("/v1/speech-to-speech/")[1].split("?")[0]);
    calls.push({ method: "POST", url, model: String(form.get("model_id")), voiceId });
    if (fail) return new Response(JSON.stringify({ detail: { message: "quota exceeded" } }), { status: fail });
    const wavIn = Buffer.from(await (form.get("audio") as Blob).arrayBuffer());
    const r = spawnSync("ffmpeg", ["-v", "error", "-f", "wav", "-i", "pipe:0", "-c:a", "libmp3lame", "-b:a", "192k", "-f", "mp3", "pipe:1"], { input: wavIn, maxBuffer: 1 << 28 });
    return new Response(new Uint8Array(r.stdout));
  };
}

test("voice names match exactly, or as a whole first word, never a longer name", () => {
  const vs = TEST_VOICES.map((v) => ({ voiceId: v.voice_id, name: v.name }));
  assert.equal(matchVoice(vs, "m").voiceId, "id-m");
  assert.equal(matchVoice(vs, "MO").voiceId, "id-mo");
  assert.equal(matchVoice(vs, "Stuttr").voiceId, "id-stuttr");
  assert.throws(() => matchVoice(vs, "Bo"), /no ElevenLabs voice named "Bo". Your voices: Ja, M - Shenzhen Syndicate, Mo, Stuttr/);
  assert.throws(() => matchVoice([...vs, { voiceId: "x", name: "M (alt)" }], "M"), /2 ElevenLabs voices match "M"/);
});

test("convert: one step from stem to placed takes, voices matched before any credits are spent", { skip: !hasFfmpeg && "ffmpeg not installed" }, async () => {
  const s = sandbox();
  try {
    const inbox = join(s.root, "inbox", "Convert Song");
    mkdirSync(inbox, { recursive: true });
    writeFileSync(join(inbox, "Convert Song (Full Song).wav"), wav({ sec: 3 }));
    writeFileSync(join(inbox, "Convert Song (Vocals).wav"), wav({ sec: 3, freq: 330 }));
    writeFileSync(join(inbox, "Convert Song (Backing Vocals).wav"), wavSegments([[1, 0], [1, 550], [1, 0]]));
    writeFileSync(join(inbox, "Convert Song (Drums).wav"), wav({ sec: 3, freq: 110 }));
    addSong(s.ctx, { folder: inbox });
    const calls: { method: string; url: string; model?: string; voiceId?: string }[] = [];
    const base = { trackId: "convert-song", key: TEST_KEY, fetch: fakeEleven(calls) };

    // No key: refused before anything is sent.
    const saved = process.env.ELEVENLABS_API_KEY;
    delete process.env.ELEVENLABS_API_KEY;
    await assert.rejects(convertVoices(s.ctx, { ...base, key: undefined, voices: ["Stuttr"] }), /ELEVENLABS_API_KEY is not set/);
    if (saved !== undefined) process.env.ELEVENLABS_API_KEY = saved;
    // A voice that doesn't exist: no conversion happens at all.
    await assert.rejects(convertVoices(s.ctx, { ...base, voices: ["Stuttr", "Bo"], from: "backing_vocals" }), /no ElevenLabs voice named "Bo"/);
    assert.equal(calls.filter((c) => c.method === "POST").length, 0);
    // Dry run: matches and estimates, converts nothing.
    assert.deepEqual(await convertVoices(s.ctx, { ...base, voices: ["Stuttr", "M"], from: "backing_vocals", dry: true }), []);
    assert.ok(s.lines.some((l) => l.startsWith('would convert the backing part as Stuttr, M ("M - Shenzhen Syndicate"): about ') && l.endsWith(" credits")), s.lines.join("\n"));
    assert.equal(calls.filter((c) => c.method === "POST").length, 0);

    // The lead, then two backing voices.
    const [lead] = await convertVoices(s.ctx, { ...base, voices: ["Stuttr"] });
    assert.equal(lead.path, "convert-song/voices/stuttr.en.mp3");
    assert.equal(lead.timingOk, true, `lead timing ${lead.timingDeltaMs} ms`);
    const backing = await convertVoices(s.ctx, { ...base, voices: ["Stuttr", "m"], from: "backing_vocals" });
    assert.deepEqual(backing.map((t) => t.path), ["convert-song/voices/stuttr.en.backing.mp3", "convert-song/voices/m.en.backing.mp3"]);
    for (const t of backing) {
      assert.equal(t.timingOk, true, `${t.voice} timing ${t.timingDeltaMs} ms`);
      assert.ok(Math.abs((t.startSec ?? 0) - 0.5) < 0.05, `${t.voice} placed at ${t.startSec}`);
    }
    const posts = calls.filter((c) => c.method === "POST");
    assert.deepEqual(posts.map((c) => c.voiceId), ["id-stuttr", "id-stuttr", "id-m"]);
    assert.ok(posts.every((c) => c.model === "eleven_multilingual_sts_v2" && c.url.endsWith("?output_format=mp3_44100_192")));
    assert.ok(s.lines.includes("next: listen with  npm run stuttr -- mix convert-song Stuttr"));

    // Running it again spends nothing.
    assert.deepEqual(await convertVoices(s.ctx, { ...base, voices: ["Stuttr", "M"], from: "backing_vocals" }), []);
    assert.equal(calls.filter((c) => c.method === "POST").length, 3);

    // An API error says what happened and never shows the key.
    const err = await convertVoices(s.ctx, { ...base, fetch: fakeEleven([], 429), voices: ["Ja"], from: "backing_vocals" }).catch((e: Error) => e);
    assert.ok(err instanceof Error && /ElevenLabs 429: quota exceeded \(too many requests, or out of credits\)/.test(err.message), String(err));
    const bad = await convertVoices(s.ctx, { ...base, key: "wrong-synthetic-key", voices: ["Ja"] }).catch((e: Error) => e);
    assert.ok(bad instanceof Error && bad.message.includes("ElevenLabs 401") && !bad.message.includes("wrong-synthetic-key"), String(bad));
  } finally {
    s.done();
  }
});

test("re-adding an MP3 take once ffmpeg is available records its timing", { skip: !hasFfmpeg && "ffmpeg not installed" }, () => {
  const s = sandbox();
  const path = process.env.PATH;
  try {
    addSong(s.ctx, { folder: s.inbox });
    const src = join(s.root, "take.wav");
    const mp3 = join(s.root, "stuttr-take.mp3");
    writeFileSync(src, wav({ sec: 2, rate: 44100, ch: 1 }));
    assert.equal(spawnSync("ffmpeg", ["-v", "error", "-i", src, "-c:a", "libmp3lame", "-b:a", "192k", mp3]).status, 0);
    process.env.PATH = ""; // no ffprobe: the MP3's length can't be measured
    const first = addVoice(s.ctx, { trackId: "bass-drop-anthem", voice: "Stuttr", file: mp3 });
    assert.equal(first.timingOk, false);
    assert.equal(first.durationSec, null);
    process.env.PATH = path;
    addVoice(s.ctx, { trackId: "bass-drop-anthem", voice: "Stuttr", file: mp3 });
    const saved = loadManifest(s.ctx).tracks[0].voices.find((v) => v.voice === "Stuttr")!;
    assert.ok(saved.durationSec !== null);
    assert.equal(saved.timingOk, true, `delta ${saved.timingDeltaMs} ms`);
    assert.equal(setVoiceStatus(s.ctx, "bass-drop-anthem", "Stuttr", "en", "approved").status, "approved");
  } finally {
    process.env.PATH = path;
    s.done();
  }
});

test("prep-voice and mix make ElevenLabs-ready vocals and a draft mix", { skip: !hasFfmpeg && "ffmpeg not installed" }, () => {
  const s = sandbox();
  try {
    addSong(s.ctx, { folder: s.inbox });
    const rel = prepVoice(s.ctx, "bass-drop-anthem");
    const prepped = readFileSync(join(s.ctx.library, rel));
    const info = parseWav(prepped, prepped.length)!;
    assert.deepEqual([info.channels, info.sampleRate, info.bitsPerSample], [1, 44100, 16]);
    assert.ok(Math.abs(info.durationSec! - 2) < 0.01);

    const take = join(s.root, "stuttr-take.wav");
    writeFileSync(take, wav({ sec: 2, rate: 44100, ch: 1 }));
    addVoice(s.ctx, { trackId: "bass-drop-anthem", voice: "Stuttr", file: take });
    const mixRel = mixVoice(s.ctx, "bass-drop-anthem", "Stuttr");
    const mixed = readFileSync(join(s.ctx.library, mixRel));
    const mi = parseWav(mixed, mixed.length)!;
    assert.deepEqual([mi.channels, mi.sampleRate, mi.bitsPerSample], [2, 48000, 24]);
    assert.ok(Math.abs(mi.durationSec! - 2) < 0.01);
  } finally {
    s.done();
  }
});

test("pickMaster: a final needs an approved master that still matches; a draft says what it plays", () => {
  const take: VoiceTake = {
    voice: "Stuttr", lang: "en", path: "s/voices/stuttr.en.wav", originalName: "stuttr.wav", sha256: "take-1", bytes: 1,
    sourceRole: "vocals", sourceSha256: "vocals-1", method: "other", durationSec: 2, timingDeltaMs: 0, timingOk: true,
    status: "approved", addedAt: "2026-10-20T00:00:00.000Z",
  };
  const files: LibraryFile[] = [
    { role: "full_mix", path: "s/full.wav", originalName: "full.wav", sha256: "full-1", bytes: 1 },
    { role: "stem", stemName: "drums", path: "s/drums.wav", originalName: "drums.wav", sha256: "drums-1", bytes: 1 },
  ];
  const master = (key: string, status: VoiceMaster["status"], builtAt: string, extra: Partial<VoiceMaster> = {}): VoiceMaster => ({
    key, kind: key === "suno" ? "suno" : "voices", path: `s/masters/s.${key}.master.wav`, sha256: `master-${key}`, bytes: 1,
    durationSec: 2, lengthDeltaMs: 0, lead: key === "suno" ? null : { path: take.path, sha256: take.sha256, voice: "Stuttr" }, backing: [],
    beds: key === "suno" ? [{ path: "s/full.wav", sha256: "full-1" }] : [{ path: "s/drums.wav", sha256: "drums-1" }], sunoBacking: [],
    status, builtAt, ...extra,
  });
  const track = (masters: VoiceMaster[], voices = [take], fs = files): LibraryTrack => ({ trackId: "s", title: "S", sunoPlan: "Pro", addedAt: "2026-10-20T00:00:00.000Z", files: fs, voices, masters });
  const ok = (r: ReturnType<typeof pickMaster>) => { assert.ok("master" in r, "error" in r ? r.error : ""); return r as { master: VoiceMaster; warning: string | null }; };
  const err = (r: ReturnType<typeof pickMaster>) => { assert.ok("error" in r, "expected an error"); return (r as { error: string }).error; };
  const t1 = "2026-10-20T01:00:00.000Z", t2 = "2026-10-20T02:00:00.000Z";

  assert.match(err(pickMaster(track([]), { final: false })), /no voice master yet; make one: npm run stuttr -- master s .*--suno/);
  assert.match(err(pickMaster(track([master("en", "rejected", t1)]), { final: false })), /no voice master yet/, "a rejected master never plays");

  const draft = ok(pickMaster(track([master("en", "draft", t1)]), { final: false }));
  assert.equal(draft.master.key, "en");
  assert.equal(draft.warning, "draft audio: the en, Stuttr master isn't approved yet");
  assert.match(err(pickMaster(track([master("en", "draft", t1)]), { final: true })), /still a draft; listen, then: npm run stuttr -- approve-master s$/);
  assert.equal(ok(pickMaster(track([master("en", "draft", t1), master("suno", "draft", t2)]), { final: false })).master.key, "suno", "the newest draft");

  const approved = track([master("en", "approved", t1), master("suno", "draft", t2)]);
  assert.deepEqual([ok(pickMaster(approved, { final: true })).master.key, ok(pickMaster(approved, { final: true })).warning], ["en", null], "approved beats a newer draft");
  const two = track([master("en", "approved", t1), master("suno", "approved", t2)]);
  assert.match(err(pickMaster(two, { final: true })), /2 approved masters \(en, suno\); pick one with --master <key>/);
  assert.equal(ok(pickMaster(two, { final: true, key: "suno" })).master.key, "suno");
  assert.match(err(pickMaster(two, { final: true, key: "es" })), /no "es" master; masters: en, suno/);

  // Out of date: a take rejected, a stem replaced, or the length off.
  const rejected = track([master("en", "approved", t1)], [{ ...take, status: "rejected" }]);
  assert.match(err(pickMaster(rejected, { final: true })), /can't be used in a final: Stuttr's take is rejected now\. Rebuild it with npm run stuttr -- master s --replace/);
  assert.match(ok(pickMaster(rejected, { final: false })).warning!, /out of date \(Stuttr's take is rejected now\)/);
  assert.match(masterProblem(track([]), master("en", "draft", t1, { lengthDeltaMs: 80 }))!, /80 ms off the full mix's length \(limit ±50 ms\)/);
  assert.match(masterProblem(track([], [take], [files[0], { ...files[1], sha256: "drums-2" }]), master("en", "draft", t1))!, /s\/drums\.wav has changed/);
  assert.match(masterProblem(track([], [{ ...take, sha256: "take-2" }]), master("en", "draft", t1))!, /the Stuttr take it was built from has changed/);
  assert.equal(masterProblem(track([]), master("suno", "draft", t1)), null);
});

test("master: approved takes only, at the full mix's exact length; approval checks what it was built from", { skip: !hasFfmpeg && "ffmpeg not installed" }, () => {
  const s = sandbox();
  try {
    addSong(s.ctx, { folder: s.inbox });
    const id = "bass-drop-anthem";
    const fullPath = () => join(s.ctx.library, loadManifest(s.ctx).tracks[0].files.find((f) => f.role === "full_mix")!.path);
    const fullSha = sha(fullPath());
    assert.throws(() => buildMaster(s.ctx, { trackId: id }), /no approved lead take \(en\); run convert first/);
    const lead = join(s.root, "stuttr.wav");
    writeFileSync(lead, wav({ sec: 2, rate: 44100, ch: 1 }));
    addVoice(s.ctx, { trackId: id, voice: "Stuttr", file: lead });
    assert.throws(() => buildMaster(s.ctx, { trackId: id }), /listen to Stuttr with mix, then approve one/);
    setVoiceStatus(s.ctx, id, "Stuttr", "en", "approved");
    const m = join(s.root, "m.wav");
    writeFileSync(m, wav({ sec: 2, freq: 520 }));
    addVoice(s.ctx, { trackId: id, voice: "M", file: m, from: "backing_vocals" });

    // M's backing take is still a draft, so Suno's backing stem goes in instead.
    const v1 = buildMaster(s.ctx, { trackId: id });
    assert.ok(s.lines.includes("not in the master (not approved): M backing"), s.lines.join("\n"));
    assert.ok(s.lines.includes("backing: Suno's backing vocals"));
    assert.deepEqual([v1.path, v1.status, v1.kind, v1.lead!.voice, v1.backing.length, v1.sunoBacking.length], [`${id}/masters/${id}.en.master.wav`, "draft", "voices", "Stuttr", 0, 1]);
    const buf = readFileSync(join(s.ctx.library, v1.path));
    const info = parseWav(buf, buf.length)!;
    assert.deepEqual([info.channels, info.sampleRate, info.bitsPerSample], [2, 48000, 24]);
    assert.ok(Math.abs(info.durationSec! - 2) < 0.001, `master ${info.durationSec} s`);
    assert.ok(v1.lengthDeltaMs !== null && Math.abs(v1.lengthDeltaMs) <= 1);
    assert.equal(sha(join(s.ctx.library, v1.path)), v1.sha256);
    assert.equal(sha(fullPath()), fullSha, "the Suno master is never changed");

    setVoiceStatus(s.ctx, id, "M", "en", "approved", "backing_vocals");
    const v2 = buildMaster(s.ctx, { trackId: id });
    assert.deepEqual([v2.backing.map((b) => b.voice), v2.sunoBacking.length], [["M"], 0]);
    setMasterStatus(s.ctx, id, "en", "approved");
    assert.throws(() => buildMaster(s.ctx, { trackId: id }), /the en master for "bass-drop-anthem" is approved; rebuild it with --replace/);
    setVoiceStatus(s.ctx, id, "M", "en", "rejected", "backing_vocals");
    assert.throws(() => setMasterStatus(s.ctx, id, "en", "approved"), /can't be approved: M's take is rejected now/);
    assert.equal(buildMaster(s.ctx, { trackId: id, replace: true }).status, "draft", "a rebuild goes back to draft");

    // Suno's own vocals: the full mix at 48 kHz, 24-bit, under its own key.
    const su = buildMaster(s.ctx, { trackId: id, suno: true });
    assert.deepEqual([su.key, su.kind, su.lead, su.beds.map((b) => b.sha256)], ["suno", "suno", null, [fullSha]]);
    assert.ok(Math.abs(su.durationSec! - 2) < 0.001);
    assert.deepEqual(loadManifest(s.ctx).tracks[0].masters!.map((x) => [x.key, x.status]), [["en", "draft"], ["suno", "draft"]]);
  } finally {
    s.done();
  }
});
