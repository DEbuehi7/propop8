/**
 * The album master list and the voice presets: the pure rules on synthetic
 * library records, then a synthetic album end to end with a fake ElevenLabs.
 * All audio is synthetic tones written to a temp folder.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { spawnSync } from "node:child_process";
import {
  albumBoard, placeSongs, reorderSongs, songRow, validateAlbums, type Album, type AlbumsFile, type SongFacts,
} from "../lib/stuttr/album";
import { albumAdd, albumCommand, albumOrder, albumRemove, albumsCommand, albumVoices, loadAlbums, voicesCommand } from "../lib/stuttr/albumCommands";
import { addSong, buildMaster, loadManifest, setMasterStatus, setVoiceStatus, type Ctx } from "../lib/stuttr/commands";
import type { Fetch } from "../lib/stuttr/elevenlabs";
import { voiceKey, type LibraryFile, type LibraryTrack, type VoiceMaster, type VoiceTake } from "../lib/stuttr/library";

const hasFfmpeg = spawnSync("ffmpeg", ["-version"]).status === 0;

// ---------------------------------------------------------------- synthetic records

const file = (role: LibraryFile["role"], name: string, extra: Partial<LibraryFile> = {}): LibraryFile =>
  ({ role, path: `s/source/${name}`, originalName: name, sha256: `sha-${name}`, bytes: 1, ...extra });
const DRUMS = file("stem", "drums.wav", { stemName: "drums" });
const take = (voice: string, o: Partial<VoiceTake> = {}): VoiceTake => ({
  voice, lang: "en", path: `s/voices/${voiceKey(voice)}.en${o.sourceRole === "backing_vocals" ? ".backing" : ""}.mp3`, originalName: "take.mp3",
  sha256: `sha-${voice}-${o.sourceRole ?? "vocals"}`, bytes: 1, sourceRole: "vocals", sourceSha256: "src", method: "elevenlabs_voice_changer",
  durationSec: 10, timingDeltaMs: 0, timingOk: true, status: "draft", addedAt: "2026-10-25T00:00:00.000Z", ...o,
});
const song = (o: Partial<LibraryTrack> = {}): LibraryTrack => ({
  trackId: "s", title: "Synthetic Song", sunoPlan: "Pro", addedAt: "2026-10-25T00:00:00.000Z",
  files: [file("full_mix", "full.wav"), file("vocals", "lead.wav"), file("backing_vocals", "backing.wav"), DRUMS], voices: [], ...o,
});
const master = (lead: VoiceTake, status: VoiceMaster["status"]): VoiceMaster => ({
  key: "en", kind: "voices", path: "s/masters/s.en.master.wav", sha256: "m", bytes: 1, durationSec: 10, lengthDeltaMs: 0,
  lead: { path: lead.path, sha256: lead.sha256, voice: lead.voice }, backing: [], beds: [{ path: DRUMS.path, sha256: DRUMS.sha256 }], sunoBacking: [],
  status, builtAt: "2026-10-25T00:00:00.000Z",
});
const facts = (t: LibraryTrack | null, o: Partial<SongFacts> = {}): SongFacts =>
  ({ track: t, cast: null, mixes: [], masterDrift: null, analysed: false, planned: false, video: null, ...o });
const row = (t: LibraryTrack | null, mode?: "solo" | "crew" | "cast", f: Partial<SongFacts> = {}) => songRow("album-1", 1, { trackId: "s", ...(mode ? { mode } : {}) }, facts(t, f));

test("albums file: ids are library slugs, every song once, modes and leads checked", () => {
  const ok: AlbumsFile = { schemaVersion: 1, albums: [{ id: "sontheravein", title: "SontheraVein", songs: [{ trackId: "vein", mode: "crew" }, { trackId: "bland" }] }] };
  assert.deepEqual(validateAlbums(ok), []);
  const bad = {
    schemaVersion: 2,
    albums: [
      { id: "Album One", title: "x", songs: [] },
      { id: "a", title: "", songs: [{ trackId: "vein" }, { trackId: "vein", mode: "duet" }, { trackId: "VEIN" }, { trackId: "b", lead: "St/uttr" }] },
      { id: "a", title: "again", songs: [] },
    ],
  } as unknown as AlbumsFile;
  const issues = validateAlbums(bad);
  for (const want of [/schemaVersion must be 1/, /album id "Album One"/, /album "a" needs a title/, /"vein" is listed twice/, /mode must be solo, crew, cast/, /song id "VEIN"/, /lead "St\/uttr"/, /album "a" is listed twice/]) {
    assert.ok(issues.some((i) => want.test(i)), `${want} in ${issues.join(" | ")}`);
  }
});

test("running order: add at the end or at a track number, move, reorder with every song once", () => {
  const a: Album = { id: "a", title: "A", songs: ["one", "two", "three"].map((trackId) => ({ trackId })) };
  const ids = (x: Album) => x.songs.map((s) => s.trackId);
  assert.deepEqual(ids(placeSongs(a, ["four", "two"])), ["one", "two", "three", "four"], "listed songs stay put without --at");
  assert.deepEqual(ids(placeSongs(a, ["four"], 1)), ["four", "one", "two", "three"]);
  assert.deepEqual(ids(placeSongs(a, ["one"], 3)), ["two", "three", "one"], "--at is the track number it becomes");
  assert.deepEqual(ids(placeSongs(a, ["three", "zero"], 1)), ["three", "zero", "one", "two"]);
  assert.throws(() => placeSongs(a, ["four"], 5), /--at must be a track number from 1 to 4/);
  assert.throws(() => placeSongs(a, ["four"], 0), /from 1 to 4/);
  const keep: Album = { ...a, songs: [{ trackId: "one", mode: "solo" }, { trackId: "two" }, { trackId: "three" }] };
  assert.deepEqual(reorderSongs(keep, ["three", "one", "two"]).songs, [{ trackId: "three" }, { trackId: "one", mode: "solo" }, { trackId: "two" }]);
  assert.throws(() => reorderSongs(a, ["three", "one", "one", "nine"]), /not on the album: nine.*missing: two.*listed twice: one/);
});

test("board row: from not added to an approved master, one next step at a time", () => {
  const notAdded = row(null, "solo");
  assert.equal(notAdded.cells.source, "not added");
  assert.match(notAdded.next[0], /add its Suno song folder .* --id s /);
  assert.match(row(song()).next[0], /choose its voice mode: npm run stuttr -- album-add album-1 s --mode solo/);
  assert.equal(row(song({ files: [file("full_mix", "full.wav"), DRUMS] }), "solo").cells.stems, "no lead vocal");
  assert.match(row(song({ files: [file("full_mix", "full.wav"), file("vocals", "lead.wav"), DRUMS] }), "crew").next[0], /export it from Suno again.*no backing vocals/);

  // solo: convert, listen, approve, master, approve the master.
  const s0 = row(song(), "solo");
  assert.deepEqual([s0.cells.lead, s0.cells.backing], ["-", "suno"]);
  assert.equal(s0.next[0], "npm run stuttr -- voices s --preset solo   (shows the credits; add --go to convert)");
  const lead = take("Stuttr");
  const s1 = row(song({ voices: [lead] }), "solo");
  assert.deepEqual(s1.next, [
    "build the listening mix: npm run stuttr -- mix s Stuttr",
    "listen to s/mixes/s.stuttr.en.draft.wav, then approve what you keep (or reject it):",
    "  npm run stuttr -- approve s Stuttr",
  ]);
  assert.equal(row(song({ voices: [lead] }), "solo", { mixes: ["s/mixes/s.stuttr.en.draft.wav"] }).cells.mix, "made");
  const ok = { ...lead, status: "approved" as const };
  assert.deepEqual(row(song({ voices: [ok] }), "solo").next, ["build the master: npm run stuttr -- master s"]);
  const draft = row(song({ voices: [ok], masters: [master(ok, "draft")] }), "solo");
  assert.deepEqual([draft.cells.master, draft.done, draft.next], ["draft", false, ["listen to the master (s/masters/s.en.master.wav), then: npm run stuttr -- approve-master s"]]);
  const done = row(song({ voices: [ok], masters: [master(ok, "approved")] }), "solo", { planned: true, video: "draft" });
  assert.deepEqual([done.cells.master, done.done, done.next, done.cells.dance8, done.cells.video], ["approved", true, [], "planned", "draft"]);
  // The take changed after the master was approved: out of date, rebuild it.
  const stale = row(song({ voices: [{ ...ok, sha256: "new" }], masters: [master(ok, "approved")] }), "solo");
  assert.deepEqual([stale.cells.master, stale.done], ["stale", false]);
  assert.match(stale.next[0], /the master is out of date \(the Stuttr take it was built from has changed\); rebuild it: npm run stuttr -- master s --replace/);
  // A rejected lead: convert it again.
  assert.match(row(song({ voices: [{ ...lead, status: "rejected" }] }), "solo").next[0], /lead take is rejected; convert it again: npm run stuttr -- convert s Stuttr --redo/);
  assert.match(row(song({ voices: [{ ...lead, timingOk: false }] }), "solo").next[0], /off the stem's timing/);
  assert.equal(row(song({ voices: [lead] }), "solo", { cast: { error: "x" } }).notes.length, 1, "a cast.json on a solo song is pointed out");
});

test("board row: crew counts Stuttr, M, Ja and Bo; cast counts its parts", () => {
  const ok = take("Stuttr", { status: "approved" });
  const b = (v: string, status: VoiceTake["status"]) => take(v, { sourceRole: "backing_vocals", status });
  const c0 = row(song({ voices: [ok, b("M", "approved")] }), "crew");
  assert.deepEqual([c0.cells.backing, c0.next[0]], ["1/4", "npm run stuttr -- voices s --preset crew   (shows the credits; add --go to convert)"]);
  const c1 = row(song({ voices: [ok, b("Stuttr", "approved"), b("M", "approved"), b("Ja", "draft"), b("Bo", "rejected")] }), "crew");
  assert.equal(c1.cells.backing, "2/4");
  assert.deepEqual(c1.next.slice(-1), ["  npm run stuttr -- approve s Ja --from backing_vocals"], "only drafts wait for you; a rejected crew voice is left out");
  const c2 = row(song({ voices: [ok, b("Stuttr", "approved"), b("M", "approved"), b("Ja", "approved"), b("Bo", "rejected")] }), "crew");
  assert.deepEqual(c2.next, ["build the master: npm run stuttr -- master s"]);

  const none = row(song(), "cast");
  assert.deepEqual(none.next, ["npm run stuttr -- analyze s", "npm run dance8 -- plan s", "write its cast: npm run stuttr -- cast s, edit cast.json, then run cast again to check it"]);
  assert.equal(row(song(), "cast", { analysed: true, planned: true }).next.length, 1);
  assert.match(row(song(), "cast", { cast: { error: "section x is missing" } }).next[0], /fix cast.json .*section x is missing/);
  const count = (total: number, made: number, approved: number, draftVoices: string[] = []) => ({ total, made, approved, draftVoices });
  const part = row(song(), "cast", { cast: { lead: count(3, 2, 1, ["Mo"]), backing: count(0, 0, 0), sunoBacking: true } });
  assert.deepEqual([part.cells.lead, part.cells.backing, part.next[0]], ["1/3", "suno", "npm run stuttr -- voices s --preset cast   (shows the credits; add --go to convert)"]);
  const drafts = row(song(), "cast", { cast: { lead: count(3, 3, 2, ["Mo"]), backing: count(1, 1, 0, ["M"]), sunoBacking: false }, mixes: ["s/mixes/s.cast.en.draft.wav"] });
  assert.deepEqual(drafts.next, [
    "listen to s/mixes/s.cast.en.draft.wav, then approve what you keep (or reject it):",
    "  npm run stuttr -- approve s Mo",
    "  npm run stuttr -- approve s M --from backing_vocals",
  ]);
  assert.deepEqual(row(song(), "cast", { cast: { lead: count(3, 3, 3), backing: count(1, 1, 1), sunoBacking: false } }).next, ["build the master: npm run stuttr -- master s"]);
});

test("board: a table in running order, then the next steps", () => {
  const ok = take("Stuttr", { status: "approved" });
  const a: Album = { id: "a", title: "Album A", songs: [{ trackId: "s", mode: "solo" }, { trackId: "later", title: "Later Song", mode: "crew" }] };
  const rows = [
    songRow("a", 1, a.songs[0], facts(song({ voices: [ok], masters: [master(ok, "approved")] }))),
    songRow("a", 2, a.songs[1], facts(null)),
  ];
  const lines = albumBoard(a, rows);
  assert.equal(lines[0], "Album A (a): 2 songs; 1 voice master approved, 1 not added");
  assert.equal(lines[1], "#  song   mode  source     stems  lead      backing  mix  master    dance8  video");
  assert.equal(lines[2], "1  s      solo  ok         ok     approved  suno     -    approved  -       -");
  assert.equal(lines[3], "2  later  crew  not added  -      -         -        -    -         -       -");
  assert.deepEqual(lines.slice(4), ["", "next:", " 2  Later Song", "      add its Suno song folder to the library with npm run stuttr -- add, using --id later so it matches this list"]);
  assert.match(albumBoard({ ...a, songs: [] }, [])[1], /album-add a, followed by their library ids/);
});

// ---------------------------------------------------------------- end to end

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
/** Converts by re-encoding the uploaded WAV as MP3, so lengths line up like a real take; each take differs (a tag). */
function fakeEleven(posts: string[]): Fetch {
  const voices = [{ voice_id: "id-stuttr", name: "Stuttr" }, { voice_id: "id-m", name: "M - Shenzhen Syndicate" }, { voice_id: "id-ja", name: "Ja" }, { voice_id: "id-bo", name: "Bo" }];
  return async (url, init) => {
    if (url.endsWith("/v1/voices")) return new Response(JSON.stringify({ voices }));
    const form = init!.body as FormData;
    posts.push(`${decodeURIComponent(url.split("/v1/speech-to-speech/")[1].split("?")[0])} ${(form.get("audio") as File).name}`);
    const wavIn = Buffer.from(await (form.get("audio") as Blob).arrayBuffer());
    const r = spawnSync("ffmpeg", ["-v", "error", "-f", "wav", "-i", "pipe:0", "-c:a", "libmp3lame", "-b:a", "192k", "-metadata", `comment=take ${posts.length}`, "-f", "mp3", "pipe:1"], { input: wavIn, maxBuffer: 1 << 28 });
    return new Response(new Uint8Array(r.stdout));
  };
}

test("album end to end: the list, the estimate before any credits, --go with a cap, approve, master, done", { skip: !hasFfmpeg && "ffmpeg not installed" }, async () => {
  const root = mkdtempSync(join(tmpdir(), "stuttr-album-"));
  const lines: string[] = [];
  const c: Ctx = { library: join(root, "library"), now: () => "2026-10-25T00:00:00.000Z", log: (l) => lines.push(l) };
  const said = (re: RegExp) => lines.some((l) => re.test(l));
  try {
    const tone = (f: number) => (t: number) => 0.3 * Math.sin(2 * Math.PI * f * t);
    const songFolder = (name: string, backing: boolean) => {
      const dir = join(root, "inbox", "SontheraVein", name);
      mkdirSync(dir, { recursive: true });
      writeFileSync(join(dir, "0 Lead Vocals.wav"), wavOf(6, tone(440)));
      if (backing) writeFileSync(join(dir, "1 Backing Vocals.wav"), wavOf(6, (t) => (t >= 2 && t < 4 ? tone(550)(t) : 0)));
      writeFileSync(join(dir, "2 Drums.wav"), wavOf(6, tone(110)));
      writeFileSync(join(dir, `${name}.wav`), wavOf(6, tone(220)));
      return dir;
    };
    addSong(c, { folder: songFolder("BLAND", false), title: "BLAND", sunoPlan: "Pro" });
    addSong(c, { folder: songFolder("VEIN", true), title: "VEIN (The Nerve)", id: "vein", sunoPlan: "Pro" });

    // The list: made from the name as typed, songs in running order, one not added yet.
    albumCommand(c, "SontheraVein");
    assert.ok(said(/made album "SontheraVein" \(sontheravein\)/));
    albumAdd(c, "sontheravein", ["bland", "pulse"], { mode: "solo" });
    albumAdd(c, "SontheraVein", ["vein"], { at: 1, mode: "crew" });
    assert.ok(said(/not in the library yet .*: vein|not in the library yet .*: pulse/));
    albumOrder(c, "sontheravein", ["vein", "bland", "pulse"]);
    assert.deepEqual(loadAlbums(c).albums[0].songs, [{ trackId: "vein", mode: "crew" }, { trackId: "bland", mode: "solo" }, { trackId: "pulse", mode: "solo" }]);
    assert.ok(existsSync(join(c.library, "albums.json")), "the list lives in the private library");

    // One song's estimate: free, nothing sent.
    const posts: string[] = [];
    const eleven = { key: TEST_KEY, fetch: fakeEleven(posts) };
    const est = await voicesCommand(c, { trackId: "bland", ...eleven });
    assert.ok(est.credits > 0 && est.takes === 0 && est.mix === null);
    assert.ok(said(/^bland: solo, from the album list$/), "no --preset: the song's mode on its album");
    assert.ok(said(/bland \(solo\): about [\d,]+ credits in all\. Nothing was converted\. To convert: npm run stuttr -- voices bland --preset solo --go/));
    await assert.rejects(voicesCommand(c, { trackId: "bland", preset: "crew", ...eleven }), /no backing vocal stem/);
    await assert.rejects(voicesCommand(c, { trackId: "bland", preset: "duet", ...eleven }), /--mode and --preset take solo, crew, cast/);

    // The album's estimate, then --go only with a cap at least the total.
    lines.length = 0;
    const dry = await albumVoices(c, { album: "sontheravein", ...eleven });
    assert.ok(said(/^3 pulse: not in the library yet; skipped$/));
    assert.ok(said(new RegExp(`--go --max-credits ${dry.credits}$`)), lines.join("\n"));
    await assert.rejects(albumVoices(c, { album: "sontheravein", go: true, ...eleven }), /--go needs --max-credits/);
    await assert.rejects(albumVoices(c, { album: "sontheravein", go: true, maxCredits: dry.credits - 1, ...eleven }), /over --max-credits/);
    assert.equal(posts.length, 0, "nothing converted before the cap is given");
    const go = await albumVoices(c, { album: "sontheravein", go: true, maxCredits: dry.credits, ...eleven });
    assert.deepEqual(go.songs, ["vein", "bland"]);
    assert.deepEqual(posts.map((p) => p.split(" ")[0]).sort(), ["id-bo", "id-ja", "id-m", "id-stuttr", "id-stuttr", "id-stuttr"].sort(), "vein: lead + 4 crew; bland: lead");
    for (const id of ["vein", "bland"]) assert.ok(existsSync(join(c.library, id, "mixes", `${id}.stuttr.en.draft.wav`)), `${id} listening mix`);

    // The board now asks for your ears.
    let rows = albumCommand(c, "sontheravein");
    assert.deepEqual(rows.map((r) => [r.trackId, r.cells.lead, r.cells.backing, r.cells.mix]), [["vein", "draft", "0/4", "made"], ["bland", "draft", "none", "made"], ["pulse", "-", "-", "-"]]);
    assert.deepEqual(rows[0].next.slice(1), [
      "  npm run stuttr -- approve vein Stuttr",
      "  npm run stuttr -- approve vein Bo --from backing_vocals",
      "  npm run stuttr -- approve vein Ja --from backing_vocals",
      "  npm run stuttr -- approve vein M --from backing_vocals",
      "  npm run stuttr -- approve vein Stuttr --from backing_vocals",
    ]);

    // Approve, keep Bo out, master both, approve the masters.
    for (const [v, from] of [["Stuttr", "vocals"], ["M", "backing_vocals"], ["Ja", "backing_vocals"], ["Stuttr", "backing_vocals"]] as const) setVoiceStatus(c, "vein", v, "en", "approved", from);
    setVoiceStatus(c, "vein", "Bo", "en", "rejected", "backing_vocals");
    setVoiceStatus(c, "bland", "Stuttr", "en", "approved");
    rows = albumCommand(c, "sontheravein");
    assert.deepEqual(rows.map((r) => r.next[0]), ["build the master: npm run stuttr -- master vein", "build the master: npm run stuttr -- master bland", rows[2].next[0]]);
    for (const id of ["vein", "bland"]) { buildMaster(c, { trackId: id }); setMasterStatus(c, id, "en", "approved"); }
    lines.length = 0;
    rows = albumCommand(c, "sontheravein");
    assert.deepEqual(rows.map((r) => [r.cells.backing, r.cells.master, r.done]), [["3/4", "approved", true], ["none", "approved", true], ["-", "-", false]]);
    assert.equal(lines[0], "SontheraVein (sontheravein): 3 songs; 2 voice masters approved, 1 not added");
    lines.length = 0;
    albumsCommand(c);
    assert.deepEqual(lines, ["SontheraVein (sontheravein): 3 songs; 2 voice masters approved, 1 not added"]);

    // Done songs are skipped; a rejected crew voice isn't converted again without --redo.
    lines.length = 0;
    assert.equal((await albumVoices(c, { album: "sontheravein", ...eleven })).credits, 0);
    assert.ok(said(/^1 vein: voice master approved; skipped$/) && said(/^2 bland: voice master approved; skipped$/));
    assert.equal((await voicesCommand(c, { trackId: "vein", preset: "crew", ...eleven })).credits, 0);
    assert.ok(said(/Bo already has a backing take \(en\); skipped, no credits spent; it is rejected: to convert it again, add --redo/));

    // Redo a rejected lead: converted again, the new take replaces it, the master goes stale.
    setVoiceStatus(c, "bland", "Stuttr", "en", "rejected");
    rows = albumCommand(c, "sontheravein");
    assert.equal(rows[1].cells.master, "stale");
    assert.match(rows[1].next[0], /lead take is rejected; convert it again: npm run stuttr -- convert bland Stuttr --redo/);
    const before = posts.length;
    const redo = await voicesCommand(c, { trackId: "bland", preset: "solo", redo: true, go: true, ...eleven });
    assert.ok(redo.takes === 1 && posts.length === before + 1);
    const t = loadManifest(c).tracks.find((x) => x.trackId === "bland")!;
    assert.deepEqual(t.voices.filter((v) => v.sourceRole === "vocals").map((v) => [v.path, v.status]), [["bland/voices/stuttr.en.mp3", "draft"]]);

    // Taking a song off the list leaves the library alone.
    albumRemove(c, "sontheravein", ["pulse"]);
    assert.deepEqual(loadAlbums(c).albums[0].songs.map((s) => s.trackId), ["vein", "bland"]);
    assert.ok(JSON.parse(readFileSync(join(c.library, "library.json"), "utf8")).tracks.length === 2);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
