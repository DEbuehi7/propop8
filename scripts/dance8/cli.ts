/**
 * Dance8 for a song in the Stuttr library (~/StuttrLibrary, or $STUTTR_LIBRARY).
 *
 *   npm run stuttr -- analyze cloyne        (Stuttr measures the stems first)
 *   npm run dance8 -- plan cloyne --key Eb
 *   npm run dance8 -- plan cloyne --key Eb --skate breakyard_plaza   (skaters play Kirtled, canon D8-16)
 *   npm run dance8 -- clips cloyne ~/Downloads
 *   npm run dance8 -- approve-clip cloyne broll-intro-drone_wide --drift 0.1
 *   npm run dance8 -- retire-clip cloyne broll-intro-drone_wide
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
import { FRAME_SIZE, type AspectRatio } from "../../lib/dance8/contracts/scene";

const argv = process.argv.slice(2);
const flag = (name: string): string | undefined => {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 ? argv[i + 1] : undefined;
};
const has = (name: string) => argv.includes(`--${name}`);
const VALUE_FLAGS = ["library", "key", "aspect", "drift", "skate", "landing"];
const positional = argv.filter((a, i) => !a.startsWith("--") && !(i > 0 && argv[i - 1].startsWith("--") && VALUE_FLAGS.includes(argv[i - 1].slice(2))));
const expand = (p: string) => resolve(p.replace(/^~(?=$|\/)/, homedir()));
const ctx: Ctx = { library: expand(flag("library") ?? process.env.STUTTR_LIBRARY ?? join(homedir(), "StuttrLibrary")) };
const [cmd, a1, a2] = positional;

const usage = `Dance8 (${ctx.library})
  plan <trackId> [--key Eb] [--aspect 9:16] [--skate <sceneId>] [--final] [--replace]
  clips <trackId> <folder>
  approve-clip <trackId> <clipId> --drift <0-1> [--landing <sec>]
  retire-clip <trackId> <clipId>`;

try {
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
    default:
      console.log(usage);
      if (cmd) process.exitCode = 1;
  }
} catch (e) {
  console.error(`dance8: ${(e as Error).message}`);
  process.exitCode = 1;
}
