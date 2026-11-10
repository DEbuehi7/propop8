/**
 * The Stuttr Album Desk: the careful ZIP reader, matching, the ledger, the
 * track states, exact frame timing, stem alignment, and a synthetic album end
 * to end (import, audio, paid voices against a fake provider that times out,
 * Dance8 plan, Kling clips with a bad one, a draft render). Synthetic tones
 * only; no real music, voices, album names or keys.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { spawnSync } from "node:child_process";
import { collisionKey, listZip, readEntry, safeEntryPath } from "../lib/stuttr/desk/zip";
import { chooseFiles, groupSources, reconcile, titleSimilarity, type SourceFile } from "../lib/stuttr/desk/reconcile";
import { admit, classifyFailure, emptyLedger, finishJob, idempotencyKey, resolveJob, scrub, startJob } from "../lib/stuttr/desk/ledger";
import { trackStatus, type TrackFacts } from "../lib/stuttr/desk/state";
import { validateManifest, validateVoiceMap, ALBUM_MANIFEST_SCHEMA, type AlbumManifest } from "../lib/stuttr/desk/manifest";
import { measureOffset } from "../lib/stuttr/desk/align";
import { frameGrid } from "../lib/dance8/render/fps";
import { framesPerBar, framesPerBeat } from "../lib/canon";
import {
  albumClips, albumFacts, albumImport, albumPlanVideos, albumPreview, albumProcess, albumResolve, albumStatus, clipQa, hashFile, intakePath, ledgerPath, statusHtml, voicePlanPath,
} from "../lib/stuttr/desk/desk";
import { loadManifest, setMasterStatus, type Ctx } from "../lib/stuttr/commands";
import { setClipStatus, songPaths } from "../lib/dance8/pipeline";
import type { Fetch } from "../lib/stuttr/elevenlabs";
import type { ShotBrief } from "../lib/dance8/authoring/shotBriefs";
import { rawZip, writeSyntheticAlbum, SYNTH_ALBUM_ID } from "../scripts/stuttr/syntheticAlbum";

const hasFfmpeg = spawnSync("ffmpeg", ["-version"]).status === 0 && spawnSync("ffprobe", ["-version"]).status === 0;
const tmp = (name: string) => mkdtempSync(join(tmpdir(), `desk-${name}-`));
const sf = (path: string, extra: Partial<SourceFile> = {}): SourceFile => ({ path, sha256: `sha-${path}`, bytes: 1, ...extra });

// ---------------------------------------------------------------- the ZIP reader

test("zip: Zip Slip, absolute paths, symlinks, encryption and look-alike names are refused before anything is unpacked", () => {
  const dir = tmp("zip");
  try {
    const cases: [string, Parameters<typeof rawZip>[0], string][] = [
      ["slip", [{ name: "../evil.wav", data: Buffer.from("x") }], "UNSAFE_PATH"],
      ["abs", [{ name: "/etc/passwd", data: Buffer.from("x") }], "UNSAFE_PATH"],
      ["drive", [{ name: "C:/x.wav", data: Buffer.from("x") }], "UNSAFE_PATH"],
      ["backslash", [{ name: "a\\..\\b.wav", data: Buffer.from("x") }], "UNSAFE_PATH"],
      ["link", [{ name: "song.wav", data: Buffer.from("/etc/passwd"), extAttr: (0o120777 << 16) >>> 0 }], "SYMLINK"],
      ["crypt", [{ name: "song.wav", data: Buffer.from("x"), flags: 1 }], "ENCRYPTED"],
      ["nfd", [{ name: "Café.wav", data: Buffer.from("a") }, { name: "Cafe\u0301.wav", data: Buffer.from("b") }], "NAME_COLLISION"],
      ["case", [{ name: "SONG.wav", data: Buffer.from("a") }, { name: "song.wav", data: Buffer.from("b") }], "NAME_COLLISION"],
      ["bomb", [{ name: "zeros.wav", data: Buffer.alloc(2_000_000), method: 8 }], "RATIO"],
    ];
    for (const [name, entries, code] of cases) {
      const p = join(dir, `${name}.zip`);
      writeFileSync(p, rawZip(entries));
      const l = listZip(p);
      assert.ok(l.problems.some((x) => x.code === code), `${name}: ${JSON.stringify(l.problems)}`);
    }
    // A damaged entry fails its checksum; a deflated one reads back exactly.
    const good = Buffer.from("[Verse]\nline\n".repeat(50));
    writeFileSync(join(dir, "ok.zip"), rawZip([{ name: "a/lyrics.txt", data: good, method: 8 }, { name: "a/bad.txt", data: Buffer.from("abc"), crc: 1 }]));
    const l = listZip(join(dir, "ok.zip"));
    assert.deepEqual(l.problems, []);
    assert.deepEqual(readEntry(join(dir, "ok.zip"), l.entries[0]), good);
    assert.throws(() => readEntry(join(dir, "ok.zip"), l.entries[1]), /checksum/);
    writeFileSync(join(dir, "cut.zip"), Buffer.from("PK\x03\x04 not really"));
    assert.equal(listZip(join(dir, "cut.zip")).problems[0].code, "ZIP_UNREADABLE");
    assert.deepEqual(safeEntryPath("./Album/Song/0 Lead Vocal.wav"), { path: "Album/Song/0 Lead Vocal.wav" });
    assert.equal(collisionKey("Cafe\u0301.WAV"), collisionKey("Café.wav"));
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

// ---------------------------------------------------------------- matching

const manifest = (tracks: AlbumManifest["tracks"], rights: AlbumManifest["rights"]["state"] = "UNKNOWN"): AlbumManifest =>
  ({ schemaVersion: ALBUM_MANIFEST_SCHEMA, albumId: "a", title: "A", rights: { state: rights }, tracks });

test("matching: folders and loose files become songs; titles match exactly; a near title is only a suggestion", () => {
  const files = [
    sf("Album/Pulse Song/0 Lead Vocal.wav"), sf("Album/Pulse Song/1 Drums.wav"), sf("Album/Pulse Song/Pulse Song.wav"),
    sf("Album/Number Song.wav", { probe: { codec: "pcm_s16le", sampleRate: 44100, channels: 2, bitsPerSample: 16, durationSec: 100, peakDb: -3 } }),
    sf("Album/Number Song.mp3", { probe: { codec: "mp3", sampleRate: 44100, channels: 2, bitsPerSample: null, durationSec: 100.02, peakDb: -3 } }),
    sf("Album/Number Song.txt"), sf("Album/Eighteen v2/Eighteen v2.wav"), sf("Album/__MACOSX/._Pulse Song.wav"), sf("Album/.DS_Store"),
  ];
  const songs = groupSources(files);
  assert.deepEqual(songs.map((s) => [s.title, s.source, s.files.length]), [
    ["Eighteen v2", "Album/Eighteen v2", 1], ["Number Song", "Album/Number Song.wav", 3], ["Pulse Song", "Album/Pulse Song", 3],
  ], "the album folder is peeled off; macOS litter is ignored; the lyrics join their song");
  const number = songs.find((s) => s.title === "Number Song")!;
  const chosen = chooseFiles(number);
  assert.deepEqual(chosen.keep.map((f) => f.path), ["Album/Number Song.txt", "Album/Number Song.wav"], "the WAV beats the MP3 (STU-01)");
  assert.match(chosen.dropped[0].why, /lossy copy/);
  const rows = reconcile(manifest([
    { trackNumber: 1, title: "Pulse Song" }, { trackNumber: 2, title: "Number Song" }, { trackNumber: 3, title: "Eighteen" }, { trackNumber: 4, title: "Missing" },
  ]), songs);
  assert.deepEqual(rows.map((r) => [r.trackNumber, r.match, r.status]), [[1, "title", "READY"], [2, "title", "READY"], [3, "none", "NEEDS_REVIEW"], [4, "none", "WAITING"], [null, "none", "NEEDS_REVIEW"]]);
  assert.equal(rows[2].suggestion!.source, "Album/Eighteen v2");
  assert.ok(rows[2].issues[0].fix!.includes(`"source": "Album/Eighteen v2"`), "the fix is a pin the owner writes, not a guess");
  // Pinning the source makes it a match.
  const pinned = reconcile(manifest([{ trackNumber: 1, title: "Eighteen", source: "Album/Eighteen v2" }]), songs);
  assert.deepEqual([pinned[0].match, pinned[0].status], ["source", "READY"]);
  assert.ok(titleSimilarity("Eighteen", "Eighteen v2") >= 0.6 && titleSimilarity("Eighteen", "Pulse Song") < 0.6);
});

test("matching: different edits, missing stems and shared lead stems hold their own stage only", () => {
  const p = (d: number) => ({ codec: "pcm_s16le", sampleRate: 44100, channels: 2, bitsPerSample: 16, durationSec: d, peakDb: -6 });
  const songs = groupSources([
    sf("Edit.wav", { probe: p(100) }), sf("Edit.mp3", { probe: { ...p(92), codec: "mp3" } }),
    sf("Solo.wav", { probe: p(60) }),
    sf("Trio/0 Lead Vocal.wav", { probe: p(60) }), sf("Trio/1 Drums.wav", { probe: p(60) }), sf("Trio/Trio.wav", { probe: p(60) }),
  ]);
  const rows = reconcile(manifest([
    { trackNumber: 1, title: "Edit" },
    { trackNumber: 2, title: "Solo", voiceStrategy: "CONVERT_APPROVED_SEGMENTS", mode: "solo", performers: ["Low"] },
    { trackNumber: 3, title: "Trio", voiceStrategy: "CONVERT_APPROVED_SEGMENTS", mode: "solo", performers: ["Low", "Mid", "Top"] },
  ]), songs);
  const codes = (n: number) => rows[n].issues.map((i) => `${i.code}:${i.stage}`);
  assert.ok(codes(0).includes("DIFFERENT_EDITS:import"), "an 8 s shorter MP3 is another edit, not a copy");
  assert.equal(rows[0].status, "NEEDS_REVIEW");
  assert.ok(codes(1).includes("MISSING_STEMS:voices"));
  assert.equal(rows[1].status, "READY", "a voice hold still imports (and still gets its cue map)");
  assert.ok(codes(2).includes("OVERLAP_REQUIRES_SPLIT:voices"));
  assert.ok(rows.every((r) => r.issues.some((i) => i.code === "RIGHTS_NOT_CLEARED" && i.stage === "final")));
});

test("manifest and voice map: bad fields are named; a voice id where a name belongs is refused", () => {
  const bad = { schemaVersion: "x", albumId: "Bad Id", title: "", rights: { state: "MAYBE" }, tracks: [{ trackNumber: 1, title: "A", voiceStrategy: "CONVERT_APPROVED_SEGMENTS" }, { trackNumber: 1, title: "A" }] } as unknown as AlbumManifest;
  const codes = validateManifest(bad).map((i) => i.code);
  for (const c of ["MANIFEST_SCHEMA", "MANIFEST_ALBUM_ID", "MANIFEST_TITLE", "MANIFEST_RIGHTS", "VOICE_MODE", "TRACK_NUMBER", "TRACK_ID"]) assert.ok(codes.includes(c), c);
  const vm = validateVoiceMap({ schemaVersion: "stuttr-voice-map-1", voices: [{ performer: "Low", voice: "AbCdEfGhIjKlMnOpQrStUv", consent: "mine", approved: true }, { performer: "Mid", voice: "Mid voice", consent: "", approved: true }] });
  assert.deepEqual(vm.map((i) => i.code), ["VOICE_MAP_ID", "VOICE_CONSENT"]);
});

// ---------------------------------------------------------------- the ledger

test("ledger: the same work has the same key; done is skipped; a timeout holds; a 4xx can be retried; secrets never stored", () => {
  const l = emptyLedger();
  const a = idempotencyKey("voices", "s", ["h2", "h1"], { mode: "solo" });
  assert.equal(a.key, idempotencyKey("voices", "s", ["h1", "h2"], { mode: "solo" }).key, "input order doesn't matter");
  assert.notEqual(a.key, idempotencyKey("voices", "s", ["h1", "h2"], { mode: "crew" }).key);
  assert.deepEqual(admit(l, a.key, true), { go: true, prior: null });
  startJob(l, { ...a, stage: "voices", provider: "elevenlabs", trackId: "s", inputHashes: ["h1"], now: "t0" });
  assert.equal((admit(l, a.key, true) as { why: string }).why, "ambiguous", "left RUNNING by a crash: never resubmitted on its own");
  finishJob(l, a.key, "t1", { status: "AMBIGUOUS", code: "NO_RESPONSE", error: "fetch failed (xi-api-key: sk_abcdefghijklmnop)" });
  assert.ok(!JSON.stringify(l).includes("sk_abcdefghijklmnop"));
  assert.throws(() => resolveJob(l, a.key.slice(0, 12), "retry", "  ", "t2"), /say what you checked/);
  resolveJob(l, a.key.slice(0, 12), "retry", "not in the provider history", "t2");
  assert.equal(admit(l, a.key, true).go, true);
  startJob(l, { ...a, stage: "voices", provider: "elevenlabs", trackId: "s", inputHashes: ["h1"], now: "t3" });
  finishJob(l, a.key, "t4", { status: "SUCCEEDED" });
  assert.equal((admit(l, a.key, true) as { why: string }).why, "done");
  assert.equal(l.jobs[0].attempts, 2);
  assert.deepEqual(classifyFailure(new Error("ElevenLabs 422: bad audio")), { status: "FAILED", code: "HTTP_422" });
  assert.deepEqual(classifyFailure(new Error("ElevenLabs 503: busy")), { status: "AMBIGUOUS", code: "HTTP_503" });
  assert.deepEqual(classifyFailure(new TypeError("fetch failed")), { status: "AMBIGUOUS", code: "NO_RESPONSE" });
  assert.equal(scrub("Authorization: Bearer abc.def"), "Authorization: Bearer [removed]");
});

// ---------------------------------------------------------------- states

const facts = (o: Partial<TrackFacts> = {}): TrackFacts => ({
  albumId: "a", trackNumber: 1, trackId: "s", title: "S", row: { status: "READY", issues: [] }, strategy: "KEEP_ORIGINAL", rights: "UNKNOWN",
  inLibrary: true, analysed: true, master: { key: "suno", kind: "suno", status: "approved", current: true }, cuemap: { valid: true, issues: [] },
  pack: { cards: 3 }, shotsLeft: 0, clips: { draft: 0, approved: 3 }, videoIssues: [], voiceHolds: [], ambiguousJobs: [], renders: { draft: false, final: false }, ...o,
});

test("states: each gate in order, a hold stops only its own stage, and an ambiguous paid job is always shown", () => {
  const s = (o: Partial<TrackFacts>) => trackStatus(facts(o)).state;
  assert.equal(s({ row: { status: "WAITING", issues: [] }, inLibrary: false }), "WAITING_SOURCE");
  assert.equal(s({ inLibrary: false }), "MATCHED");
  assert.equal(s({ analysed: false }), "STAGED");
  assert.equal(s({ master: { key: "suno", kind: "suno", status: "draft", current: true } }), "AUDIO_QA");
  assert.equal(s({ cuemap: null }), "AUDIO_APPROVED");
  assert.equal(s({ pack: null }), "CUES_VALIDATED");
  assert.equal(s({ shotsLeft: 3, clips: { draft: 0, approved: 0 } }), "SHOTS_PREPARED");
  assert.equal(s({ shotsLeft: 1 }), "CLIPS_IMPORT_PENDING");
  assert.equal(s({ clips: { draft: 1, approved: 2 } }), "CLIPS_QA");
  assert.equal(s({}), "RENDER_ELIGIBLE");
  assert.equal(s({ renders: { draft: true, final: false } }), "DRAFT_RENDERED");
  // A converted song held on its voices still says what to do meanwhile.
  const held = trackStatus(facts({ strategy: "CONVERT_APPROVED_SEGMENTS", master: null, cuemap: null, voiceHolds: [{ code: "VOICE_NOT_APPROVED", severity: "block", stage: "voices", message: "x", fix: "approve it" }] }));
  assert.equal(held.state, "AUDIO_QA");
  assert.ok(held.next.includes("approve it") && held.next.some((n) => n.startsWith("meanwhile: ") && n.includes("album-plan-videos")));
  const amb = trackStatus(facts({ ambiguousJobs: [{ jobId: "abc123", stage: "voices" }] }));
  assert.ok(amb.holds.some((h) => h.code === "AMBIGUOUS_SUBMISSION" && h.fix!.includes("album-resolve a abc123")));
  assert.match(statusHtml({ title: "Empty", manifest: { rights: { state: "UNKNOWN" } } } as never, [], { tracks: 0, matched: 0, waitingOnSource: 0, needsReview: 0, inLibrary: 0, held: 0, lipSyncShots: 0, paidJobsApproved: 0, estimatedUnits: null, byState: {} }, "now"), /Awaiting activity/);
});

test("frames: 120 BPM at 24 fps is 12 a beat and 48 a bar (D8-03); 23.976 fps and 92.058 BPM are exact fractions, flagged", () => {
  assert.equal(framesPerBeat(120, 24), 12);
  assert.equal(framesPerBar(120, 24, 4), 48);
  assert.deepEqual(frameGrid("120", { num: 24, den: 1 }), { perBeat: { num: 12, den: 1 }, perBar: { num: 48, den: 1 }, integer: true, barInteger: true });
  const ntsc = frameGrid("120", { num: 24000, den: 1001 });
  assert.deepEqual([ntsc.perBeat, ntsc.integer], [{ num: 12000, den: 1001 }, false]);
  const odd = frameGrid("92.058", { num: 24, den: 1 });
  assert.deepEqual([odd.perBeat, odd.integer], [{ num: 240000, den: 15343 }, false]);
  assert.throws(() => frameGrid("92,058", { num: 24, den: 1 }), /plain decimal/);
});

test("alignment: a known 250 ms offset is found; silence and noise are unknown, never zero", () => {
  const sr = 8000, n = sr * 30;
  let seed = 3;
  const rnd = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
  const notes = Array.from({ length: 60 }, () => ({ len: 0.15 + 0.3 * rnd(), f: 200 * 2 ** (Math.floor(rnd() * 12) / 12) }));
  const vox = new Float32Array(n);
  let t0 = 2;
  for (const x of notes) { for (let i = Math.round(t0 * sr); i < Math.round((t0 + x.len * 0.8) * sr) && i < n; i++) vox[i] = 0.3 * Math.sin((2 * Math.PI * x.f * i) / sr); t0 += x.len; }
  const mix = new Float32Array(n);
  for (let i = 0; i < n; i++) mix[i] = vox[i] + ((i / sr) % 0.5 < 0.05 ? 0.4 * Math.sin((2 * Math.PI * 60 * i) / sr) : 0);
  const late = new Float32Array(n);
  for (let i = 2000; i < n; i++) late[i] = vox[i - 2000];
  assert.equal(measureOffset(mix, vox).verdict, "aligned");
  const o = measureOffset(mix, late);
  assert.deepEqual([o.verdict, o.offsetSamples, o.offsetMs], ["offset", 2000, 250]);
  assert.equal(measureOffset(mix, new Float32Array(n)).verdict, "unknown");
  assert.equal(measureOffset(mix, Float32Array.from({ length: n }, () => rnd() - 0.5)).offsetMs, null);
});

test("video QA: a short lip-sync clip and a wrong shape are held; a clip's own sound is noted, never used", () => {
  const b = { id: "lip", kind: "lip_sync", generateSec: 5, cropTo: null } as unknown as ShotBrief;
  const v = { width: 270, height: 480, durationSec: 3, fps: 24, fpsText: "24/1", variableRate: false, hasAudio: true };
  const codes = clipQa(b, v, "9:16", "lip.mp4").map((i) => `${i.code}:${i.severity}`);
  assert.deepEqual(codes, ["CLIP_TOO_SHORT:block", "CLIP_HAS_AUDIO:info"]);
  assert.deepEqual(clipQa(b, { ...v, durationSec: 5, width: 480, height: 270, hasAudio: false, variableRate: true, fpsText: "30000/1001" }, "9:16", "x").map((i) => i.code), ["ASPECT_MISMATCH", "VARIABLE_FRAME_RATE"]);
  assert.equal(clipQa(null, null, "9:16", "random.mp4")[0].code, "UNMATCHED_CLIP");
});

// ---------------------------------------------------------------- end to end

const TEST_KEY = "synthetic-test-key-0000";
/** A fake ElevenLabs: lists one synthetic voice; the first conversion times out after "acceptance", later ones return the input as MP3. */
function fakeEleven(posts: string[], timeoutsLeft: { n: number }): Fetch {
  return async (url, init) => {
    if (url.endsWith("/v1/voices")) return new Response(JSON.stringify({ voices: [{ voice_id: "id-low", name: "Synthetic Low" }] }));
    const form = init!.body as FormData;
    posts.push(url.split("?")[0]);
    if (timeoutsLeft.n > 0) { timeoutsLeft.n--; throw new TypeError("fetch failed"); }
    const wavIn = Buffer.from(await (form.get("audio") as Blob).arrayBuffer());
    const r = spawnSync("ffmpeg", ["-v", "error", "-f", "wav", "-i", "pipe:0", "-c:a", "libmp3lame", "-b:a", "192k", "-f", "mp3", "pipe:1"], { input: wavIn, maxBuffer: 1 << 28 });
    return new Response(new Uint8Array(r.stdout));
  };
}

test("album desk end to end on a synthetic album", { skip: !hasFfmpeg && "ffmpeg not installed" }, async () => {
  const root = tmp("e2e");
  const lines: string[] = [];
  const c: Ctx = { library: join(root, "library"), now: () => "2026-11-10T00:00:00.000Z", log: (l) => lines.push(l) };
  const said = (re: RegExp) => lines.some((l) => re.test(l));
  try {
    const drop = writeSyntheticAlbum(root);
    const zipBefore = hashFile(drop.zip).sha256;

    // A bad ZIP is refused whole: nothing unpacked, nothing written.
    const bad = albumImport(c, { source: drop.badZip, manifest: drop.manifest });
    assert.ok(bad.refused.some((r) => r.code === "ZIP_UNSAFE_PATH"));
    assert.ok(!existsSync(c.library), "a refused drop writes nothing");

    // Dry run: the report, nothing copied.
    const dry = albumImport(c, { source: drop.zip, manifest: drop.manifest, dryRun: true });
    assert.ok(!existsSync(join(c.library, "library.json")), "a dry run copies nothing");
    const st = Object.fromEntries(dry.rows.map((r) => [r.title, r.status]));
    assert.deepEqual(st, { "Pulse Song": "READY", "Trio Song": "READY", Interlude: "READY", "Number Song": "READY", "Say Song": "READY", Eighteen: "NEEDS_REVIEW", "Ghost Song": "READY", "Voice Song": "READY", "Missing Song": "WAITING", "Eighteen v2": "NEEDS_REVIEW" });
    const ghost = dry.rows.find((r) => r.title === "Ghost Song")!;
    assert.ok(ghost.issues.some((i) => i.code === "STEM_OFFSET" && /250 ms after/.test(i.message)), "the 250 ms late stem is caught");
    assert.ok(!dry.rows.find((r) => r.title === "Pulse Song")!.issues.some((i) => i.code.startsWith("STEM_") || i.code === "ALIGNMENT_UNKNOWN"), "aligned stems pass");

    // Import, then the same ZIP again: no new copies, no new jobs.
    const first = albumImport(c, { source: drop.zip, manifest: drop.manifest });
    assert.deepEqual(first.imported.sort(), ["ghost-song", "interlude", "number-song", "pulse-song", "say-song", "trio-song", "voice-song"]);
    const jobs1 = JSON.parse(readFileSync(ledgerPath(c, SYNTH_ALBUM_ID), "utf8")).jobs.length;
    const libBefore = readFileSync(join(c.library, "library.json"), "utf8");
    lines.length = 0;
    const again = albumImport(c, { source: drop.zip, manifest: drop.manifest });
    assert.deepEqual(again.imported, []);
    assert.ok(said(/pulse-song: already imported from these exact files; skipped/));
    assert.equal(JSON.parse(readFileSync(ledgerPath(c, SYNTH_ALBUM_ID), "utf8")).jobs.length, jobs1, "no duplicate jobs");
    assert.equal(readFileSync(join(c.library, "library.json"), "utf8"), libBefore, "no duplicate media");
    assert.equal(hashFile(drop.zip).sha256, zipBefore, "the dropped ZIP is unchanged, byte for byte");
    assert.ok(!existsSync(join(c.library, "_intake", SYNTH_ALBUM_ID)), "staging is cleared after import");
    const number = loadManifest(c).tracks.find((t) => t.trackId === "number-song")!;
    assert.deepEqual(number.files.map((f) => f.originalName), ["Number Song.wav"], "the WAV went in, the MP3 didn't");
    const sources = () => loadManifest(c).tracks.flatMap((t) => t.files).map((f) => [f.path, hashFile(join(c.library, f.path)).sha256, f.sha256]);
    for (const [p, now, rec] of sources()) assert.equal(now, rec, `${p} matches its record`);
    const sourcesBefore = JSON.stringify(sources());

    // The audio stage: free, local; the held track is skipped and the rest go on.
    await albumProcess(c, SYNTH_ALBUM_ID, { stage: "audio" });
    assert.ok(said(/ghost-song: held \(STEM_OFFSET\); skipped/));
    assert.ok(existsSync(songPaths(c, "pulse-song").analysis) && existsSync(songPaths(c, "voice-song").analysis));
    assert.ok(!existsSync(songPaths(c, "ghost-song").analysis), "a held track waits; the others don't");
    const pulse = loadManifest(c).tracks.find((t) => t.trackId === "pulse-song")!;
    assert.equal(pulse.masters?.[0].kind, "suno", "KEEP_ORIGINAL: a draft master from Suno's own vocals");

    // Voices: held without a voice map or a key; then a plan; spending only with its hash and a cap.
    let f = albumFacts(c, SYNTH_ALBUM_ID, { key: TEST_KEY });
    const voiceRow = f.rows.find((r) => r.trackId === "voice-song")!;
    assert.ok(voiceRow.holds.some((h) => h.code === "NO_VOICE_MAP"));
    writeFileSync(join(c.library, "voice-map.private.json"), JSON.stringify({ schemaVersion: "stuttr-voice-map-1", voices: [{ performer: "Performer Low", voice: "Synthetic Low", consent: "a synthetic test voice", approved: true }] }));
    const posts: string[] = [];
    const timeouts = { n: 1 };
    const eleven = { key: TEST_KEY, fetch: fakeEleven(posts, timeouts) };
    const planned = await albumProcess(c, SYNTH_ALBUM_ID, { stage: "voices", ...eleven });
    assert.deepEqual(planned.plan!.entries.map((e) => e.trackId), ["voice-song"], "trio (overlap) and say (no stem) stay out of the plan");
    assert.ok(planned.plan!.totalCredits > 0 && posts.length === 0, "the plan costs nothing");
    await assert.rejects(albumProcess(c, SYNTH_ALBUM_ID, { stage: "voices", approvedPlan: "not-the-hash", maxCredits: 1e9, ...eleven }), /plan changed/);
    await assert.rejects(albumProcess(c, SYNTH_ALBUM_ID, { stage: "voices", approvedPlan: planned.plan!.planHash, maxCredits: planned.plan!.totalCredits - 1, ...eleven }), /over --max-credits/);
    assert.equal(posts.length, 0);
    // The provider times out after taking the job: held, not resent.
    const hash = planned.plan!.planHash, cap = planned.plan!.totalCredits;
    await albumProcess(c, SYNTH_ALBUM_ID, { stage: "voices", approvedPlan: hash, maxCredits: cap, ...eleven });
    assert.equal(posts.length, 1);
    assert.ok(said(/HOLD AMBIGUOUS_SUBMISSION \(NO_RESPONSE\)/));
    await albumProcess(c, SYNTH_ALBUM_ID, { stage: "voices", approvedPlan: hash, maxCredits: cap, ...eleven });
    assert.equal(posts.length, 1, "an ambiguous job is never resubmitted on its own");
    const amb = JSON.parse(readFileSync(ledgerPath(c, SYNTH_ALBUM_ID), "utf8")).jobs.find((j: { status: string }) => j.status === "AMBIGUOUS");
    assert.ok(albumFacts(c, SYNTH_ALBUM_ID, { key: TEST_KEY }).rows.find((r) => r.trackId === "voice-song")!.holds.some((h) => h.code === "AMBIGUOUS_SUBMISSION"));
    albumResolve(c, SYNTH_ALBUM_ID, amb.jobId, "retry", "checked: not in the provider history");
    await albumProcess(c, SYNTH_ALBUM_ID, { stage: "voices", approvedPlan: hash, maxCredits: cap, ...eleven });
    assert.equal(posts.length, 2);
    assert.ok(loadManifest(c).tracks.find((t) => t.trackId === "voice-song")!.voices.some((v) => v.voice === "Synthetic Low" && v.status === "draft"), "the take waits for your ears");
    const after = await albumProcess(c, SYNTH_ALBUM_ID, { stage: "voices", ...eleven });
    assert.equal(after.plan!.totalCredits, 0, "the take exists, so the plan has nothing left to pay for");
    await assert.rejects(albumProcess(c, SYNTH_ALBUM_ID, { stage: "voices", approvedPlan: hash, maxCredits: cap, ...eleven }), /plan changed/);
    assert.equal(posts.length, 2, "done is done: no second charge");

    // Dance8: cue maps and Kling packs, then clips (one too short), QA, approvals, a draft.
    albumPlanVideos(c, SYNTH_ALBUM_ID);
    const briefs = JSON.parse(readFileSync(songPaths(c, "pulse-song").briefs, "utf8")) as ShotBrief[];
    assert.ok(briefs.some((b) => b.kind === "lip_sync"));
    const out = join(root, "kling-out", "pulse-song");
    mkdirSync(out, { recursive: true });
    const mk = (name: string, sec: number, size = "270x480") => assert.equal(spawnSync("ffmpeg", ["-v", "error", "-y", "-f", "lavfi", "-i", `color=c=gray:s=${size}:r=24:d=${sec}`, "-c:v", "libx264", "-pix_fmt", "yuv420p", join(out, name)]).status, 0);
    const lips = briefs.filter((b) => b.kind === "lip_sync");
    for (const b of briefs) mk(`${b.id}.mp4`, b === lips[0] ? Math.max(1, b.generateSec - 2) : b.generateSec);
    albumClips(c, SYNTH_ALBUM_ID, join(root, "kling-out"));
    f = albumFacts(c, SYNTH_ALBUM_ID);
    const pulseRow = f.rows.find((r) => r.trackId === "pulse-song")!;
    assert.ok(pulseRow.holds.some((h) => h.code === "CLIP_TOO_SHORT"), "fixture (h): the short lip-sync clip is held");
    const intake = JSON.parse(readFileSync(intakePath(c, SYNTH_ALBUM_ID), "utf8"));
    assert.ok(intake.tracks.find((t: { trackId: string }) => t.trackId === "pulse-song").videoQa.length >= briefs.length);
    for (const b of briefs) if (b !== lips[0]) setClipStatus(c, "pulse-song", b.id, "approved", 0.1);
    setClipStatus(c, "pulse-song", lips[0].id, "retired");
    mk(`${lips[0].id}-2.mp4`, lips[0].generateSec);
    albumClips(c, SYNTH_ALBUM_ID, join(root, "kling-out"));
    setClipStatus(c, "pulse-song", `${lips[0].id}-2`, "approved", 0.1);
    setMasterStatus(c, "pulse-song", "suno", "approved");
    f = albumFacts(c, SYNTH_ALBUM_ID);
    assert.equal(f.rows.find((r) => r.trackId === "pulse-song")!.state, "RENDER_ELIGIBLE");
    assert.ok(f.rows.find((r) => r.trackId === "pulse-song")!.holds.some((h) => h.code === "RIGHTS_NOT_CLEARED"), "rights unknown: drafts only");
    const previews = albumPreview(c, SYNTH_ALBUM_ID, { only: ["pulse-song"] });
    assert.equal(previews.length, 1);
    assert.deepEqual(previews[0].checks, { ok: true, findings: [] }, "one audio stream, the approved master, the right shape and length");
    assert.equal(albumFacts(c, SYNTH_ALBUM_ID).rows.find((r) => r.trackId === "pulse-song")!.state, "DRAFT_RENDERED");

    // Masters unchanged through everything; no key in any record; the status board and page.
    assert.equal(JSON.stringify(sources()), sourcesBefore, "every source file still matches its hash");
    for (const p of [intakePath(c, SYNTH_ALBUM_ID), ledgerPath(c, SYNTH_ALBUM_ID), voicePlanPath(c, SYNTH_ALBUM_ID)]) assert.ok(!readFileSync(p, "utf8").includes(TEST_KEY), `${p} holds no key`);
    lines.length = 0;
    const status = albumStatus(c, SYNTH_ALBUM_ID, { html: true, key: TEST_KEY });
    assert.equal(status.summary.waitingOnSource, 1);
    assert.equal(status.summary.paidJobsApproved, 1);
    assert.ok(said(/^9 Missing Song:$/) && said(/HOLD MISSING_SOURCE/));
    assert.ok(existsSync(join(c.library, "_albums", SYNTH_ALBUM_ID, "status.html")));
    assert.equal(createHash("sha256").update(readFileSync(drop.zip)).digest("hex"), zipBefore);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
