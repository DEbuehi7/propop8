// lib/dance8/choirPipeline.ts
//
// choir: the song's CHOIR8 count sheet (./motion/rhythm), from its cue map,
// written to <song>/dance8/choir/: count-sheet.html and choir-plan.json.

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { loadManifest, type Ctx } from "../stuttr/commands";
import type { CueMap } from "./contracts/scene";
import { countSheetHtml } from "./motion/countSheet";
import { planSong, type CuePlan } from "./motion/rhythm";
import { songPaths } from "./pipeline";

export function choirSheet(c: Ctx, trackId: string): { plans: CuePlan[]; file: string } {
  const log = c.log ?? ((l: string) => console.log(l));
  const t = loadManifest(c).tracks.find((x) => x.trackId === trackId);
  if (!t) throw new Error(`no song "${trackId}" in ${c.library}`);
  const p = songPaths(c, trackId);
  if (!existsSync(p.cuemap)) throw new Error(`no cue map yet; run: npm run dance8 -- plan ${trackId}`);
  const map = JSON.parse(readFileSync(p.cuemap, "utf8")) as CueMap;
  const plans = planSong(map);
  const dir = join(p.dir, "choir");
  mkdirSync(dir, { recursive: true });
  const file = join(dir, "count-sheet.html");
  writeFileSync(join(dir, "choir-plan.json"), JSON.stringify({ trackId, cueMapVersion: map.version, plans }, null, 2) + "\n");
  writeFileSync(file, countSheetHtml(t.title, plans));
  const counts = plans.reduce((n, x) => n + x.counts.length, 0);
  log(`choir count sheet: ${file} (${plans.length} cue(s), ${counts} counts)`);
  if (plans.some((x) => x.gate !== "execute")) log("  DEFER: the cue map is still a draft, so its beat grid is unchecked. Rehearse with it; film once the cue map is approved.");
  log(`open it: open "${file}"`);
  return { plans, file };
}
