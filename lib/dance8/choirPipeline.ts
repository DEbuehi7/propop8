// lib/dance8/choirPipeline.ts
//
// choir: the song's CHOIR8 count sheet (./motion/rhythm), from its cue map,
// written to <song>/dance8/choir/: count-sheet.html and choir-plan.json.
// Where the song's analysis has its onset pattern, the beat feel
// (./motion/beatFeel) lets each dancer choose which hit to land on
// (./motion/landing); --variation picks another set of choices.

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { loadManifest, type Ctx } from "../stuttr/commands";
import type { SongAnalysis } from "../stuttr/analysis";
import type { CueMap } from "./contracts/scene";
import { countSheetHtml } from "./motion/countSheet";
import { feelFromFingerprint, type BeatFeel } from "./motion/beatFeel";
import { applyLandings, feelSummary, type Landing } from "./motion/landing";
import { planSong, type CuePlan, type Role } from "./motion/rhythm";
import { songPaths } from "./pipeline";

export interface ChoirOptions {
  /** Which set of beat choices (0 = the first). */
  variation?: number;
}

/** The counted beats of a set of plans, as the feel measurement reads them. */
export function countedBeats(plans: readonly CuePlan[]) {
  return plans.flatMap((p) => p.counts.map((c) => ({ beat: c.beat, gridSec: c.timeSec, beatSec: 60 / p.bpm, pos: c.beat % p.beatsPerBar })));
}

export function choirSheet(c: Ctx, trackId: string, opts: ChoirOptions = {}): { plans: CuePlan[]; file: string } {
  const log = c.log ?? ((l: string) => console.log(l));
  const variation = opts.variation ?? 0;
  const t = loadManifest(c).tracks.find((x) => x.trackId === trackId);
  if (!t) throw new Error(`no song "${trackId}" in ${c.library}`);
  const p = songPaths(c, trackId);
  if (!existsSync(p.cuemap)) throw new Error(`no cue map yet; run: npm run dance8 -- plan ${trackId}`);
  const map = JSON.parse(readFileSync(p.cuemap, "utf8")) as CueMap;
  const analysis = existsSync(p.analysis) ? (JSON.parse(readFileSync(p.analysis, "utf8")) as SongAnalysis) : null;

  const base = planSong(map);
  const feel = feelFromFingerprint(analysis?.sync, countedBeats(base));
  const plans = applyLandings(base, new Map(feel.map((f): [number, BeatFeel] => [f.beat, f])), { variation });
  const measured = !!analysis?.sync;
  const feelNote = measured
    ? "Beat feel measured from the song's onset pattern (its Stuttr analysis), against the song's own habits at each place in the bar."
    : "Beat feel unknown: the song's analysis has no onset pattern, so everyone lands on the beat.";

  const dir = join(p.dir, "choir");
  mkdirSync(dir, { recursive: true });
  const file = join(dir, "count-sheet.html");
  writeFileSync(join(dir, "choir-plan.json"), JSON.stringify({ trackId, cueMapVersion: map.version, variation, feelMeasured: measured, plans }, null, 2) + "\n");
  writeFileSync(file, countSheetHtml(t.title, plans, { variation, feelNote }));
  const counts = plans.reduce((n, x) => n + x.counts.length, 0);
  log(`choir count sheet: ${file} (${plans.length} cue(s), ${counts} counts)`);
  if (plans.some((x) => x.gate !== "execute")) log("  DEFER: the cue map is still a draft, so its beat grid is unchecked. Rehearse with it; film once the cue map is approved.");
  for (const l of feelLines(plans, measured, variation, trackId)) log(l);
  log(`open it: open "${file}"`);
  return { plans, file };
}

const ROLES: Role[] = ["soloist", "choir", "breaker", "skater"];
const KINDS = ["push", "drag", "syncopated", "dropped"] as const;
const WORD: Record<Landing, string> = { on: "on the beat", with: "with the hit", and: "on the and", hold: "held" };

export function feelLines(plans: readonly CuePlan[], measured: boolean, variation: number, trackId: string): string[] {
  if (!measured) return [`  beat feel: unknown (no onset pattern in the song's analysis; run: npm run stuttr -- analyze ${trackId}), so everyone lands on the beat`];
  const s = feelSummary(plans);
  const shifts = KINDS.filter((k) => s.byKind[k]).map((k) => `${s.byKind[k]} ${k}`);
  if (!shifts.length) return [`  beat feel: steady on all ${s.counts} counts, so everyone lands on the beat`];
  const lines = [`  beat feel: ${shifts.join(", ")} of ${s.counts} counts; the dancers choose where to land (variation ${variation})`];
  for (const r of ROLES) {
    const ch = (["on", "with", "and", "hold"] as Landing[]).filter((l) => s.choices[r][l]).map((l) => `${s.choices[r][l]} ${WORD[l]}`);
    if (ch.length) lines.push(`    ${r}: ${ch.join(", ")}`);
  }
  lines.push(`  another set of choices: npm run dance8 -- choir ${trackId} --variation ${variation + 1}`);
  return lines;
}
