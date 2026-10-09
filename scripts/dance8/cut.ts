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
 *
 * A render also writes OUT.manifest.json: every clip used, where it came from,
 * its drift score, the seed and the caption. That is the provenance record.
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import type { Cut, CueMap, VisualClipLibrary } from "../../lib/dance8/contracts/scene";
import { planCuts, sliceCuts } from "../../lib/dance8/runtime/CutPlanner";
import { buildFfmpegArgs } from "../../lib/dance8/render/ffmpegArgs";

const DISCLOSURE = "All characters are fictional and AI-generated.";
const FONT_GUESSES = [
  "/System/Library/Fonts/Supplemental/Arial Bold.ttf",
  "/System/Library/Fonts/Supplemental/Arial.ttf",
  "/Library/Fonts/Arial.ttf",
  "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf",
  "C:/Windows/Fonts/arial.ttf",
];

const argv = process.argv.slice(2);
const VALUE_FLAGS = new Set(["--seed", "--short", "--clips", "--audio", "--out", "--punch", "--font"]);
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

  const [w, h] =
    map.aspect === "9:16" ? [1080, 1920] : map.aspect === "16:9" ? [1920, 1080] : map.aspect === "4:5" ? [1080, 1350] : [1080, 1080];
  const punch = opt("--punch") === undefined ? 0 : Number(opt("--punch"));
  const args = buildFfmpegArgs(cuts, lib, {
    clipDir: clipDir!, audioPath: audioPath!, outPath: outPath!, width: w, height: h, fps: 30,
    audioOffsetSec: offsetSec, punch, caption,
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
