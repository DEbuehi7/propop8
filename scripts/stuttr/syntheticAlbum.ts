/**
 * A synthetic album for the Album Desk: tones and clicks only, no real music,
 * no real voices, no real album or performer names. Used by
 * tests/stuttrDesk.test.ts and by the demo in docs/ALBUM_DESK.md:
 *
 *   npx tsx scripts/stuttr/syntheticAlbum.ts /tmp/desk-demo
 *
 * writes /tmp/desk-demo/drop/Synthetic Desk Album.zip, album.json beside it,
 * and bad.zip (a Zip Slip entry). The cases it covers, by track:
 *   1 Pulse Song      solo vocal, Studio multitrack, kept Suno vocals
 *   2 Trio Song       three performers on one lead stem, asked to convert (held)
 *   3 Interlude       instrumental, full mix only
 *   4 Number Song     the same song as WAV and MP3 (the WAV is kept)
 *   5 Say Song        convert asked, but no lead vocal stem (held)
 *   6 Eighteen        dropped as "Eighteen v2": a suggestion, never a guess
 *   7 Ghost Song      lead vocal 250 ms late against the mix (held)
 *   8 Voice Song      converted with an approved voice (the paid path, faked in tests)
 *   9 Missing Song    in the manifest, not in the drop
 */
import { spawnSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { deflateRawSync } from "node:zlib";
import { crc32, zipStore, type ZipEntry } from "../../lib/dance8/authoring/zipStore";
import { ALBUM_MANIFEST_SCHEMA, type AlbumManifest } from "../../lib/stuttr/desk/manifest";

export const SYNTH_RATE = 22050;
export const SYNTH_SEC = 24;

export function wav(samples: Float32Array, rate = SYNTH_RATE): Buffer {
  const data = Buffer.alloc(samples.length * 2);
  for (let i = 0; i < samples.length; i++) data.writeInt16LE(Math.max(-32767, Math.min(32767, Math.round(samples[i] * 32767))), i * 2);
  const h = Buffer.alloc(44);
  h.write("RIFF", 0, "ascii"); h.writeUInt32LE(36 + data.length, 4); h.write("WAVE", 8, "ascii");
  h.write("fmt ", 12, "ascii"); h.writeUInt32LE(16, 16); h.writeUInt16LE(1, 20); h.writeUInt16LE(1, 22);
  h.writeUInt32LE(rate, 24); h.writeUInt32LE(rate * 2, 28); h.writeUInt16LE(2, 32); h.writeUInt16LE(16, 34);
  h.write("data", 36, "ascii"); h.writeUInt32LE(data.length, 40);
  return Buffer.concat([h, data]);
}

const gen = (sec: number, f: (t: number) => number) => Float32Array.from({ length: Math.round(sec * SYNTH_RATE) }, (_, i) => f(i / SYNTH_RATE));
const hit = (t: number, every: number, freq: number, amp: number, decay: number) => { const p = t % every; return p < 0.1 ? Math.sin(2 * Math.PI * freq * p) * Math.exp(-p / decay) * amp : 0; };

function mulberry32(seed: number) {
  return () => { seed |= 0; seed = (seed + 0x6d2b79f5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

/**
 * One song's parts at 120 BPM: drums, bass, a sung line (syllables of random
 * length and pitch, so it never repeats like a loop) and the full mix, their
 * sum with headroom.
 */
export function songParts(seed: number, o: { vocalDelaySec?: number; vocals?: boolean } = {}) {
  const beat = 0.5;
  const rnd = mulberry32(seed * 7919 + 13);
  const syllables: { a: number; b: number; f: number }[] = [];
  for (const [bar0, bar1] of [[2, 6], [8, 10]]) {
    for (let t = bar0 * 2; t < bar1 * 2; ) {
      const len = 0.15 + 0.35 * rnd();
      syllables.push({ a: t, b: Math.min(t + len * 0.85, bar1 * 2), f: 220 * 2 ** (Math.floor(rnd() * 12) / 12) });
      t += len;
    }
  }
  const voice = (t: number) => {
    const s = syllables.find((x) => t >= x.a && t < x.b);
    if (!s) return 0;
    const env = Math.min(1, (t - s.a) / 0.02, (s.b - t) / 0.02);
    return 0.3 * env * (Math.sin(2 * Math.PI * s.f * t) + 0.4 * Math.sin(4 * Math.PI * s.f * t));
  };
  const g = 0.5;
  const drums = gen(SYNTH_SEC, (t) => g * (t < SYNTH_SEC - 1 ? hit(t, beat, 60, 0.5, 0.03) + hit(t, 4 * beat, 60, 0.4, 0.03) + hit(t, beat / 2, 2500, 0.15, 0.004) : 0));
  const bass = gen(SYNTH_SEC, (t) => g * (t < SYNTH_SEC - 1 ? hit(t, 4 * beat, 55 + seed, 0.6, 0.08) : 0));
  const lead = gen(SYNTH_SEC, (t) => (o.vocals === false ? 0 : g * voice(t)));
  const full = new Float32Array(drums.length);
  for (let i = 0; i < full.length; i++) full[i] = drums[i] + bass[i] + lead[i];
  const d = Math.round((o.vocalDelaySec ?? 0) * SYNTH_RATE);
  const leadOut = new Float32Array(lead.length);
  for (let i = 0; i < lead.length; i++) leadOut[i] = i - d >= 0 && i - d < lead.length ? lead[i - d] : 0;
  return { drums, bass, lead: leadOut, full };
}

const LYRICS = "[Verse 1]\nfirst line\nsecond line\n[Hook]\nhook line\n";

export function mp3Of(wavBytes: Buffer): Buffer | null {
  const r = spawnSync("ffmpeg", ["-v", "error", "-f", "wav", "-i", "pipe:0", "-c:a", "libmp3lame", "-b:a", "128k", "-f", "mp3", "pipe:1"], { input: wavBytes, maxBuffer: 1 << 28 });
  return r.status === 0 ? Buffer.from(r.stdout) : null;
}

export const SYNTH_ALBUM_ID = "synthetic-desk";
export const SYNTH_PERFORMERS = ["Performer Low", "Performer Mid", "Performer Top"] as const;

export function syntheticManifest(): AlbumManifest {
  const [low, mid, top] = SYNTH_PERFORMERS;
  return {
    schemaVersion: ALBUM_MANIFEST_SCHEMA, albumId: SYNTH_ALBUM_ID, title: "Synthetic Desk Album", sunoPlan: "Pro",
    rights: { state: "UNKNOWN" },
    tracks: [
      { trackNumber: 1, title: "Pulse Song", performers: [mid], voiceStrategy: "KEEP_ORIGINAL" },
      { trackNumber: 2, title: "Trio Song", performers: [low, mid, top], voiceStrategy: "CONVERT_APPROVED_SEGMENTS", mode: "solo" },
      { trackNumber: 3, title: "Interlude", performers: [], voiceStrategy: "KEEP_ORIGINAL" },
      { trackNumber: 4, title: "Number Song", performers: [top], voiceStrategy: "KEEP_ORIGINAL" },
      { trackNumber: 5, title: "Say Song", performers: [low], voiceStrategy: "CONVERT_APPROVED_SEGMENTS", mode: "solo" },
      { trackNumber: 6, title: "Eighteen", performers: [mid] },
      { trackNumber: 7, title: "Ghost Song", performers: [mid] },
      { trackNumber: 8, title: "Voice Song", performers: [low], voiceStrategy: "CONVERT_APPROVED_SEGMENTS", mode: "solo" },
      { trackNumber: 9, title: "Missing Song", performers: [top] },
    ],
  };
}

/** Writes the album ZIP, its manifest and a bad ZIP into `<dir>/drop`. Returns their paths. */
export function writeSyntheticAlbum(dir: string): { zip: string; manifest: string; badZip: string } {
  const drop = join(dir, "drop");
  mkdirSync(drop, { recursive: true });
  const root = "Synthetic Desk Album";
  const entries: ZipEntry[] = [];
  const put = (name: string, data: Buffer) => entries.push({ name: `${root}/${name}`, data });
  const studio = (title: string, seed: number, o: { vocalDelaySec?: number } = {}) => {
    const p = songParts(seed, o);
    put(`${title}/0 Lead Vocal.wav`, wav(p.lead));
    put(`${title}/1 Drum Kit.wav`, wav(p.drums));
    put(`${title}/2 Bass.wav`, wav(p.bass));
    put(`${title}/${title}.wav`, wav(p.full));
    put(`${title}/lyrics.txt`, Buffer.from(LYRICS));
  };
  studio("Pulse Song", 1);
  studio("Trio Song", 2);
  put("Interlude.wav", wav(songParts(3, { vocals: false }).full));
  const number = wav(songParts(4).full);
  put("Number Song.wav", number);
  const mp3 = mp3Of(number);
  if (mp3) put("Number Song.mp3", mp3);
  put("Say Song.wav", wav(songParts(5).full));
  const e = songParts(6);
  put("Eighteen v2/Eighteen v2.wav", wav(e.full));
  studio("Ghost Song", 7, { vocalDelaySec: 0.25 });
  studio("Voice Song", 8);
  const zip = join(drop, `${root}.zip`);
  writeFileSync(zip, zipStore(entries, new Date(Date.UTC(2026, 10, 10))));
  const manifest = join(drop, "album.json");
  writeFileSync(manifest, JSON.stringify(syntheticManifest(), null, 2) + "\n");
  const badZip = join(drop, "bad.zip");
  writeFileSync(badZip, rawZip([{ name: "../evil.wav", data: Buffer.from("not audio") }, { name: "fine.txt", data: Buffer.from("ok") }]));
  return { zip, manifest, badZip };
}

/** A ZIP written without any checks, so tests can make the bad ones a real download might be. */
export function rawZip(entries: { name: string; data: Buffer; method?: 0 | 8; flags?: number; madeBy?: number; extAttr?: number; crc?: number; size?: number }[]): Buffer {
  const locals: Buffer[] = [];
  const cens: Buffer[] = [];
  let off = 0;
  for (const e of entries) {
    const name = Buffer.from(e.name, "utf8");
    const packed = e.method === 8 ? deflateRawSync(e.data) : e.data;
    const crc = e.crc ?? crc32(e.data);
    const size = e.size ?? e.data.length;
    const flags = (e.flags ?? 0) | 0x800;
    const l = Buffer.alloc(30);
    l.writeUInt32LE(0x04034b50, 0); l.writeUInt16LE(20, 4); l.writeUInt16LE(flags, 6); l.writeUInt16LE(e.method ?? 0, 8);
    l.writeUInt32LE(crc, 14); l.writeUInt32LE(packed.length, 18); l.writeUInt32LE(size, 22); l.writeUInt16LE(name.length, 26);
    locals.push(l, name, packed);
    const c = Buffer.alloc(46);
    c.writeUInt32LE(0x02014b50, 0); c.writeUInt16LE(((e.madeBy ?? 3) << 8) | 20, 4); c.writeUInt16LE(20, 6); c.writeUInt16LE(flags, 8); c.writeUInt16LE(e.method ?? 0, 10);
    c.writeUInt32LE(crc, 16); c.writeUInt32LE(packed.length, 20); c.writeUInt32LE(size, 24); c.writeUInt16LE(name.length, 28);
    c.writeUInt32LE(e.extAttr ?? (0o100644 << 16) >>> 0, 38); c.writeUInt32LE(off, 42);
    cens.push(c, name);
    off += 30 + name.length + packed.length;
  }
  const cen = Buffer.concat(cens);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(entries.length, 8); end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(cen.length, 12); end.writeUInt32LE(off, 16);
  return Buffer.concat([...locals, cen, end]);
}

if (require.main === module) {
  const dir = process.argv[2];
  if (!dir) { console.error("usage: npx tsx scripts/stuttr/syntheticAlbum.ts <folder>"); process.exit(1); }
  const out = writeSyntheticAlbum(dir);
  console.log(`wrote ${out.zip}\n      ${out.manifest}\n      ${out.badZip}`);
}
