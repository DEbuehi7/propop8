/**
 * Dance8 cut planner command line.
 *
 * Print the cut plan for a cue map + clip library:
 *   npx --yes tsx scripts/dance8/cut.ts fixtures/cuemap-ghost-network-pilot.json fixtures/visual-clips-pilot.json
 *
 * Render it over the song (needs ffmpeg; clip files named as in the library):
 *   npx --yes tsx scripts/dance8/cut.ts CUEMAP.json CLIPS.json --render --clips DIR --audio SONG.mp3 --out OUT.mp4
 *
 * Add --approved to refuse drafts and missing footage (use for the final render).
 */
import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import type { CueMap, VisualClipLibrary } from "../../lib/dance8/contracts/scene";
import { planCuts } from "../../lib/dance8/runtime/CutPlanner";
import { buildFfmpegArgs } from "../../lib/dance8/render/ffmpegArgs";

const argv = process.argv.slice(2);
const flag = (name: string) => argv.includes(name);
const opt = (name: string) => {
  const i = argv.indexOf(name);
  return i >= 0 ? argv[i + 1] : undefined;
};
const [mapPath, libPath] = argv.filter((a, i) => !a.startsWith("--") && !argv[i - 1]?.startsWith("--"));
if (!mapPath || !libPath) {
  console.error("usage: cut.ts CUEMAP.json CLIPS.json [--approved] [--render --clips DIR --audio FILE --out FILE]");
  process.exit(2);
}

const map = JSON.parse(readFileSync(mapPath, "utf8")) as CueMap;
const lib = JSON.parse(readFileSync(libPath, "utf8")) as VisualClipLibrary;
const plan = planCuts(map, lib, { requireApproved: flag("--approved") });

if (!plan.ok) {
  console.error("Cue map did not validate:");
  for (const i of plan.issues) console.error(`  ${i.code}  ${i.path}  ${i.message}`);
  process.exit(1);
}

const pad = (s: string | number, n: number) => String(s).padEnd(n);
console.log(pad("#", 4) + pad("cue", 10) + pad("bars", 9) + pad("seconds", 16) + pad("camera", 12) + pad("clip @ in", 30) + "reason");
for (const c of plan.cuts) {
  console.log(
    pad(c.index, 4) + pad(c.cueId, 10) + pad(`${c.startBar}-${c.endBar}`, 9) +
      pad(`${c.startSec.toFixed(2)}-${c.endSec.toFixed(2)}`, 16) + pad(c.camera, 12) +
      pad(`${c.clipId} @ ${c.clipInSec.toFixed(2)}s`, 30) + c.reason,
  );
}
console.log(`\n${plan.cuts.length} cuts, ${plan.totalSec.toFixed(2)} s`);

if (flag("--render")) {
  const clipDir = opt("--clips");
  const audioPath = opt("--audio");
  const outPath = opt("--out");
  if (!clipDir || !audioPath || !outPath) {
    console.error("--render needs --clips DIR --audio FILE --out FILE");
    process.exit(2);
  }
  // The plan trusts durationSec; check every file really is that long, or the
  // picture would come up short and slide off the beat.
  const used = new Set(plan.cuts.map((c) => c.clipId));
  let bad = 0;
  for (const clip of lib.clips.filter((c) => used.has(c.id))) {
    const file = clipDir.endsWith("/") ? clipDir + clip.file : `${clipDir}/${clip.file}`;
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
  if (bad > 0) {
    console.error("Fix the clip library before rendering.");
    process.exit(1);
  }
  const [w, h] = map.aspect === "9:16" ? [1080, 1920] : map.aspect === "16:9" ? [1920, 1080] : map.aspect === "4:5" ? [1080, 1350] : [1080, 1080];
  const args = buildFfmpegArgs(plan.cuts, lib, { clipDir, audioPath, outPath, width: w, height: h, fps: 30 });
  const r = spawnSync("ffmpeg", args, { stdio: "inherit" });
  if (r.status !== 0) process.exit(r.status ?? 1);
  console.log(`Rendered ${outPath}`);
}
