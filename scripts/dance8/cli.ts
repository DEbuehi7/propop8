/**
 * Dance8 for a song in the Stuttr library (~/StuttrLibrary, or $STUTTR_LIBRARY).
 *
 *   npm run stuttr -- analyze cloyne        (Stuttr measures the stems first)
 *   npm run dance8 -- plan cloyne --key Eb
 *   npm run dance8 -- plan cloyne --key Eb --skate breakyard_plaza   (skaters play Kirtled, canon D8-16)
 *   npm run dance8 -- kling cloyne                            (the upload pack: files and a prompt per shot)
 *   npm run dance8 -- kling cloyne --budget 600               (only what fits 600 credits, most important first)
 *   npm run dance8 -- kling cloyne --model kling-3.0-720p     (b-roll, lip sync and tricks on Kling 3.0 at 720p)
 *   npm run dance8 -- kling cloyne --zip                      (this batch as one zip, every upload inside, for the phone)
 *   npm run dance8 -- choir cloyne                            (CHOIR8 count sheet: one eight-count grammar for choir, breaker and skater)
 *   npm run dance8 -- choir cloyne --variation 1              (another set of beat choices where the song's rhythm shifts)
 *   npm run dance8 -- clips cloyne ~/Downloads/cloyne
 *   npm run dance8 -- approve-clip cloyne broll-intro-drone_wide --drift 0.1
 *   npm run dance8 -- retire-clip cloyne broll-intro-drone_wide
 *   npm run dance8 -- moves cloyne ~/Movies/me-dancing.mov   (your dance as Kirtled words, canon D8-17)
 *   npm run dance8 -- moves cloyne                            (re-read saved takes after editing the cue map)
 *   npm run dance8 -- plan cloyne --skate breakyard_plaza --dance breakyard_plaza   (your dance styles the skaters, D8-18,
 *                                                            and becomes the dancers' motion references)
 *   npm run dance8 -- check-moves cloyne                      (did each generated dancer keep your timing?)
 *   npm run dance8 -- style                                   (your style across every song you have danced to)
 *   npm run dance8 -- render cloyne --short chorus-1          (a draft short from the approved clips)
 *   npm run dance8 -- render cloyne --approved                (the final, with the AI disclosure caption)
 *     The audio is the song's Stuttr voice master (npm run stuttr -- master), never the Suno mix (D8-14).
 *   npm run dance8 -- react ~/Music/edo.features.json --windows ~/Music/edo-windows.csv --out ~/Movies/edo-reaction --base ~/Movies/edo-rough-cut.mp4
 *     The visual reaction layer (canon D8-25): silent overlays drawn from Stuttr's saved feature file
 *     (npm run stuttr -- visual-features), a reduced-motion version of each, and with --base the
 *     footage excerpts, Screen-blended composites and preview.html. Offline; nothing is paid for.
 *
 * plan writes <id>/dance8/: cue map, harmony, Kirtled plan, clip library, shot
 * list, mouth tracks and README. It keeps a cue map, harmony or clip library
 * that already exists (yours to edit) unless --replace. Options: --key (Eb, Cm),
 * --aspect (9:16, 16:9, 4:5, 1:1, 21:9), --final (size shots for Kling 4.0).
 */
import { spawnSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import type { Ctx } from "../../lib/stuttr/commands";
import { ingestClips, planTrack, renderArgs, setClipStatus } from "../../lib/dance8/pipeline";
import { klingPack } from "../../lib/dance8/klingPipeline";
import { choirSheet } from "../../lib/dance8/choirPipeline";
import {
  buildStyle, checkLines, cleanupTakes, clipsToCheck, ensureModel, prepareClipFrames, prepareTakes, rereadTakes, saveChecks, saveTakes, songForMoves, type PoseModel,
} from "../../lib/dance8/movesPipeline";
import { styleLines } from "../../lib/dance8/moves/style";
import { readoutLines } from "../../lib/dance8/moves/track";
import { captureTakes } from "./capture/server";
import { FRAME_SIZE, type AspectRatio } from "../../lib/dance8/contracts/scene";
import { albumPreview } from "../../lib/stuttr/desk/desk";
import { reactionInputsExist, renderReaction } from "../../lib/dance8/reactionPipeline";

const argv = process.argv.slice(2);
const flag = (name: string): string | undefined => {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 ? argv[i + 1] : undefined;
};
const has = (name: string) => argv.includes(`--${name}`);
const VALUE_FLAGS = ["library", "key", "aspect", "drift", "skate", "landing", "offset", "fps", "dance", "crew", "short", "seed", "punch", "master", "budget", "model", "variation", "only", "windows", "out", "base", "events", "song", "expect-sha"];
const positional = argv.filter((a, i) => !a.startsWith("--") && !(i > 0 && argv[i - 1].startsWith("--") && VALUE_FLAGS.includes(argv[i - 1].slice(2))));
const expand = (p: string) => resolve(p.replace(/^~(?=$|\/)/, homedir()));
const ctx: Ctx = { library: expand(flag("library") ?? process.env.STUTTR_LIBRARY ?? join(homedir(), "StuttrLibrary")) };
const [cmd, a1, a2] = positional;

const usage = `Dance8 (${ctx.library})
  plan <trackId> [--key Eb] [--aspect 9:16] [--skate <sceneId>] [--dance <sceneId,...>] [--crew 8] [--final] [--replace]
  kling <trackId> [--budget <credits>] [--model <generator>] [--zip]   (upload pack: files, a prompt and credits per shot, in <song>/dance8/kling/)
  clips <trackId> <folder>
  choir <trackId> [--variation N]                    (CHOIR8 count sheet, in <song>/dance8/choir/; N picks another set of beat choices)
  approve-clip <trackId> <clipId> --drift <0-1> [--landing <sec>]
  retire-clip <trackId> <clipId>
  moves <trackId> [video ...] [--offset <song sec at video start>] [--heavy] [--no-open]
  check-moves <trackId> [clipId ...] [--shift] [--again] [--no-open]
  style
  render <trackId> [--short <cueId>] [--approved] [--master en|suno] [--seed N] [--punch 0.05] [--lyrics] [--fps 24] [--edl]
  album preview <albumId> [--short <cueId>] [--only <trackId,...>]   (local drafts for every eligible track; same as npm run stuttr -- album-preview)
  react <features.json> --windows <windows.csv|json> --out <folder> [--base <footage.mp4>] [--events <verified.json>] [--song <id>] [--expect-sha <audio sha256>]`;

async function checkMoves(trackId: string, ids: string[]) {
  const { lib, clips } = clipsToCheck(ctx, trackId, ids, has("again"));
  if (!clips.length) { console.log("no dancer clips to check (use --again to check them again)"); return; }
  const prepared = prepareClipFrames(ctx, trackId, clips);
  try {
    const model = await ensureModel(ctx, (has("heavy") ? "heavy" : "full") as PoseModel);
    const tracked = await captureTakes(prepared, { modelPath: model.path, open: !has("no-open"), log: (l) => console.log(l) });
    for (const l of checkLines(saveChecks(ctx, trackId, lib, prepared, tracked, { shift: has("shift") }), trackId)) console.log(l);
    console.log("these are measurements; approve each clip yourself with approve-clip --drift");
  } finally {
    cleanupTakes(prepared);
  }
}

async function moves(trackId: string, videos: string[]) {
  const song = songForMoves(ctx, trackId);
  const o = flag("offset");
  const offsetSec = o === undefined ? undefined : Number(o);
  if (offsetSec !== undefined && !Number.isFinite(offsetSec)) throw new Error("--offset must be a number of seconds (negative if the video starts before the song)");
  if (!videos.length) {
    const tracks = rereadTakes(ctx, song, { offsetSec });
    for (const t of tracks) for (const l of readoutLines(t, song.map)) console.log(l);
    return;
  }
  const f = flag("fps");
  const prepared = await prepareTakes(ctx, song, videos.map(expand), { offsetSec, fps: f === undefined ? undefined : Number(f) });
  if (!prepared.length) {
    for (const t of rereadTakes(ctx, song, { offsetSec })) for (const l of readoutLines(t, song.map)) console.log(l);
    return;
  }
  try {
    const model = await ensureModel(ctx, (has("heavy") ? "heavy" : "full") as PoseModel);
    const tracked = await captureTakes(prepared, { modelPath: model.path, open: !has("no-open"), log: (l) => console.log(l) });
    const tracks = saveTakes(ctx, song, prepared, tracked, model);
    for (const t of tracks) for (const l of readoutLines(t, song.map)) console.log(l);
    console.log(`saved to ${join(ctx.library, trackId, "dance8", "moves")} (README.txt lists every move)`);
  } finally {
    cleanupTakes(prepared);
  }
}

async function main() {
  if (has("help")) { console.log(usage); return; }
  switch (cmd) {
    case "react": {
      if (!a1 || !flag("windows") || !flag("out")) throw new Error("react needs a feature file, --windows <file> and --out <folder>");
      const missing = reactionInputsExist([expand(a1), expand(flag("windows")!), flag("base") && expand(flag("base")!), flag("events") && expand(flag("events")!)]);
      if (missing.length) throw new Error(`not found: ${missing.join(", ")}`);
      const r = await renderReaction({
        featuresPath: expand(a1), windowsPath: expand(flag("windows")!), outDir: expand(flag("out")!),
        basePath: flag("base") ? expand(flag("base")!) : undefined, eventsPath: flag("events") ? expand(flag("events")!) : undefined,
        songId: flag("song"), expectSourceSha256: flag("expect-sha"), log: (l) => console.log(l),
      });
      for (const h of r.held) console.log(`HOLD ${h.window ?? "all"} (${h.kind}): ${h.reason}`);
      console.log(r.failed.length ? `${r.failed.length} check(s) failed; see reaction-manifest.json` : `all checks passed\n  ${expand(flag("out")!)}`);
      if (r.failed.length) process.exitCode = 1;
      break;
    }
    case "album": {
      if (a1 !== "preview" || !a2) throw new Error("album needs: preview <albumId>");
      albumPreview(ctx, a2, { short: flag("short"), only: flag("only")?.split(",") });
      break;
    }
    case "plan": {
      if (!a1) throw new Error("plan needs a track id");
      const aspect = flag("aspect") as AspectRatio | undefined;
      if (aspect && !(aspect in FRAME_SIZE)) throw new Error(`--aspect must be one of ${Object.keys(FRAME_SIZE).join(", ")}`);
      const crew = flag("crew");
      if (crew !== undefined && !(Number.isInteger(Number(crew)) && Number(crew) >= 1)) throw new Error("--crew must be a whole number of skaters");
      planTrack(ctx, a1, {
        key: flag("key"), aspect, final: has("final"), replace: has("replace"), skate: flag("skate"),
        dance: flag("dance")?.split(",").map((x) => x.trim()).filter(Boolean), crew: crew === undefined ? undefined : Number(crew),
      });
      break;
    }
    case "kling":
      if (!a1) throw new Error("kling needs a track id");
      klingPack(ctx, a1, { budget: flag("budget") === undefined ? undefined : Number(flag("budget")), model: flag("model"), zip: has("zip") });
      break;
    case "choir":
      if (!a1) throw new Error("choir needs a track id");
      {
        const v = flag("variation");
        if (v !== undefined && !(Number.isInteger(Number(v)) && Number(v) >= 0)) throw new Error("--variation must be a whole number, 0 or more");
        choirSheet(ctx, a1, { variation: v === undefined ? undefined : Number(v) });
      }
      break;
    case "clips":
      if (!a1 || !a2) throw new Error("clips needs a track id and a folder of downloads");
      ingestClips(ctx, a1, expand(a2));
      break;
    case "approve-clip":
    case "retire-clip": {
      if (!a1 || !a2) throw new Error(`${cmd} needs a track id and a clip id`);
      const d = flag("drift");
      const l = flag("landing");
      setClipStatus(ctx, a1, a2, cmd === "approve-clip" ? "approved" : "retired", d === undefined ? undefined : Number(d), l === undefined ? undefined : Number(l));
      break;
    }
    case "check-moves":
      if (!a1) throw new Error("check-moves needs a track id");
      await checkMoves(a1, positional.slice(2));
      break;
    case "style": {
      const { profile, path } = buildStyle(ctx);
      for (const l of styleLines(profile)) console.log(l);
      console.log(`saved to ${path}; plan uses it for songs you have not danced to`);
      break;
    }
    case "moves":
      if (!a1) throw new Error("moves needs a track id (and your videos, or none to re-read saved takes)");
      await moves(a1, positional.slice(2));
      break;
    case "render": {
      if (!a1) throw new Error("render needs a track id");
      const num = (name: string) => {
        const v = flag(name);
        if (v === undefined) return undefined;
        if (!Number.isFinite(Number(v))) throw new Error(`--${name} must be a number`);
        return Number(v);
      };
      const { args, out, audio, upload } = renderArgs(ctx, a1, {
        short: flag("short"), seed: num("seed"), approved: has("approved"), punch: num("punch"), lyrics: has("lyrics"), fps: num("fps"), edl: has("edl"),
        master: flag("master"),
      });
      console.log(`audio: ${audio.path} (${audio.status})`);
      mkdirSync(dirname(out), { recursive: true });
      const r = spawnSync("npx", ["--yes", "tsx", join(__dirname, "cut.ts"), ...args], { stdio: "inherit" });
      if (r.status !== 0) { process.exitCode = r.status ?? 1; break; }
      if (has("approved")) {
        // The text to paste when uploading: title, the song's description, the disclosure.
        writeFileSync(`${out}.description.txt`, upload.text);
        console.log(`upload text: ${out}.description.txt${upload.described ? "" : ` (no song description yet, so only the title and disclosure; write one with npm run stuttr -- describe ${a1} "One line about the song" and render again, or paste it in)`}`);
      }
      break;
    }
    default:
      console.log(usage);
      if (cmd) process.exitCode = 1;
  }
}

main().catch((e) => {
  console.error(`dance8: ${(e as Error).message}`);
  process.exitCode = 1;
});
