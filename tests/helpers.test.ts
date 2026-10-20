/**
 * Helper clips (lib/helpers/registry.ts). Each registered clip has its files,
 * the files match the registry (length, size, captions), the page it names
 * exists and renders <HelperClips>, and nothing in public/helpers is left
 * over from a clip that was removed. Re-render with `npm run helpers`.
 *
 * Reads the MP4 header directly, so no ffmpeg is needed to run the tests.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { HELPERS, helperDuration, helperSize, type Helper } from "../lib/helpers/registry";
import { helperFfmpegArgs, toVtt } from "../lib/helpers/render";
import { renderableCalculators } from "../lib/diagnosticCalculators";

const ROOT = join(__dirname, "..");
const DIR = join(ROOT, "public/helpers");
/** Size budgets: a helper must load fast on a phone. */
const MAX_VIDEO_KB = 800;
const MAX_POSTER_KB = 120;
/** Routes where AI concept footage may never appear (GOV-01, GOV-17). */
const TOOL_ROUTES = /^\/(tools|audit|pricing|checkout|admin)(\/|$)/;

/** Duration (s) and picture size from an MP4 written with +faststart. */
function mp4Info(file: string) {
  const b = readFileSync(file);
  const at = (tag: string) => {
    const i = b.indexOf(tag, 0, "latin1");
    assert.ok(i > 3, `${file}: no ${tag} box`);
    return i - 4;
  };
  const mvhd = at("mvhd");
  const v1 = b[mvhd + 8] === 1;
  const scale = b.readUInt32BE(mvhd + (v1 ? 28 : 20));
  const dur = v1 ? Number(b.readBigUInt64BE(mvhd + 32)) : b.readUInt32BE(mvhd + 24);
  const tkhd = at("tkhd");
  const end = tkhd + b.readUInt32BE(tkhd);
  return {
    seconds: dur / scale,
    width: b.readUInt32BE(end - 8) >>> 16,
    height: b.readUInt32BE(end - 4) >>> 16,
    faststart: b.indexOf("moov", 0, "latin1") < b.indexOf("mdat", 0, "latin1"),
  };
}

/** The page file a route resolves to, or null. */
function pageFor(route: string): string | null {
  const direct = join(ROOT, "app", route, "page.tsx");
  if (existsSync(direct)) return direct;
  const m = route.match(/^\/tools\/([a-z0-9-]+)$/);
  if (m && renderableCalculators().some((c) => c.slug === m[1])) return join(ROOT, "app/tools/[slug]/page.tsx");
  return null;
}

test("helper ids are unique, lowercase and hyphenated", () => {
  const ids = HELPERS.map((h) => h.id);
  assert.equal(new Set(ids).size, ids.length);
  for (const id of ids) assert.match(id, /^[a-z0-9]+(-[a-z0-9]+)*$/);
});

for (const h of HELPERS) {
  test(`${h.id}: segments, captions and poster fit the clip`, () => {
    const total = helperDuration(h);
    let last = -1;
    for (const [a, b] of h.segments) {
      assert.ok(a >= 0 && b > a, `segment [${a}, ${b}]`);
      assert.ok(a >= last, "segments run forward through the recording");
      last = b;
    }
    assert.ok(total >= 3 && total <= 15, `${total.toFixed(1)} s; helpers are 3 to 15 seconds`);
    assert.ok(h.captions.length > 0);
    let prev = 0;
    for (const c of h.captions) {
      assert.ok(c.from >= prev - 1e-9 && c.to > c.from, `caption "${c.text}" overlaps or runs backwards`);
      assert.ok(c.to <= total + 0.05, `caption "${c.text}" ends after the clip (${total.toFixed(2)} s)`);
      assert.ok(c.text.length <= 110, `caption "${c.text}" is too long to read in time`);
      prev = c.to;
    }
    assert.ok(h.posterAt >= 0 && h.posterAt < total, "poster frame is inside the clip");
    assert.match(h.recorded, /^\d{4}-\d{2}-\d{2}$/);
  });

  test(`${h.id}: rendered files match the registry`, () => {
    const mp4 = join(DIR, `${h.id}.mp4`);
    const jpg = join(DIR, `${h.id}.jpg`);
    const vtt = join(DIR, `${h.id}.vtt`);
    for (const f of [mp4, jpg, vtt]) assert.ok(existsSync(f), `missing ${f}; run npm run helpers`);
    assert.ok(statSync(mp4).size <= MAX_VIDEO_KB * 1024, `${h.id}.mp4 is over ${MAX_VIDEO_KB} KB`);
    assert.ok(statSync(jpg).size <= MAX_POSTER_KB * 1024, `${h.id}.jpg is over ${MAX_POSTER_KB} KB`);
    assert.equal(readFileSync(vtt, "utf8"), toVtt(h.captions), `${h.id}.vtt is out of date; run npm run helpers -- --captions`);
    const info = mp4Info(mp4);
    assert.ok(Math.abs(info.seconds - helperDuration(h)) <= 0.15, `${h.id}.mp4 is ${info.seconds.toFixed(2)} s, the registry says ${helperDuration(h).toFixed(2)} s; re-render it`);
    assert.deepEqual({ width: info.width, height: info.height }, helperSize(h));
    assert.ok(info.faststart, "index at the front so playback starts before the download ends");
  });

  test(`${h.id}: its page exists and shows helper clips`, () => {
    const page = pageFor(h.route);
    assert.ok(page, `${h.route} is not a page`);
    assert.match(readFileSync(page, "utf8"), /<HelperClips\b/, `${page} does not render <HelperClips>`);
    if (h.kind === "concept") assert.doesNotMatch(h.route, TOOL_ROUTES, "concept footage stays off the tools and paid flows");
    if (h.kind === "task") assert.ok(h.exampleData, "recordings use example data (GOV-17)");
  });
}

test("public/helpers holds only registered clips", () => {
  const known = new Set(HELPERS.flatMap((h) => [`${h.id}.mp4`, `${h.id}.jpg`, `${h.id}.vtt`]));
  const extra = readdirSync(DIR).filter((f) => !known.has(f));
  assert.deepEqual(extra, [], "remove files for clips that are no longer in the registry");
});

test("ffmpeg arguments: one input per segment, no audio, web-ready MP4", () => {
  const h: Helper = { ...HELPERS[0], segments: [[1, 2], [5, 7.5]] };
  const args = helperFfmpegArgs(h, "in.mp4", "out.mp4");
  assert.deepEqual(args.filter((a, i) => args[i - 1] === "-i"), ["in.mp4", "in.mp4"]);
  assert.deepEqual(args.slice(args.indexOf("-ss"), args.indexOf("-ss") + 4), ["-ss", "1.000", "-t", "1.000"]);
  const graph = args[args.indexOf("-filter_complex") + 1];
  assert.match(graph, /concat=n=2:v=1:a=0,format=yuv420p\[out\]/);
  assert.match(graph, new RegExp(`crop=iw:${h.crop.height}:0:${h.crop.y}`));
  for (const flag of ["-an", "+faststart", "libx264"]) assert.ok(args.includes(flag), flag);
  assert.throws(() => helperFfmpegArgs({ ...h, segments: [[3, 2]] }, "a", "b"), /bad segment/);
});

test("captions are written as WebVTT", () => {
  assert.equal(
    toVtt([{ from: 0, to: 2.5, text: "One" }, { from: 2.5, to: 61.25, text: "Two" }]),
    "WEBVTT\n\n1\n00:00:00.000 --> 00:00:02.500\nOne\n\n2\n00:00:02.500 --> 00:01:01.250\nTwo\n",
  );
});
