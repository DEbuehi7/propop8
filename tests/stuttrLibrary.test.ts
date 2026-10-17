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
import { classifyFolder, parseWav, roleFromName, sharedPrefix, slugify, timingCheck } from "../lib/stuttr/library";
import { addSong, addVoice, loadManifest, mixVoice, prepVoice, setVoiceStatus, type Ctx } from "../lib/stuttr/commands";

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
