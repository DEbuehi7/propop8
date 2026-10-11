/**
 * lib/reviewGate.ts
 * ----------------------------------------------------------------------------
 * The release checklist a reviewer must tick before a report can be approved.
 * Shared by the review page (renders it) and the save route (enforces it), so
 * the server does not trust the browser's disabled button.
 *
 * Every item is something that has actually shipped wrong in a draft.
 */
export const GATE = [
  "Numbers in the report match the source rows I spot-checked",
  "No causal language where the file only shows variance",
  "Duplicate findings are still labelled candidates",
  "Claim type on every finding is right after my edits",
] as const;
