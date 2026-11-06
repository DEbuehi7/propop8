/**
 * Song descriptions (stuttr describe): the owner's words about each song,
 * tidied and length-checked but never rewritten, then shown where Dance8
 * work happens and used for the upload text beside a final render.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  ABOUT_DESCRIPTION_MAX, ABOUT_LOGLINE_MAX, aboutFromText, checkAbout, describeTrack, emptyManifest, type LibraryTrack,
} from "../lib/stuttr/library";
import { describeSong, loadManifest, saveManifest, type Ctx } from "../lib/stuttr/commands";
import { AI_DISCLOSURE, uploadDescription } from "../lib/dance8/render/disclosure";
import { packHtml, promptsText } from "../lib/dance8/authoring/klingPack";

const AT = "2026-11-06T12:00:00.000Z";
const track = (o: Partial<LibraryTrack> = {}): LibraryTrack => ({
  trackId: "kirtled", title: "K.I.R.T.L.E.D.", sunoPlan: "Pro", addedAt: AT, files: [], voices: [], ...o,
});

function library(): { c: Ctx & { lines: string[] }; done: () => void } {
  const root = mkdtempSync(join(tmpdir(), "stuttr-about-"));
  const lines: string[] = [];
  const c = { library: root, now: () => AT, log: (l: string) => lines.push(l), lines };
  const m = emptyManifest();
  m.tracks.push(track());
  saveManifest(c, m);
  return { c, done: () => rmSync(root, { recursive: true, force: true }) };
}

test("checkAbout tidies spacing, keeps the words, and holds the length limits", () => {
  const ok = checkAbout("  The last song:\n  the instrument   spells itself. ", "First paragraph.  \r\n\r\n\r\n\r\nSecond paragraph.\n");
  assert.deepEqual(ok, { logline: "The last song: the instrument spells itself.", description: "First paragraph.\n\nSecond paragraph.", problems: [] });
  assert.deepEqual(checkAbout("One line", "   \n  ").description, undefined, "a blank description is no description");
  assert.match(checkAbout("   ").problems[0], /logline is empty/);
  assert.match(checkAbout("x".repeat(ABOUT_LOGLINE_MAX + 1)).problems[0], /141 characters; keep it to 140/);
  assert.match(checkAbout("ok", "y".repeat(ABOUT_DESCRIPTION_MAX + 1)).problems[0], /keep it to 1800/);
  assert.deepEqual(checkAbout("x".repeat(ABOUT_LOGLINE_MAX), "y".repeat(ABOUT_DESCRIPTION_MAX)).problems, []);
});

test("a description file: the first line with words is the logline, the rest is the description", () => {
  assert.deepEqual(aboutFromText("\n\n# K.I.R.T.L.E.D.\n\nThe finale.\n\nMo calls the moves.\n"), { logline: "K.I.R.T.L.E.D.", description: "The finale.\n\nMo calls the moves." });
  assert.deepEqual(aboutFromText("#1 on the floor"), { logline: "#1 on the floor" }, "only a Markdown heading marker is dropped");
  assert.deepEqual(aboutFromText(" \n "), { logline: "" });
});

test("describe: set, keep, replace from a file, show and clear, all in library.json", () => {
  const { c, done } = library();
  try {
    assert.equal(describeSong(c, "kirtled"), null);
    assert.match(c.lines.at(-1)!, /no description yet\. Add one: npm run stuttr -- describe kirtled "One line about the song"/);
    assert.throws(() => describeSong(c, "kirtled", { description: "story only" }), /has no logline yet/);

    describeSong(c, "kirtled", { logline: "Stuttr's last song: the instrument spells itself.", description: "Seven letters, seven moves." });
    assert.deepEqual(loadManifest(c).tracks[0].about, { logline: "Stuttr's last song: the instrument spells itself.", description: "Seven letters, seven moves.", updatedAt: AT });

    describeSong(c, "kirtled", { logline: "A new first line." });
    assert.equal(loadManifest(c).tracks[0].about?.description, "Seven letters, seven moves.", "a new logline keeps the description");
    describeSong(c, "kirtled", { description: "" });
    assert.deepEqual(loadManifest(c).tracks[0].about, { logline: "A new first line.", updatedAt: AT }, '--more "" removes the description');

    const f = join(c.library, "about.md");
    writeFileSync(f, "# Five letters later\n\nThe pause belongs to the music now.\n");
    describeSong(c, "kirtled", { file: f });
    assert.deepEqual(loadManifest(c).tracks[0].about, { logline: "Five letters later", description: "The pause belongs to the music now.", updatedAt: AT });
    assert.match(describeTrack(loadManifest(c).tracks[0]), /\| about: Five letters later$/);

    assert.throws(() => describeSong(c, "kirtled", { file: f, logline: "x" }), /not both/);
    assert.throws(() => describeSong(c, "kirtled", { logline: "x".repeat(200) }), /200 characters/);
    assert.equal(loadManifest(c).tracks[0].about?.logline, "Five letters later", "a refused description changes nothing");
    assert.throws(() => describeSong(c, "nope", { logline: "x" }), /nope/);

    describeSong(c, "kirtled", { clear: true });
    assert.equal(loadManifest(c).tracks[0].about, undefined);
    assert.match(describeTrack(loadManifest(c).tracks[0]), /\| about: none yet$/);
    assert.ok(!readFileSync(join(c.library, "library.json"), "utf8").includes("Five letters later"));
  } finally {
    done();
  }
});

test("upload text: title, logline, description, then the disclosure for the audio that played", () => {
  const about = { logline: "The instrument spells itself.", description: "Mo calls the moves.\n\nThe crew answers." };
  assert.equal(uploadDescription({ title: "K.I.R.T.L.E.D.", about, audio: "voices" }),
    `K.I.R.T.L.E.D.\nThe instrument spells itself.\n\nMo calls the moves.\n\nThe crew answers.\n\n${AI_DISCLOSURE} Music made with Suno; voices converted with AI.\n`);
  assert.equal(uploadDescription({ title: "VEIN", audio: "suno" }), `VEIN\n\n${AI_DISCLOSURE} Music and vocals made with Suno.\n`);
  const longest = uploadDescription({ title: "T".repeat(100), about: { logline: "L".repeat(ABOUT_LOGLINE_MAX), description: "D".repeat(ABOUT_DESCRIPTION_MAX) }, audio: "voices" });
  assert.ok(longest.length <= 2200, `${longest.length} characters fits a 2,200-character caption`);
});

test("Kling pack: the song's words head the page and prompts file, escaped, and stay out of the prompts", () => {
  const card = {
    shotId: "b1", download: "b1.mp4", kind: "broll", tool: "Kling", lengthSec: 6, aspect: "9:16", resolution: "720p", sceneId: "street",
    camera: "wide", songStartSec: 0, songEndSec: 6, uploads: [], missing: [], prompt: "SUBJECT: a street at dusk", keyframesSec: [0], steps: [], ready: true,
  } as unknown as Parameters<typeof promptsText>[1][number];
  const about = { logline: "Stuttr & the crew <spell> it out", description: "Para one.\n\nPara two." };
  const html = packHtml([card], { title: "S", trackId: "s", downloads: "~/Downloads/s", clipsCommand: "x", href: (p) => p, about });
  assert.ok(html.includes('<p class="about">Stuttr &amp; the crew &lt;spell&gt; it out</p>'));
  assert.ok(html.includes("<summary>About the song</summary><p>Para one.</p><p>Para two.</p>"));
  assert.ok(!packHtml([card], { title: "S", trackId: "s", downloads: "d", clipsCommand: "x", href: (p) => p }).includes('class="about"'));
  const text = promptsText("S", [card], about);
  assert.match(text, /^S: Kling prompts, one per shot \(1 of 1 ready\)\nAbout the song: Stuttr & the crew <spell> it out\n\n#1  b1\.mp4/);
  assert.equal(text.split("\n").filter((l) => l.includes("Para one")).length, 0, "the longer description is not in the prompts file");
  assert.ok(text.includes("SUBJECT: a street at dusk\n") && !/SUBJECT:.*spell/.test(text));
});
