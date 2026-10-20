// lib/dance8/moves/files.ts
//
// Where a song's takes live: <library>/<id>/dance8/moves/. Read-only helpers
// shared by `dance8 moves` and `dance8 plan`.

import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { MoveTrack, PoseCapture } from "../contracts/moves";

export interface MovesPaths {
  dir: string;
  readme: string;
  refs: string;
  poses: (take: string) => string;
  moves: (take: string) => string;
}

export function movesPaths(library: string, trackId: string): MovesPaths {
  const dir = join(library, trackId, "dance8", "moves");
  return { dir, readme: join(dir, "README.txt"), refs: join(dir, "refs"), poses: (t) => join(dir, `${t}.poses.json`), moves: (t) => join(dir, `${t}.moves.json`) };
}

const readJson = <T>(p: string): T => JSON.parse(readFileSync(p, "utf8")) as T;

/** Every take's moves (retired takes left out unless asked). */
export function loadTakes(library: string, trackId: string, o: { includeRetired?: boolean } = {}): MoveTrack[] {
  const mp = movesPaths(library, trackId);
  if (!existsSync(mp.dir)) return [];
  return readdirSync(mp.dir).filter((f) => f.endsWith(".moves.json")).sort()
    .map((f) => readJson<MoveTrack>(join(mp.dir, f))).filter((t) => o.includeRetired || t.approvalStatus !== "retired");
}

export function loadCapture(library: string, trackId: string, takeId: string): PoseCapture | null {
  const p = movesPaths(library, trackId).poses(takeId);
  return existsSync(p) ? readJson<PoseCapture>(p) : null;
}
