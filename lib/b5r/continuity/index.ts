/**
 * AIM-B5R design continuity: does a design proposal answer every canon item
 * that applies to it, and did anything change silently since the last
 * version? See docs/aim-b5r/DESIGN_CONTINUITY.md.
 */
export * from "./contracts";
export * from "./map";
export { checkContinuity, expandScope, isKnownRef, labelOf, LIMITS, parseProposal, proposalSha256, requirements, starterProposal, verifyReport } from "./check";
export type { Requirement } from "./check";
export { reportMarkdown } from "./report";
