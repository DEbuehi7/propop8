/**
 * Dance8 for a song in the Stuttr library (~/StuttrLibrary, or $STUTTR_LIBRARY).
 *
 *   npm run stuttr -- analyze cloyne        (Stuttr measures the stems first)
 *   npm run dance8 -- plan cloyne --key Eb
 *   npm run dance8 -- plan cloyne --key Eb --skate breakyard_plaza   (skaters play Kirtled, canon D8-16)
 *   npm run dance8 -- clips cloyne ~/Downloads
 *   npm run dance8 -- approve-clip cloyne broll-intro-drone_wide --drift 0.1
 *   npm run dance8 -- retire-clip cloyne broll-intro-drone_wide
 *   npm run dance8 -- moves cloyne ~/Movies/me-dancing.mov   (your dance as Kirtled words, canon D8-17)
 *   npm run dance8 -- moves cloyne                            (re-read saved takes after editing the cue map)
 *
 * plan writes <id>/dance8/: cue map, harmony, Kirtled plan, clip library, shot
 * list, mouth tracks and README. It keeps a cue map, harmony or clip library
 * that already exists (yours to edit) unless --replace. Options: --key (Eb, Cm),
 * --aspect (9:16, 16:9, 4:5, 1:1, 21:9), --final (size shots for Kling 4.0).
 */
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import type { Ctx } from "../../lib/stuttr/commands";
import { ingestClips, planTrack, setClipStatus } from "../../lib/dance8/pipeline";
import { cleanupTakes, ensureModel, prepareTakes, rereadTakes, saveTakes, songForMoves, type PoseModel } from "../../lib/dance8/movesPipeline";
import { readoutLines } from "../../lib/dance8/moves/track";
import { captureTakes } from "./capture/server";
import { FRAME_SIZE, type AspectRatio } from "../../lib/dance8/contracts/scene";

const argv = process.argv.slice(2);
const flag = (name: string): string | undefined => {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 ? argv[i + 1] : undefined;
};
const has = (name: string) => argv.includes(`--${name}`);
const VALUE_FLAGS = ["library", "key", "aspect", "drift", "skate", "landing", "offset", "fps"];
const positional = argv.filter((a, i) => !a.startsWith("--") && !(i > 0 && argv[i - 1].startsWith("--") && VALUE_FLAGS.includes(argv[i - 1].slice(2))));
const expand = (p: string) => resolve(p.replace(/^~(?=$|\/)/, homedir()));
const ctx: Ctx = { library: expand(flag("library") ?? process.env.STUTTR_LIBRARY ?? join(homedir(), "StuttrLibrary")) };
const [cmd, a1, a2] = positional;

const usage = `Dance8 (${ctx.library})
  plan <trackId> [--key Eb] [--aspect 9:16] [--skate <sceneId>] [--final] [--replace]
  clips <trackId> <folder>
  approve-clip <trackId> <clipId> --drift <0-1> [--landing <sec>]
  retire-clip <trackId> <clipId>
  moves <trackId> [video ...] [--offset <song sec at video start>] [--heavy] [--no-open]`;

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
  switch (cmd) {
    case "plan": {
      if (!a1) throw new Error("plan needs a track id");
      const aspect = flag("aspect") as AspectRatio | undefined;
      if (aspect && !(aspect in FRAME_SIZE)) throw new Error(`--aspect must be one of ${Object.keys(FRAME_SIZE).join(", ")}`);
      planTrack(ctx, a1, { key: flag("key"), aspect, final: has("final"), replace: has("replace"), skate: flag("skate") });
      break;
    }
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
    case "moves":
      if (!a1) throw new Error("moves needs a track id (and your videos, or none to re-read saved takes)");
      await moves(a1, positional.slice(2));
      break;
    default:
      console.log(usage);
      if (cmd) process.exitCode = 1;
  }
}

main().catch((e) => {
  console.error(`dance8: ${(e as Error).message}`);
  process.exitCode = 1;
});
