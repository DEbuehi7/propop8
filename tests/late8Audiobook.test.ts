/**
 * The Late8 audiobook (canon PL8-09): a book folder in the Stuttr library
 * becomes a publish folder for Cloudflare R2; the page reads its manifest
 * and plays it. Synthetic tones, words and a fake Wrangler only.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { clock, lineAt, parseTranscript, publishable, validateManifest, withAbsoluteUrls } from "../lib/late8/audiobook";
import { loadAudiobook } from "../lib/late8/load";
import { buildAudiobook, uploadAudiobook, type Runner } from "../lib/stuttr/audiobookCommands";
import type { Ctx } from "../lib/stuttr/commands";

const hasFfmpeg = spawnSync("ffmpeg", ["-version"]).status === 0;

test("transcript: timed and plain lines, speakers, times that go backwards are reported", () => {
  const { lines, issues } = parseTranscript("# chapter one\n[00:01.5] Narrator: The city was quiet.\n\n[0:04] Stuttr: Not for long.\nA plain line\n[00:03] Mo: Too early\n");
  assert.deepEqual(lines, [
    { t: 1.5, speaker: "Narrator", text: "The city was quiet." },
    { t: 4, speaker: "Stuttr", text: "Not for long." },
    { t: null, speaker: null, text: "A plain line" },
    { t: 3, speaker: "Mo", text: "Too early" },
  ]);
  assert.equal(issues.length, 1);
  assert.deepEqual([lineAt(lines.slice(0, 3), 0.5), lineAt(lines.slice(0, 3), 1.5), lineAt(lines.slice(0, 3), 9)], [-1, 0, 1]);
  assert.deepEqual([clock(0), clock(247.9), clock(3909)], ["0:00", "4:07", "1:05:09"]);
});

test("publishing needs approved status and cleared rights (STU-02)", () => {
  assert.deepEqual(publishable({ title: "The Pause", status: "approved", rights: "cleared" }), { ok: true, reasons: [] });
  const held = publishable({ title: "", status: "draft", rights: "unchecked" });
  assert.equal(held.ok, false);
  assert.equal(held.reasons.length, 3);
});

const manifest = () => ({
  schema: 1, bookId: "spies-1", series: "Stuttr Spies", title: "Book One", author: null, cover: "cover-aaaa1111.jpg", publishedAt: "2026-11-02T20:00:00.000Z",
  chapters: [{ id: "01-the-pause", number: 1, title: "The Pause", mission: "M01", narrator: "Mo", characters: ["Stuttr", "Mo"], scene: null, location: null,
    audio: "01-the-pause-bbbb2222.mp3", durationSec: 61.2, sha256: "x", cover: null, transcript: [{ t: 1, speaker: "Mo", text: "Hi" }] }],
});

test("manifest check: only relative file paths, at least one playable chapter; URLs made absolute (https only)", () => {
  assert.ok(validateManifest(manifest()).manifest);
  for (const audio of ["https://evil.example/x.mp3", "../x.mp3", "/x.mp3", "javascript:alert(1)"]) {
    const m = manifest();
    m.chapters[0].audio = audio;
    assert.equal(validateManifest(m).manifest, null, audio);
  }
  assert.equal(validateManifest({ ...manifest(), schema: 2 }).manifest, null);
  const abs = withAbsoluteUrls(validateManifest(manifest()).manifest!, "https://pub-1.r2.dev/spies-1/audiobook.json");
  assert.equal(abs.chapters[0].audio, "https://pub-1.r2.dev/spies-1/01-the-pause-bbbb2222.mp3");
  assert.equal(abs.cover, "https://pub-1.r2.dev/spies-1/cover-aaaa1111.jpg");
  assert.throws(() => withAbsoluteUrls(validateManifest(manifest()).manifest!, "http://pub-1.r2.dev/a.json"), /https/);
});

test("loader: not configured, bad URL, a failing or bad manifest, and a good one", async () => {
  const ok = async () => new Response(JSON.stringify(manifest()), { status: 200 });
  assert.deepEqual(await loadAudiobook(undefined, ok), { state: "not_configured" });
  assert.equal((await loadAudiobook("http://pub-1.r2.dev/spies-1/audiobook.json", ok)).state, "unavailable");
  assert.match(JSON.stringify(await loadAudiobook("https://pub-1.r2.dev/a.json", async () => new Response("no", { status: 404 }))), /answered 404/);
  assert.match(JSON.stringify(await loadAudiobook("https://pub-1.r2.dev/a.json", async () => new Response("{}", { status: 200 }))), /can't be played/);
  const good = await loadAudiobook("https://pub-1.r2.dev/spies-1/audiobook.json", ok);
  assert.equal(good.state, "ok");
  if (good.state === "ok") assert.equal(good.manifest.chapters[0].audio, "https://pub-1.r2.dev/spies-1/01-the-pause-bbbb2222.mp3");
});

test("audiobook build: approved chapters with cleared rights only, hashed stream files, the manifest last to upload", { skip: !hasFfmpeg && "ffmpeg not installed" }, () => {
  const root = mkdtempSync(join(tmpdir(), "late8-book-"));
  const lines: string[] = [];
  const c: Ctx = { library: join(root, "library"), now: () => "2026-11-02T20:00:00.000Z", log: (l) => lines.push(l) };
  const tone = (file: string, sec: number, hz: number) =>
    assert.equal(spawnSync("ffmpeg", ["-v", "error", "-y", "-f", "lavfi", "-i", `sine=frequency=${hz}:duration=${sec}`, file]).status, 0);
  try {
    const first = buildAudiobook(c, "spies-1");
    assert.equal(first.manifest, null);
    const dir = join(c.library, "audiobook", "spies-1");
    assert.match(readFileSync(join(dir, "book.txt"), "utf8"), /^series: Stuttr Spies$/m);
    assert.throws(() => buildAudiobook(c, "spies-1"), /fill in "title:"/);
    writeFileSync(join(dir, "book.txt"), "series: Stuttr Spies\ntitle: Book One (synthetic)\n");

    mkdirSync(join(dir, "01-the-pause"));
    writeFileSync(join(dir, "01-the-pause", "chapter.txt"), "title: The Pause\nmission: M01\nnarrator: Mo\ncharacters: Stuttr, Mo\nstatus: approved\nrights: cleared\n");
    writeFileSync(join(dir, "01-the-pause", "transcript.txt"), "[00:00.5] Mo: A synthetic line.\n[00:09] Mo: Past the end of the audio.\n");
    tone(join(dir, "01-the-pause", "audio.wav"), 3, 440);
    mkdirSync(join(dir, "02-two-worlds"));
    writeFileSync(join(dir, "02-two-worlds", "chapter.txt"), "title: Two Worlds\nstatus: approved\nrights: unchecked\n");
    tone(join(dir, "02-two-worlds", "audio.wav"), 2, 330);
    mkdirSync(join(dir, "03-unwritten"));

    const r = buildAudiobook(c, "spies-1");
    assert.ok(r.manifest);
    assert.deepEqual(r.manifest!.chapters.map((x) => [x.id, x.number, x.characters]), [["01-the-pause", 1, ["Stuttr", "Mo"]]]);
    assert.deepEqual(r.held.map((h) => h.folder), ["02-two-worlds", "03-unwritten"]);
    assert.match(r.held[0].reasons.join(), /rights.*not cleared/);
    assert.ok(existsSync(join(dir, "03-unwritten", "chapter.txt")), "a starter chapter.txt is made");
    const ch = r.manifest!.chapters[0];
    assert.match(ch.audio, /^01-the-pause-[0-9a-f]{8}\.mp3$/);
    assert.ok(Math.abs(ch.durationSec - 3) < 0.1, `duration ${ch.durationSec}`);
    assert.deepEqual(ch.transcript.map((l) => l.t), [0.5, null], "a time past the audio's end is dropped, never invented");
    assert.deepEqual(readdirSync(r.publishDir).sort(), [ch.audio, "audiobook.json"].sort());
    assert.ok(validateManifest(JSON.parse(readFileSync(join(r.publishDir, "audiobook.json"), "utf8"))).manifest);

    // New audio: a new file name, and the old stream file is cleaned away.
    tone(join(dir, "01-the-pause", "audio.wav"), 4, 550);
    const again = buildAudiobook(c, "spies-1");
    assert.notEqual(again.manifest!.chapters[0].audio, ch.audio);
    assert.ok(!existsSync(join(r.publishDir, ch.audio)));

    // Upload with a fake Wrangler: media first, the manifest last, then the public address.
    const calls: string[][] = [];
    const fake: Runner = (cmd, args) => {
      calls.push([cmd, ...args]);
      if (args.includes("dev-url")) return { status: 0, stdout: "Public access is enabled at https://pub-0123abc.r2.dev\n", stderr: "" };
      return { status: 0, stdout: "", stderr: "" };
    };
    const keys = uploadAudiobook(c, "spies-1", "stuttr-audio", again, fake);
    assert.deepEqual(keys, [`stuttr-audio/spies-1/${again.manifest!.chapters[0].audio}`, "stuttr-audio/spies-1/audiobook.json"]);
    assert.deepEqual(calls[0].slice(0, 7), ["npx", "--yes", "wrangler", "r2", "object", "put", keys[0]]);
    assert.ok(calls[0].includes("audio/mpeg") && calls[0].includes("--remote"));
    assert.ok(calls[1].includes("application/json"));
    assert.ok(lines.includes("Late8 reads https://pub-0123abc.r2.dev/spies-1/audiobook.json: set that as LATE8_AUDIOBOOK_URL in Netlify (once)"));
    assert.throws(() => uploadAudiobook(c, "spies-1", "Bad_Bucket", again, fake), /not an R2 bucket name/);
    const failing: Runner = () => ({ status: 1, stdout: "", stderr: "Not logged in" });
    assert.throws(() => uploadAudiobook(c, "spies-1", "stuttr-audio", again, failing), /upload stopped at .*Not logged in.*npx wrangler login/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
