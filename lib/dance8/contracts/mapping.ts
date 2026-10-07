import type { BodyZone } from "./motion";
import type { MusicSection } from "./signal";

export interface MappingRule {
  id: string;
  sections?: MusicSection[];
  energyRange?: readonly [number, number];
  bpmRange?: readonly [number, number];
  preferredZones?: BodyZone[];
  preferredTags?: string[];
  weight: number;
}

export type BundleGenerator = "human" | "claude" | "hybrid";
export type ApprovalStatus = "draft" | "validated" | "approved" | "retired";

export interface MappingBundle {
  id: string;
  schemaVersion: 1;
  version: number;
  trackId: string;
  analysisProfileId: string;
  motionLibraryVersion: number;
  transitionGraphVersion: number;
  runtimePolicyVersion: number;
  rules: MappingRule[];
  generatedBy: BundleGenerator;
  generatorVersion?: string;
  approvalStatus: ApprovalStatus;
  createdAt: string;
  approvedAt?: string;
  approvedBy?: string;
}
