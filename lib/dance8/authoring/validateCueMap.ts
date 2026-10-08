// lib/dance8/authoring/validateCueMap.ts
//
// Pure, deterministic, non-throwing validator for the scene/camera cue map.
// Same conventions as validateBundle: fixed issue order, nothing invented.
// A cue map that fails here never reaches the cut planner.

import type { CameraShot, Cue, CueMap, VisualClip, VisualClipLibrary } from "../contracts/scene";

export type CueMapIssueCode =
  | "schema_version"
  | "duplicate_id"
  | "invalid_number"
  | "tempo_invalid"
  | "cue_order"
  | "no_clip_for_shot"
  | "clip_too_short"
  | "drift_unmeasured"
  | "drift_too_high"
  | "fallback_invalid"
  | "not_approved"
  | "approval_incomplete";

export interface CueMapIssue {
  code: CueMapIssueCode;
  path: string;
  message: string;
}

export interface CueMapValidation {
  ok: boolean;
  issues: CueMapIssue[];
}

const EPS = 1e-9;

function isPosNum(n: unknown): n is number {
  return typeof n === "number" && Number.isFinite(n) && n > 0;
}
function isBar(n: unknown): n is number {
  return typeof n === "number" && Number.isInteger(n) && n >= 0;
}

/** True when a clip may be placed on screen for this cue map. */
export function isEligible(clip: VisualClip, map: Pick<CueMap, "aspect" | "maxDriftScore">): boolean {
  return (
    clip.approvalStatus === "approved" &&
    clip.aspect === map.aspect &&
    clip.drift.status === "known" &&
    clip.drift.driftScore !== null &&
    clip.drift.driftScore <= map.maxDriftScore + EPS
  );
}

/** Eligible clips for one scene + camera, in stable id order. */
export function candidatesFor(
  library: VisualClipLibrary,
  map: Pick<CueMap, "aspect" | "maxDriftScore">,
  sceneId: string,
  camera: CameraShot,
): VisualClip[] {
  return library.clips
    .filter((c) => c.sceneId === sceneId && c.camera === camera && isEligible(c, map))
    .sort((a, b) => a.id.localeCompare(b.id));
}

/** Seconds from bar 0 to the start of `bar`, using the tempo segments. */
export function barToSec(tempo: CueMap["tempo"], bar: number): number {
  let sec = 0;
  for (let i = 0; i < tempo.length; i++) {
    const seg = tempo[i];
    if (bar <= seg.startBar) break;
    const segEnd = i + 1 < tempo.length ? tempo[i + 1].startBar : Infinity;
    const bars = Math.min(bar, segEnd) - seg.startBar;
    sec += (bars * seg.beatsPerBar * 60) / seg.bpm;
  }
  return Math.round(sec * 1e6) / 1e6;
}

export function validateCueMap(
  map: CueMap,
  library: VisualClipLibrary,
  opts: { requireApproved?: boolean } = {},
): CueMapValidation {
  const issues: CueMapIssue[] = [];
  const add = (code: CueMapIssueCode, path: string, message: string) => issues.push({ code, path, message });

  if (map.schemaVersion !== 1) add("schema_version", "schemaVersion", "must be 1");

  // Clip library: unique ids, sane numbers, drift measured on approved clips.
  const seen = new Set<string>();
  library.clips.forEach((c, i) => {
    const p = `library.clips[${i}]`;
    if (seen.has(c.id)) add("duplicate_id", `${p}.id`, `duplicate clip id ${c.id}`);
    seen.add(c.id);
    if (!isPosNum(c.durationSec)) add("invalid_number", `${p}.durationSec`, "must be a number > 0");
    if (c.approvalStatus === "approved") {
      if (c.drift.status !== "known" || c.drift.driftScore === null) {
        add("drift_unmeasured", `${p}.drift`, `${c.id} is approved but its drift has not been measured`);
      } else if (c.drift.driftScore > map.maxDriftScore + EPS) {
        add("drift_too_high", `${p}.drift.driftScore`,
          `${c.id} drift ${c.drift.driftScore} is above the limit ${map.maxDriftScore}`);
      }
    }
  });

  if (!(typeof map.maxDriftScore === "number" && map.maxDriftScore >= 0 && map.maxDriftScore <= 1)) {
    add("invalid_number", "maxDriftScore", "must be between 0 and 1");
  }

  // Tempo: starts at bar 0, strictly ascending, positive bpm and beats per bar.
  let tempoOk = Array.isArray(map.tempo) && map.tempo.length > 0;
  if (!tempoOk) add("tempo_invalid", "tempo", "at least one tempo segment is required");
  map.tempo?.forEach((s, i) => {
    const p = `tempo[${i}]`;
    if (!isBar(s.startBar)) { add("tempo_invalid", `${p}.startBar`, "must be a whole bar >= 0"); tempoOk = false; }
    if (!isPosNum(s.bpm)) { add("tempo_invalid", `${p}.bpm`, "must be > 0"); tempoOk = false; }
    if (!(Number.isInteger(s.beatsPerBar) && s.beatsPerBar > 0)) {
      add("tempo_invalid", `${p}.beatsPerBar`, "must be a whole number > 0"); tempoOk = false;
    }
    if (i === 0 && s.startBar !== 0) { add("tempo_invalid", `${p}.startBar`, "first segment must start at bar 0"); tempoOk = false; }
    if (i > 0 && !(s.startBar > map.tempo[i - 1].startBar)) {
      add("tempo_invalid", `${p}.startBar`, "segments must be in ascending bar order"); tempoOk = false;
    }
  });

  // Cues: start at bar 0, contiguous, no overlap, at least one camera, positive shot length.
  const cueIds = new Set<string>();
  let expectBar = 0;
  const cuesOk: Cue[] = [];
  if (!Array.isArray(map.cues) || map.cues.length === 0) add("cue_order", "cues", "at least one cue is required");
  map.cues?.forEach((c, i) => {
    const p = `cues[${i}]`;
    if (cueIds.has(c.id)) add("duplicate_id", `${p}.id`, `duplicate cue id ${c.id}`);
    cueIds.add(c.id);
    let ok = true;
    if (!isBar(c.startBar) || !isBar(c.endBar) || c.endBar <= c.startBar) {
      add("cue_order", p, "startBar and endBar must be whole bars with endBar > startBar"); ok = false;
    } else if (c.startBar !== expectBar) {
      add("cue_order", `${p}.startBar`, `expected bar ${expectBar} (cues must be contiguous with no gaps or overlaps)`);
      ok = false;
    }
    if (!(Number.isInteger(c.shotBars) && c.shotBars > 0)) { add("invalid_number", `${p}.shotBars`, "must be a whole number > 0"); ok = false; }
    if (!Array.isArray(c.cameras) || c.cameras.length === 0) { add("cue_order", `${p}.cameras`, "at least one camera is required"); ok = false; }
    if (isBar(c.endBar)) expectBar = c.endBar;
    if (ok) cuesOk.push(c);
  });

  // Fallback must exist and be eligible.
  const fallback = library.clips.find((c) => c.id === map.fallbackClipId);
  if (!fallback) add("fallback_invalid", "fallbackClipId", `clip ${map.fallbackClipId} is not in the library`);
  else if (!isEligible(fallback, map)) {
    add("fallback_invalid", "fallbackClipId", `clip ${fallback.id} must be approved, ${map.aspect}, and drift-checked within the limit`);
  }

  // Every cue/camera needs an eligible clip long enough for at least one bar.
  if (tempoOk) {
    for (const c of cuesOk) {
      let longestBar = 0;
      for (let b = c.startBar; b < c.endBar; b++) {
        longestBar = Math.max(longestBar, barToSec(map.tempo, b + 1) - barToSec(map.tempo, b));
      }
      for (const cam of [...new Set(c.cameras)]) {
        const cands = candidatesFor(library, map, c.sceneId, cam);
        const path = `cues[${map.cues.indexOf(c)}]`;
        if (cands.length === 0) {
          // Drafts may preview with the fallback clip standing in (the cut is
          // marked fallback_no_match). A render-ready map needs real footage.
          if (opts.requireApproved) {
            add("no_clip_for_shot", path, `no approved ${map.aspect} clip for scene ${c.sceneId} / camera ${cam}`);
          }
          if (fallback && fallback.durationSec + EPS < longestBar) {
            add("clip_too_short", path, `fallback ${fallback.id} is shorter than one bar here`);
          }
          continue;
        }
        const short = cands.filter((v) => v.durationSec + EPS < longestBar);
        for (const v of short) {
          add("clip_too_short", path, `${v.id} is ${v.durationSec}s but one bar here lasts ${longestBar.toFixed(3)}s`);
        }
      }
    }
  }

  if (opts.requireApproved) {
    if (map.approvalStatus !== "approved") add("not_approved", "approvalStatus", "cue map must be approved before rendering");
    else if (!map.approvedBy || !map.approvedAt) add("approval_incomplete", "approvalStatus", "approvedBy and approvedAt are required");
  }

  return { ok: issues.length === 0, issues };
}
