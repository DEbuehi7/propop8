/**
 * Dance8 cut planner command line.
 *
 * Print the cut plan for a cue map + clip library:
 *   npx --yes tsx scripts/dance8/cut.ts fixtures/cuemap-ghost-network-pilot.json fixtures/visual-clips-pilot.json
 *
 * Options:
 *   --seed N          another variation of the same edit (same N = same video)
 *   --approved        final render: refuse drafts, stand-in clips, unmeasured drift
 *   --short CUE_ID    only that part of the song (e.g. chorus-1) for a short/teaser
 *   --render --clips DIR --audio SONG.mp3 --out OUT.mp4
 *   --punch 0.05      zoom punch on every bar line (0 = off)
 *   --font FILE       font for the "All characters are fictional and AI-generated." caption
 *   --no-caption      leave the caption off (drafts only; --approved always adds it)
 *   --lyrics          burn in the lyric line during each sung phrase (uses vocals[].text)
 *   --edl FILE        also write a CMX 3600 EDL (open the cut in Resolve/Premiere)
 *   --briefs draft|final   list the shots still to generate, sized for
 *                     Kling 4.0 Flash (draft) or Kling 4.0 (final); --briefs-out FILE saves JSON
 *
 * A render also writes OUT.manifest.json: every clip used, where it came from,
 * its drift score, the seed and the caption. That is the provenance record.
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { FRAME_SIZE, type Cut, type CueMap, type VisualClipLibrary } from "../../lib/dance8/contracts/scene";
import { planCuts, sliceCuts } from "../../lib/dance8/runtime/CutPlanner";
import { buildFfmpegArgs } from "../../lib/dance8/render/ffmpegArgs";
import { toEdl } from "../../lib/dance8/render/edl";
import { barToSec } from "../../lib/dance8/authoring/validateCueMap";
import { GENERATORS } from "../../lib/dance8/authoring/generators";
import { shotBriefs } from "../../lib/dance8/authoring/shotBriefs";

const DISCLOSURE = "All characters are fictional and AI-generated.";
const FONT_GUESSES = [
  "/System/Library/Fonts/Supplemental/Arial Bold.ttf",
  "/System/Library/Fonts/Supplemental/Arial.ttf",
  "/Library/Fonts/Arial.ttf",
  "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf",
  "C:/Windows/Fonts/arial.ttf",
];

const argv = process.argv.slice(2);
const VALUE_FLAGS = new Set(["--seed", "--short", "--clips", "--audio", "--out", "--punch", "--font", "--edl", "--briefs", "--briefs-out"]);
const flag = (name: string) => argv.includes(name);
const opt = (name: string) => {
  const i = argv.indexOf(name);
  return i >= 0 ? argv[i + 1] : undefined;
};
const positional = argv.filter((a, i) => !a.startsWith("--") && !VALUE_FLAGS.has(argv[i - 1] ?? ""));
const [mapPath, libPath] = positional;
const fail = (msg: string, code = 2): never => {
  console.error(msg);
  process.exit(code);
};
if (!mapPath || !libPath) fail("usage: cut.ts CUEMAP.json CLIPS.json [options]  (see the top of this file)");

const map = JSON.parse(readFileSync(mapPath, "utf8")) as CueMap;
const lib = JSON.parse(readFileSync(libPath, "utf8")) as VisualClipLibrary;
const seed = opt("--seed") === undefined ? 0 : Number(opt("--seed"));
const approved = flag("--approved");
const plan = planCuts(map, lib, { requireApproved: approved, seed });

if (!plan.ok) {
  console.error("Cue map did not validate:");
  for (const i of plan.issues) console.error(`  ${i.code}  ${i.path}  ${i.message}`);
  process.exit(1);
}

const briefTier = opt("--briefs");
if (briefTier) {
  const g = briefTier === "final" ? GENERATORS["kling-4.0"] : briefTier === "draft" ? GENERATORS["kling-4.0-flash"] : fail("--briefs takes draft or final");
  const briefs = shotBriefs(map, lib, g);
  console.log(`Shots still to generate for ${g.label}: ${briefs.length}`);
  for (const b of briefs) {
    console.log(
      `  ${b.kind.padEnd(9)} ${b.cueId.padEnd(9)} ${b.sceneId}/${b.camera}`.padEnd(46) +
        ` song ${b.songStartSec.toFixed(2)}-${b.songEndSec.toFixed(2)}s  generate ${b.generateSec}s` +
        (b.voice ? `  voice ${b.voice}` : "") + (b.mouth === "hidden" ? "  NO MOUTH" : ""),
    );
  }
  const out = opt("--briefs-out");
  if (out) {
    writeFileSync(out, JSON.stringify(briefs, null, 2) + "\n");
    console.log(`Saved ${out}`);
  }
  console.log("");
}

let cuts: Cut[] = plan.cuts;
let totalSec = plan.totalSec;
let offsetSec = 0;
const shortId = opt("--short");
if (shortId) {
  const cue = map.cues.find((c) => c.id === shortId) ?? fail(`no cue named ${shortId}`);
  const s = sliceCuts(plan, map.tempo, cue.startBar, cue.endBar);
  cuts = s.cuts;
  totalSec = s.totalSec;
  offsetSec = s.offsetSec;
}

const pad = (s: string | number, n: number) => String(s).padEnd(n);
console.log(pad("#", 4) + pad("cue", 10) + pad("bars", 9) + pad("seconds", 16) + pad("camera", 12) + pad("clip @ in", 38) + "reason");
for (const c of cuts) {
  console.log(
    pad(c.index, 4) + pad(c.cueId, 10) + pad(`${c.startBar}-${c.endBar}`, 9) +
      pad(`${c.startSec.toFixed(2)}-${c.endSec.toFixed(2)}`, 16) + pad(c.camera, 12) +
      pad(`${c.clipId} @ ${c.clipInSec.toFixed(2)}s`, 38) + c.reason,
  );
}
const lipSec = cuts.filter((c) => c.reason === "lip_sync").reduce((s, c) => s + c.endSec - c.startSec, 0);
const standIns = cuts.filter((c) => c.reason === "fallback_no_match");
console.log(`\n${cuts.length} cuts, ${totalSec.toFixed(2)} s, seed ${seed}, lip-synced ${lipSec.toFixed(1)} s`);
if (standIns.length > 0) {
  console.log(`${standIns.length} shot(s) use the stand-in clip; --approved will refuse until footage exists:`);
  for (const c of standIns) console.log(`  bars ${c.startBar}-${c.endBar} ${c.cueId} ${c.sceneId}`);
}

const edlPath = opt("--edl");
if (edlPath) {
  writeFileSync(edlPath, toEdl(`${map.id} seed ${seed}${shortId ? ` ${shortId}` : ""}`, cuts, lib, 30));
  console.log(`Saved ${edlPath}`);
}

if (flag("--render")) {
  const clipDir = opt("--clips");
  const audioPath = opt("--audio");
  const outPath = opt("--out");
  if (!clipDir || !audioPath || !outPath) fail("--render needs --clips DIR --audio FILE --out FILE");

  // The plan trusts durationSec; check every file really is that long, or the
  // picture would come up short and slide off the beat.
  const used = new Set(cuts.map((c) => c.clipId));
  let bad = 0;
  for (const clip of lib.clips.filter((c) => used.has(c.id))) {
    const file = clipDir!.endsWith("/") ? clipDir + clip.file : `${clipDir}/${clip.file}`;
    const p = spawnSync("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", file]);
    const real = Number(String(p.stdout).trim());
    if (p.status !== 0 || !Number.isFinite(real)) {
      console.error(`missing or unreadable: ${file}`);
      bad++;
    } else if (real + 0.02 < clip.durationSec) {
      console.error(`${clip.id}: file is ${real.toFixed(2)} s but the library says ${clip.durationSec} s`);
      bad++;
    }
  }
  if (bad > 0) fail("Fix the clip library before rendering.", 1);

  let caption: { text: string; fontFile: string; seconds: number } | undefined;
  if (!flag("--no-caption") || approved) {
    const font = opt("--font") ?? FONT_GUESSES.find((f) => existsSync(f));
    if (!font) fail("No font found for the AI disclosure caption; pass --font FILE (or --no-caption for a draft).");
    caption = { text: DISCLOSURE, fontFile: font!, seconds: Math.min(4, totalSec) };
  }

  const [w, h] = FRAME_SIZE[map.aspect];
  const punch = opt("--punch") === undefined ? 0 : Number(opt("--punch"));
  let lyrics: { fontFile: string; lines: { text: string; startSec: number; endSec: number }[] } | undefined;
  if (flag("--lyrics")) {
    const font = opt("--font") ?? FONT_GUESSES.find((f) => existsSync(f)) ?? fail("No font found for lyrics; pass --font FILE.");
    const lines = (map.vocals ?? [])
      .filter((v) => v.text)
      .map((v) => ({
        text: v.text!,
        startSec: Math.max(0, barToSec(map.tempo, v.startBar) - offsetSec),
        endSec: Math.min(totalSec, barToSec(map.tempo, v.endBar) - offsetSec),
      }))
      .filter((l) => l.endSec > l.startSec);
    lyrics = { fontFile: font, lines };
  }
  const args = buildFfmpegArgs(cuts, lib, {
    clipDir: clipDir!, audioPath: audioPath!, outPath: outPath!, width: w, height: h, fps: 30,
    audioOffsetSec: offsetSec, punch, caption, lyrics,
  });
  const r = spawnSync("ffmpeg", args, { stdio: "inherit" });
  if (r.status !== 0) process.exit(r.status ?? 1);

  const byId = new Map(lib.clips.map((c) => [c.id, c]));
  const manifest = {
    renderedAt: new Date().toISOString(),
    cueMap: { id: map.id, version: map.version, trackId: map.trackId, approvalStatus: map.approvalStatus },
    seed,
    excerpt: shortId ?? null,
    audioOffsetSec: offsetSec,
    totalSec,
    caption: caption?.text ?? null,
    cuts: cuts.map((c) => {
      const clip = byId.get(c.clipId)!;
      return {
        index: c.index, bars: [c.startBar, c.endBar], seconds: [c.startSec, c.endSec], reason: c.reason,
        clipId: c.clipId, clipInSec: c.clipInSec, file: clip.file, source: clip.source,
        drift: clip.drift, lipSync: clip.lipSync ?? null,
      };
    }),
  };
  writeFileSync(`${outPath}.manifest.json`, JSON.stringify(manifest, null, 2) + "\n");

  console.log(`Rendered ${outPath} (+ manifest)`);
}
