/**
 * AIM-B5R design continuity: which canon items a design proposal must answer.
 *
 * A proposal names its scope (what kind of design work it is); every LOCKED
 * entry listed for "always" or for one of its scopes is mandatory, and every
 * other entry listed is advisory (shown, never required). The FIS baseline
 * module F0 is mandatory for façade work: a façade proposal says what happens
 * to the existing wall before anything is added (B5R-18, B5R-38, B5R-41).
 *
 * This map is a reading of canon, not canon itself (canon 1.13.0). The rule
 * it serves is GOV-31; docs/aim-b5r/DESIGN_CONTINUITY.md explains it.
 * tests/b5rContinuity.test.ts keeps it honest: every id must exist, and every
 * LOCKED entry in SCANNED_DOMAINS must be mapped or listed in
 * NOT_DESIGN_INPUTS with a reason, so a new locked rule cannot be skipped
 * without anyone deciding to skip it.
 * Pure data: no I/O.
 */
import type { CanonDomain } from "../../canon";

/** 0.1: first reading, canon 1.13.0 (11 Nov 2026). */
export const CONTINUITY_MAP_VERSION = "aim-continuity-map-0.1";

export const WORK_TYPES = [
  "existing_building", "landmark", "site", "facade", "weathering", "context_dignity",
  "building_intelligence", "robot_ready", "pattern", "triadic", "imagery", "media_overlay", "costed",
] as const;
export type WorkType = (typeof WORK_TYPES)[number];

export const WORK_TYPE_MEANING: Record<WorkType, string> = {
  existing_building: "Work on a building that already stands (reuse, repair, conversion)",
  landmark: "A landmark or historic building",
  site: "A program placed on a lot or parcel",
  facade: "Façade work (FIS-Flat modules F0-F7)",
  weathering: "Material choices, service life or maintenance timing",
  context_dignity: "Resident-facing context work (spatial rights, outcomes, district pilots)",
  building_intelligence: "Sensors, screens, digital twins, simulation or automation in the building",
  robot_ready: "Robot paths, docks or robot-readable surfaces",
  pattern: "EDO pattern, genome or the AIM mark in the design",
  triadic: "Triadic form, lattices or triadic claims",
  imagery: "Renders, posters or concept images that go out with the proposal",
  media_overlay: "Media, music or performance shown on or in the building",
  costed: "Costs, prices, lead times or infrastructure options",
};

/** Scopes that bring others with them. */
export const IMPLIES: Partial<Record<WorkType, readonly WorkType[]>> = {
  landmark: ["existing_building"],
  facade: ["existing_building"],
};

/** The baseline module every façade proposal answers. */
export const FACADE_BASELINE_MODULE = "FIS:F0";

export const CONTINUITY_MAP: Record<"always" | WorkType, readonly string[]> = {
  always: [
    "GOV-01", "GOV-14", "GOV-16", "GOV-17", "GOV-22", "GOV-24", "GOV-26", "GOV-29",
    "B5R-17", "B5R-19", "B5R-33", "INF-01", "INF-08",
    "B5R-26", // SPEC: the design compiler shape (advisory)
  ],
  existing_building: ["B5R-18", "INF-05"],
  landmark: ["B5R-37", "VIS-05"],
  site: ["GOV-30", "B5R-06", "B5R-11", "B5R-24", "INF-04"],
  facade: [
    "B5R-38", "B5R-39", "B5R-40", "B5R-41", "B5R-42", "B5R-43", "B5R-44", "B5R-45", "B5R-48", "B5R-55",
    FACADE_BASELINE_MODULE,
  ],
  weathering: ["B5R-55", "INF-04", "VIS-10"],
  context_dignity: ["B5R-46", "B5R-47", "B5R-49", "B5R-50", "B5R-51", "GOV-27"],
  building_intelligence: ["B5R-04", "GOV-27", "EDO-14", "EDO-10"],
  robot_ready: ["ROB-04", "ROB-06", "EDO-14", "EDO-10", "P8O-05"],
  pattern: ["EDO-01", "EDO-05", "EDO-06", "EDO-07", "EDO-08", "EDO-11", "EDO-13", "GOV-21", "TRI-13", "TRI-14", "VIS-11"],
  triadic: ["TRI-03", "TRI-04", "TRI-06", "TRI-09", "TRI-13", "TRI-14"],
  imagery: ["GOV-23", "B5R-20", "VIS-05", "VIS-06", "VIS-08", "VIS-11", "TRI-14", "VIS-07", "VIS-09"],
  media_overlay: ["STU-05", "GOV-15", "TRI-09"],
  costed: ["B5R-23", "INF-02"],
};

/**
 * Rules no project approval can waive. Modifying or excluding one stops the
 * proposal (KILL); leaving one out or deferring it without an approval needs
 * the owner (ESCALATE). Only a canon change can move these.
 */
export const NEVER_WAIVED: ReadonlyMap<string, string> = new Map([
  ["GOV-15", "media and property data never merge"],
  ["GOV-16", "no employer data, worksite, residents or imagery without written clearance"],
  ["GOV-26", "life safety, egress and building controls never depend on media, cloud AI or a performance track"],
  ["GOV-29", "evaluate buildings, never people; protected-characteristic inference stops the project"],
  ["INF-08", "fire access, step-free routes and load capacity are never traded for spectacle"],
  ["B5R-33", "AIM-B5R stays residential-only"],
  ["B5R-39", "nothing covers egress or historic fabric"],
  ["B5R-40", "the seven façade gates are hard gates"],
  ["ROB-04", "no network-dependent robot stop; no resident testing or recording"],
]);

/** Domains whose LOCKED entries must each be mapped or explained below. */
export const SCANNED_DOMAINS: readonly CanonDomain[] = ["GOVERNANCE", "AIM_B5R", "INFRA", "EDO_PATTERN", "VISUAL"];

/** LOCKED entries in the scanned domains that are not design inputs, and why. */
export const NOT_DESIGN_INPUTS: ReadonlyMap<string, string> = new Map([
  ["GOV-02", "software layering"],
  ["GOV-03", "change workflow for code"],
  ["GOV-04", "web transport and persistence"],
  ["GOV-05", "dashboard empty states"],
  ["GOV-06", "test traffic"],
  ["GOV-07", "database foreign keys"],
  ["GOV-08", "secrets handling"],
  ["GOV-09", "access control in software"],
  ["GOV-11", "backup restore tests"],
  ["GOV-12", "housing compliance workflow boundary"],
  ["GOV-13", "tenant documents and AI"],
  ["GOV-20", "where doctrine and runtime facts live"],
  ["GOV-25", "vendor register"],
  ["GOV-28", "file retention"],
  ["GOV-31", "the continuity rule itself, which this check enforces"],
  ["B5R-01", "investment cycle"],
  ["B5R-02", "buy decision contents"],
  ["B5R-03", "investment stages vs release gates"],
  ["B5R-05", "capital commitment"],
  ["B5R-07", "pilot property list"],
  ["B5R-08", "dataset gate set"],
  ["B5R-12", "market research scope"],
  ["B5R-13", "SRO underwriting hold"],
  ["B5R-14", "lead status in two markets"],
  ["B5R-16", "underwriting identities (a design never adjusts underwriting, B5R-44)"],
  ["B5R-22", "build order of location adapters"],
  ["B5R-25", "a concept family's name"],
  ["B5R-28", "data sharing between engines"],
  ["B5R-30", "monthly business scorecard"],
  ["INF-03", "the infrastructure research frame (systems, environments, phases)"],
  ["EDO-02", "gene definitions, used through EDO-07"],
  ["EDO-03", "family definitions, used through EDO-07"],
  ["EDO-04", "scale definitions, used through EDO-07"],
  ["EDO-09", "interface signal states (software UI)"],
  ["VIS-01", "operational UI palette"],
  ["VIS-02", "interface state colours; building wayfinding is B5R-48 and INF-08"],
  ["VIS-04", "six named archive images; reuse of archive imagery goes through VIS-08"],
]);
