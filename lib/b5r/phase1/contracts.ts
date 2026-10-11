/**
 * AIM-B5R Phase 1 — Identity & Authority contracts (Kern/Fresno pilot).
 *
 * Handoff v1.1 (2026-10-09). Evidence first, deterministic gates, human
 * approval. File-based on purpose: every deliverable is a CSV, and nothing
 * here needs a database until the pilot proves the shape.
 *
 * Source tiers follow the handoff's authoritative hierarchy:
 *   1 recorded documents / official assessor, parcel and planning records
 *   2 official county/state/federal geospatial and context datasets
 *   3 listings and aggregators (lead hypotheses only)
 *   4 AIM concept/design material (never county facts)
 */

export type SourceTier = 1 | 2 | 3 | 4;
export type EvidenceState = "verified" | "provisional" | "conflicting" | "missing" | "stale";
export type Gate = "PASS" | "CONDITIONAL" | "HOLD" | "FAIL";

/** Facts the Phase 1 field contract asks for, one evidence row each. */
export const FIELDS = [
  "apn",
  "situs_address",
  "jurisdiction", // incorporated city or unincorporated county, from an official boundary
  "geometry_match", // screening-level parcel geometry matches the address (not a survey)
  "parcel_status",
  "apn_history",
  "planning_authority",
  "zoning",
  "title_status",
  // Only ever recorded with a reviewer, and only from evidence:
  "identity_contradiction",
  "ineligible",
] as const;
export type Field = (typeof FIELDS)[number];

/** The four facts PASS needs. */
export const CORE: readonly Field[] = ["apn", "situs_address", "jurisdiction", "geometry_match"];

export interface Property {
  property_uuid: string; // UUIDv5 of the lead id: stable, never reassigned
  lead_id: string; // K1..K5, F1..F5
  pilot_id: string; // PILOT-01..10
  county: "Kern" | "Fresno";
  lead_address: string; // as received, never edited
  /** Advertised, broker-reported facts. Kept apart from evidence. */
  advertised_asking_price_usd: string;
  advertised_cap_rate_pct: string;
  listing_source_url: string;
}

export interface Source {
  source_id: string;
  publisher: string;
  title: string;
  url: string;
  tier: SourceTier;
  access_method: string;
  edition: string;
  coverage: string;
  limitations: string;
  checked_at: string; // when Claude/human last tried it
  access_status: "reachable" | "interactive_only" | "blocked" | "not_checked";
  access_notes: string;
}

export interface Evidence {
  evidence_id: string;
  property_uuid: string;
  lead_id: string;
  field: Field;
  value: string;
  state: EvidenceState;
  source_id: string;
  source_uri: string;
  publisher: string;
  tier: SourceTier;
  observed_date: string; // effective date printed by the source, if any
  retrieved_at: string; // ISO time the value was read (date-only allowed for listings)
  coverage: string;
  snapshot_ref: string; // screenshot / file name + sha256 prefix; required for verified
  reason: string; // why this state, especially for anything not verified
  reviewer: string;
  recorded_at: string;
}

export interface GateResult {
  lead_id: string;
  property_uuid: string;
  proposed_gate: Gate;
  reasons: string[];
  /** Core fields not yet verified, in CORE order. */
  open_core: Field[];
  conflicts: Field[];
  /** True until a named human reviewer signs this gate. */
  needs_review: boolean;
}
