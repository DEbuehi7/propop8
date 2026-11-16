// lib/dance8/instrumentPipeline.ts
//
// The Kirtled event map for a song in the Stuttr library
// (<song>/dance8/<song>.kirtled-events.json, contracts/instrument.ts). The
// first run drafts one from the song's harmony timeline for a person to edit
// and approve; every run checks the map against the beat grid, the chords and
// the instrument's canon layout and says what will be drawn and what holds.
// Offline, and nothing is paid for.

import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { basename } from "node:path";
import type { Ctx } from "../stuttr/commands";
import { loadManifest } from "../stuttr/commands";
import type { HarmonyTimeline } from "./contracts/harmony";
import type { KirtledEventMap } from "./contracts/instrument";
import type { CueMap } from "./contracts/scene";
import { checkEventMap, draftEventMap, type EventMapCheck } from "./harmony/eventMap";
import { songPaths } from "./pipeline";

const readJson = <T>(p: string): T => JSON.parse(readFileSync(p, "utf8")) as T;

export interface EventMapResult {
  file: string;
  drafted: boolean;
  check: EventMapCheck;
  /** Chords the draft left out, with the reason. */
  skipped: { harmonyEventId: string; why: string }[];
}

export function kirtledEvents(c: Ctx, trackId: string, o: { performer?: string; replace?: boolean } = {}): EventMapResult {
  const log = c.log ?? ((l: string) => console.log(l));
  if (!loadManifest(c).tracks.some((t) => t.trackId === trackId)) throw new Error(`no song "${trackId}" in ${c.library}`);
  const p = songPaths(c, trackId);
  if (!existsSync(p.cuemap)) throw new Error(`no plan yet; run: npm run dance8 -- plan ${trackId}`);
  if (!existsSync(p.harmony)) throw new Error(`no harmony timeline at ${p.harmony}; the events need chords to stand for`);
  const map = readJson<CueMap>(p.cuemap);
  const timeline = readJson<HarmonyTimeline>(p.harmony);
  const file = p.harmony.replace(/\.harmony\.json$/, ".kirtled-events.json");

  let skipped: EventMapResult["skipped"] = [];
  const drafted = !existsSync(file) || !!o.replace;
  if (drafted) {
    const d = draftEventMap(timeline, { id: `${trackId}-kirtled-events`, trackId, performer: o.performer ?? null });
    writeFileSync(file, JSON.stringify(d.map, null, 2) + "\n");
    skipped = d.skipped;
    log(`drafted ${basename(file)}: ${d.map.events.length} event${d.map.events.length === 1 ? "" : "s"} from the chord timeline; edit the hands and camera moves, then set status "approved" with approvedBy and approvedAt`);
    for (const s of skipped) log(`  left out ${s.harmonyEventId}: ${s.why}`);
  }
  const events = readJson<KirtledEventMap>(file);
  const check = checkEventMap(events, map, timeline);
  for (const e of check.errors) log(`error: ${e.path}: ${e.message}`);
  for (const w of check.warnings) log(`warning: ${w.path}: ${w.message}`);
  if (check.ok) log(`${basename(file)}: ${check.hits.length} of ${events.events.length} events drawn; the rest hold until a person verifies their chords`);
  return { file, drafted, check, skipped };
}
