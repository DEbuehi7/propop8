// lib/stuttr/desk/state.ts
//
// Where each album track stands, worked out from its files every time and
// never stored (a view renders state, it never creates it: GOV-01, GOV-17).
// The states run in this order; a track is at the last one whose gate it
// passes, and a HOLD names what stops the next one. A hold stops only its own
// track and stage: a song waiting on voice rights still gets its cue map.
// Pure: the caller gathers the facts.

import type { RightsState, VoiceStrategy } from "./manifest";
import type { DeskIssue, RowStatus } from "./reconcile";

export const PIPELINE_STATES = [
  "WAITING_SOURCE", "DISCOVERED", "MATCHED", "STAGED", "AUDIO_QA", "AUDIO_APPROVED", "CUES_VALIDATED",
  "SHOTS_PREPARED", "CLIPS_IMPORT_PENDING", "CLIPS_QA", "RENDER_ELIGIBLE", "DRAFT_RENDERED",
] as const;
export type PipelineState = (typeof PIPELINE_STATES)[number];

export interface TrackFacts {
  albumId: string;
  trackNumber: number | null;
  trackId: string | null;
  title: string;
  row: { status: RowStatus; issues: DeskIssue[] };
  strategy: VoiceStrategy;
  rights: RightsState;
  inLibrary: boolean;
  analysed: boolean;
  /** The master a draft render would play, if any. */
  master: { key: string; kind: "suno" | "voices"; status: "draft" | "approved"; current: boolean } | null;
  /** null: no cue map yet. */
  cuemap: { valid: boolean; issues: string[] } | null;
  /** null: no Kling pack yet. */
  pack: { cards: number } | null;
  shotsLeft: number;
  clips: { draft: number; approved: number };
  /** VIDEO_QA findings on imported clips. */
  videoIssues: DeskIssue[];
  /** Holds on the paid voice stage (voice map, provider). */
  voiceHolds: DeskIssue[];
  /** Ledger jobs waiting on the owner (ambiguous paid calls). */
  ambiguousJobs: { jobId: string; stage: string }[];
  renders: { draft: boolean; final: boolean };
}

export interface TrackStatus {
  state: PipelineState;
  holds: DeskIssue[];
  next: string[];
  /** One short line for the board. */
  warning: string | null;
}

const RUN = "npm run stuttr --";

export function trackStatus(f: TrackFacts): TrackStatus {
  const holds: DeskIssue[] = [];
  const next: string[] = [];
  const blocks = (stage: DeskIssue["stage"]) => f.row.issues.filter((i) => i.severity === "block" && i.stage === stage);
  const done = (state: PipelineState, warn: string | null = null): TrackStatus => ({ state, holds, next, warning: warn ?? holds[0]?.message ?? null });
  for (const j of f.ambiguousJobs) holds.push({ code: "AMBIGUOUS_SUBMISSION", severity: "block", stage: "voices", message: `paid job ${j.jobId} (${j.stage}) may have reached the provider without an answer`, fix: `check the provider's history, then ${RUN} album-resolve ${f.albumId} ${j.jobId} --retry|--abandon --note "what you found"` });

  if (f.row.status === "WAITING") { holds.push(...blocks("import")); next.push(...holds.map((h) => h.fix ?? h.message)); return done("WAITING_SOURCE"); }
  if (f.row.status === "FOUND" || f.trackNumber === null) { holds.push(...blocks("import")); next.push(`add it to the manifest, then ${RUN} album-import again`); return done("DISCOVERED"); }
  if (!f.inLibrary) {
    holds.push(...blocks("import"));
    if (holds.length) { next.push(...holds.map((h) => h.fix ?? h.message)); return done("MATCHED"); }
    next.push(`${RUN} album-import <drop> --manifest <album.json>   (without --dry-run, to copy it into the library)`);
    return done("MATCHED");
  }
  // In the library. Findings on clips already brought in show whatever the stage.
  const videoBlocks = f.videoIssues.filter((i) => i.severity === "block");
  const audioHolds = blocks("audio");
  holds.push(...audioHolds, ...videoBlocks);
  if (audioHolds.length) { next.push(...audioHolds.map((h) => h.fix ?? h.message)); return done(f.analysed ? "AUDIO_QA" : "STAGED"); }
  if (!f.analysed) { next.push(`${RUN} album-process ${f.albumId} --stage audio   (measures tempo, bars and chords; free)`); return done("STAGED"); }

  // The voices: kept, converted (paid, gated) or held.
  const voiceHolds = [...blocks("voices"), ...(f.strategy === "CONVERT_APPROVED_SEGMENTS" ? f.voiceHolds : [])];
  holds.push(...voiceHolds);
  const audioApproved = !!f.master && f.master.status === "approved" && f.master.current;
  if (!audioApproved) {
    if (f.strategy === "KEEP_ORIGINAL") {
      if (!f.master) next.push(`${RUN} album-process ${f.albumId} --stage audio   (builds the draft master from Suno's own vocals; free)`);
      else if (!f.master.current) next.push(`the master is out of date: ${RUN} master ${f.trackId} --suno --replace`);
      else next.push(`listen to the master, then: ${RUN} approve-master ${f.trackId} --suno`);
    } else if (voiceHolds.length) next.push(...voiceHolds.map((h) => h.fix ?? h.message));
    else next.push(`${RUN} album-process ${f.albumId} --stage voices   (the paid plan and its credits; nothing is spent without --approved-plan and --max-credits)`);
    if (!f.cuemap) next.push(`meanwhile: ${RUN} album-plan-videos ${f.albumId}   (cue map and shot list; free)`);
    return done("AUDIO_QA");
  }
  if (!f.cuemap) { next.push(`${RUN} album-plan-videos ${f.albumId}`); return done("AUDIO_APPROVED"); }
  if (!f.cuemap.valid) {
    holds.push({ code: "CUEMAP_INVALID", severity: "block", stage: "video", message: `the cue map has ${f.cuemap.issues.length} problem(s): ${f.cuemap.issues.slice(0, 2).join("; ")}`, fix: `fix ${f.trackId}/dance8/${f.trackId}.cuemap.json, then ${RUN} album-plan-videos ${f.albumId}` });
    next.push(holds.at(-1)!.fix!);
    return done("AUDIO_APPROVED");
  }
  if (!f.pack) { next.push(`${RUN} album-plan-videos ${f.albumId}   (writes the Kling pack)`); return done("CUES_VALIDATED"); }
  if (f.shotsLeft > 0 && f.clips.draft + f.clips.approved === 0) {
    next.push(`generate the ${f.shotsLeft} shot(s) in the Kling pack (${f.trackId}/dance8/kling/index.html), then ${RUN} album-clips ${f.albumId} <folder with a ${f.trackId}/ subfolder>`);
    return done("SHOTS_PREPARED");
  }
  if (f.shotsLeft > 0) {
    next.push(`${f.shotsLeft} shot(s) still to generate; bring them in with ${RUN} album-clips ${f.albumId} <folder>`);
    if (f.clips.draft) next.push(`check the ${f.clips.draft} draft clip(s): npm run dance8 -- approve-clip ${f.trackId} <clipId> --drift <0-1>`);
    return done("CLIPS_IMPORT_PENDING");
  }
  if (f.clips.draft || videoBlocks.length) {
    if (videoBlocks.length) next.push(...videoBlocks.map((h) => h.fix ?? h.message));
    if (f.clips.draft) next.push(`check the ${f.clips.draft} draft clip(s): npm run dance8 -- approve-clip ${f.trackId} <clipId> --drift <0-1>`);
    return done("CLIPS_QA");
  }
  if (f.rights !== "CLEARED") holds.push(...blocks("final"));
  if (!f.renders.draft) { next.push(`${RUN} album-preview ${f.albumId}   (a local draft render)`); return done("RENDER_ELIGIBLE"); }
  if (f.rights !== "CLEARED") next.push(`final and publishing wait for rights: set rights.state to CLEARED in the manifest once checked (STU-02)`);
  else next.push(`watch the draft; the final is yours: npm run dance8 -- render ${f.trackId} --approved`);
  return done("DRAFT_RENDERED");
}

export interface AlbumSummary {
  tracks: number;
  matched: number;
  waitingOnSource: number;
  needsReview: number;
  inLibrary: number;
  held: number;
  lipSyncShots: number;
  paidJobsApproved: number;
  /** Paid units estimated in the current plan, or null when there is no plan (never zero by default). */
  estimatedUnits: { units: string; amount: number } | null;
  byState: Partial<Record<PipelineState, number>>;
}

export function summaryLine(s: AlbumSummary): string {
  const parts = [
    `${s.matched} of ${s.tracks} tracks matched`, `${s.waitingOnSource} waiting on source`, `${s.needsReview} need review`, `${s.inLibrary} in the library`,
    `${s.held} held`, `${s.lipSyncShots} lip-sync shots`, `${s.paidJobsApproved} paid jobs run`,
    s.estimatedUnits ? `about ${s.estimatedUnits.amount.toLocaleString("en-US")} ${s.estimatedUnits.units} in the voice plan` : "paid cost unknown until a provider estimate",
  ];
  return parts.join("; ");
}
