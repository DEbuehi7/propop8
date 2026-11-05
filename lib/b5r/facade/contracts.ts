/**
 * AIM-B5R Façade Intelligence System (FIS-Flat): data contracts.
 *
 * Source: "AIM-B5R Façade Intelligence System Complete Study v1.0" (3 Nov
 * 2026), sections 3-6, 11 and 12.1, made canon by the owner on 4 Nov 2026
 * (canon 1.7.0, B5R-38 to B5R-45). The names and fixed values (rule, drivers,
 * masks, gates, modules, weights) come from lib/canon/vocab.ts; the study's
 * contracts are reconciled to the code that already exists:
 *
 *   - decision calls reuse the engine's CallName (EXECUTE/DEFER/ESCALATE/KILL);
 *   - fact states reuse Phase 1's EvidenceState and SourceTier;
 *   - data status and drawing status reuse the canon EVIDENCE_AXES;
 *   - the study's gates G1-G7 are namespaced FG1-FG7 here, because G0-G6
 *     already name the dataset-contract gates (docs/aim-dataset/CONTRACT.md).
 *
 * Governing rule: Program -> Constraints -> Performance -> Geometry ->
 * Material -> Expression. Gates run before scores; a score never lifts a call.
 * Pure types and constants only: no I/O, no AI, no database.
 */
import type { CallName, Confidence } from "../engine";
import type { EvidenceState, SourceTier } from "../phase1/contracts";
import { EVIDENCE_AXES, FIS_DESIGN_RULE, FIS_DRIVERS, FIS_GATES, FIS_GATE_STATES, FIS_MASK_KINDS, FIS_MODULES, FIS_WEIGHTS } from "../../canon/vocab";

export type { CallName, EvidenceState, SourceTier };

export const FIS_SCHEMA_VERSION = "aim-fis-project-1";
/** 0.2.0: masks loosened (beside placements), Fresno default weights, canon names (owner, 2026-11-04). */
export const FIS_ENGINE_VERSION = "aim-fis-flat-0.2.0";
export const FIS_CONTRACT_VERSION = "aim-fis-decision-1";
export const FIS_CATALOGUE_VERSION = "fis-flat-catalogue-0.1";

export const DESIGN_RULE = FIS_DESIGN_RULE;

export type DataStatus = (typeof EVIDENCE_AXES.dataStatus)[number];
export type DrawingStatus = (typeof EVIDENCE_AXES.drawingStatus)[number];

// ---------------------------------------------------------------------------
// The twelve design drivers (study section 3). Every cell can carry each one
// with its own evidence state; a driver nobody has recorded is "missing".
// ---------------------------------------------------------------------------

export type DriverId = (typeof FIS_DRIVERS)[number];
const DRIVER_TEXT: Record<DriverId, { label: string; needs: string; gives: string }> = {
  location_context: { label: "Location / context", needs: "Parcel, orientation, climate, adjacency, hazards, community context", gives: "Exposure profile, cultural sensitivity, review paths" },
  view_outward: { label: "View outward", needs: "Seated and standing sightlines at real unit windows", gives: "Window-preservation and targeted-screen masks" },
  view_inward: { label: "View inward", needs: "Public sidewalk and neighbouring sightlines", gives: "Privacy zones and visual identity" },
  daylight_lighting: { label: "Daylight + lighting", needs: "Orientation, shading, glazing, room use, night exposure", gives: "Screen depth and no-glare limits" },
  architecture: { label: "Architecture", needs: "Existing wall grid, columns, entrances, balconies, materials", gives: "Module alignment; elements to keep" },
  wayfinding: { label: "Wayfinding", needs: "Entries, deliveries, accessible routes, parking", gives: "Legible signs at the right priority" },
  utilities: { label: "Utilities", needs: "Risers, vents, exhaust, meters, drainage, telecom", gives: "Do-not-cover masks; removable service access" },
  space_function: { label: "Space function", needs: "Bedroom, living room, SRO room, corridor, amenity, garage", gives: "Function-specific transparency and privacy" },
  thermal_envelope: { label: "Thermal + envelope", needs: "Air/water barrier, insulation, solar heat, thermal bridging", gives: "Assembly review and energy options" },
  history_identity: { label: "History + identity", needs: "Historic resource record, arts programmes, community feedback", gives: "Site-specific motif and artwork provenance" },
  maintenance: { label: "Maintenance", needs: "Access equipment, cleaning, corrosion, service intervals", gives: "Repair strategy and lifecycle costs" },
  budget_financing: { label: "Budget + financing", needs: "Available capital, required work, contingency, priced options", gives: "Intervention tier and deferred options" },
};
export const DRIVERS = FIS_DRIVERS.map((id) => ({ id, ...DRIVER_TEXT[id] }));

export interface DriverInput {
  value: string;
  state: EvidenceState;
  sourceIds: string[];
}

// ---------------------------------------------------------------------------
// The seven hard feasibility gates (study section 6), as FG1-FG7.
// ---------------------------------------------------------------------------

export type FacadeGateId = (typeof FIS_GATES)[number]["id"];
const GATE_TEXT: Record<FacadeGateId, { check: string; stop: string }> = {
  FG1: { check: "Construction type, flame propagation, approved materials, egress and smoke", stop: "Unreviewed combustible layer or an obstructed emergency opening" },
  FG2: { check: "Wind and seismic loads, substrate capacity, anchors, projections, falling hazards", stop: "No tested or engineered attachment path" },
  FG3: { check: "Drainage, flashing, air barrier, thermal and moisture behaviour, penetrations", stop: "A screen traps water or hides a known leak" },
  FG4: { check: "View, daylight, ventilation, window operation, accessible features, visual comfort", stop: "A pattern badly obstructs a bedroom window or its light" },
  FG5: { check: "Historic and HPOZ review, sign and mural rules, setbacks and projections, permits, art rights", stop: "A mural exemption assumed without checking" },
  FG6: { check: "Cleaning access, repair parts, equipment and duct access, corrosion, inspections", stop: "The façade prevents inspection or safe repair" },
  FG7: { check: "Required work, approved budget, contingency, procurement evidence", stop: "Decorative scope displaces required safety repair" },
};
export const FACADE_GATES = FIS_GATES.map((x) => ({ ...x, ...GATE_TEXT[x.id] }));
export const GATE_STATES = FIS_GATE_STATES;
export type GateState = (typeof GATE_STATES)[number];
/** Gates an option can never declare not applicable. */
export const ALWAYS_APPLIES: readonly FacadeGateId[] = ["FG1", "FG7"];
/** An UNKNOWN here needs a licensed professional, so the call is ESCALATE rather than DEFER. */
export const PROFESSIONAL_GATES: readonly FacadeGateId[] = FIS_GATES.filter((x) => x.professional).map((x) => x.id);

/** A gate review. Without optionId it covers every option in the project. */
export interface GateRecord {
  gate: FacadeGateId;
  state: GateState;
  reason: string;
  sourceIds: string[];
  /** Named reviewer; for FG1-FG3 a licensed professional. */
  reviewer: string;
  date: string;
  optionId?: string;
}

// ---------------------------------------------------------------------------
// Geometry, masks and room use.
// ---------------------------------------------------------------------------

export const GEOMETRY_STATES = ["UNMEASURED", "FIELD_OBSERVED", "SURVEY_VERIFIED"] as const;
export type GeometryState = (typeof GEOMETRY_STATES)[number];

/** UI maturity labels (study section 14): never one optimistic green badge. */
export const MATURITY = ["CONCEPT", "FIELD OBSERVED", "SURVEY VERIFIED", "ENGINEER REVIEWED", "INSTALLED"] as const;
export type Maturity = (typeof MATURITY)[number];

export const MASK_KINDS = FIS_MASK_KINDS;
export type MaskKind = (typeof MASK_KINDS)[number];

/** What is behind the wall. Residential only (B5R-33): no retail or office uses. */
export const ROOM_USES = [
  "bedroom", "living", "studio", "sro_room", "kitchen", "bathroom", "corridor", "stair", "lobby",
  "mail_delivery", "laundry", "resident_amenity", "mechanical", "parking", "unknown",
] as const;
export type RoomUse = (typeof ROOM_USES)[number];
/** Rooms where a window is a resident's own light, air and view. */
export const RESIDENT_ROOMS: readonly RoomUse[] = ["bedroom", "living", "studio", "sro_room"];

export const ORIENTATIONS = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"] as const;
export type Orientation = (typeof ORIENTATIONS)[number];

export interface FacadeElevation {
  id: string;
  name: string;
  orientation: Orientation;
  floors: number;
  bays: number;
  /** Measured sizes in mm, bay 0 = left, floor 0 = street level; null = not measured. */
  bayWidthsMm: (number | null)[];
  floorHeightsMm: (number | null)[];
  /** Relative drawing proportions, used when measurements are missing. Not to scale. */
  schematicBayWidths: number[];
  baseGeometrySourceId: string;
  surveyState: GeometryState;
}

export interface FacadeCell {
  id: string;
  elevationId: string;
  floor: number;
  bay: number;
  roomUse: RoomUse;
  geometryState: GeometryState;
  sourceIds: string[];
  /** Cell-level drivers; project-level drivers apply where a cell has none. */
  drivers: Partial<Record<DriverId, DriverInput>>;
  note?: string;
}

/** A protected area inside a cell. The rectangle is a fraction of the cell, from its top-left corner. */
export interface FacadeMask {
  id: string;
  cellId: string;
  kind: MaskKind;
  rect: { x: number; y: number; w: number; h: number };
  state: EvidenceState;
  sourceIds: string[];
  note?: string;
}

export const SOURCE_TYPES = [
  "field_photo", "survey", "drawing", "public_record", "inspection_report", "bid", "ai_concept_image", "design_board", "synthetic",
] as const;
export type SourceType = (typeof SOURCE_TYPES)[number];
/** Never evidence of a fact, a measurement or a price (B5R-20, dataset contract evidence rules). */
export const CONCEPT_SOURCE_TYPES: readonly SourceType[] = ["ai_concept_image", "design_board"];
export const PERMISSIONS = ["synthetic", "owner", "written_clearance", "public_record", "unknown"] as const;
export type Permission = (typeof PERMISSIONS)[number];

export interface FacadeSource {
  id: string;
  type: SourceType;
  title: string;
  /** File name or URL of the original. */
  uri: string;
  /** SHA-256 of the original file, when one exists. */
  sha256: string | null;
  captureDate: string | null;
  author: string;
  /** Right to use it (GOV-16: no employer site, data or imagery without written clearance). */
  permission: Permission;
  tier: SourceTier;
}

// ---------------------------------------------------------------------------
// Capital (study section 11.2). Unknown is null, never zero.
// ---------------------------------------------------------------------------

export const COST_KINDS = [
  "required_repairs", "design_permits", "access", "materials", "fabrication", "install", "tenant_disruption", "contingency", "other",
] as const;
export type CostKind = (typeof COST_KINDS)[number];
/** Board figures from earlier concept art are UNVERIFIED_VISUAL_PLACEHOLDER and never enter a sum. */
export const ESTIMATE_CLASSES = ["UNVERIFIED_VISUAL_PLACEHOLDER", "ROUGH_ORDER", "BUDGET", "DEFINITIVE", "BID"] as const;
export type EstimateClass = (typeof ESTIMATE_CLASSES)[number];

export interface CostLine {
  id: string;
  kind: CostKind;
  label: string;
  /** null = not priced yet. Zero is a priced value and needs a source like any other. */
  amountUsd: number | null;
  estimateClass: EstimateClass;
  sourceIds: string[];
  /** Effective date of the figure (B5R-23). */
  date: string;
  confidence: Confidence;
  region: string;
  scopeDefinition: string;
  assumptions: string;
}

/** Only these benefit kinds exist: no rent premium, cap-rate or property-value line, so nothing is double counted. */
export const BENEFIT_KINDS = ["energy_savings", "avoided_maintenance", "noi_effect", "incremental_om"] as const;
export type BenefitKind = (typeof BENEFIT_KINDS)[number];

export interface BenefitLine {
  id: string;
  kind: BenefitKind;
  label: string;
  /** Per year. incremental_om is a cost and is entered as a positive number. */
  annualUsd: number | null;
  state: EvidenceState;
  estimateClass: EstimateClass;
  sourceIds: string[];
  date: string;
  method: string;
  /** noi_effect only: the causal chain from this façade change to income. */
  causalChain?: string;
}

export interface Budget {
  approvedUsd: number | null;
  approvedBy: string;
  date: string;
  sourceIds: string[];
}

export interface FinanceInputs {
  /** Annual, as a fraction (0.06 = 6%). */
  discountRate: number | null;
  horizonYears: number | null;
  endOfLifeUsd: number | null;
  sourceIds: string[];
}

// ---------------------------------------------------------------------------
// Preference scoring (study section 11.1): after the gates, never instead.
// ---------------------------------------------------------------------------

/** The default weights are the owner's Fresno set (canon B5R-43); the study's were 25/25/20/15/10/5. */
export const CRITERIA = FIS_WEIGHTS;
export type CriterionId = (typeof CRITERIA)[number]["id"];
export const SCORE_MAX = 5;

export interface Weights {
  values: Record<CriterionId, number>;
  chosenBy: string;
  date: string;
}

/** Design preferences, 0-5 per criterion, by a named person. Not an engineering certification. */
export interface ScoreInput {
  values: Partial<Record<CriterionId, number>>;
  scoredBy: string;
  date: string;
  basis: string;
}

// ---------------------------------------------------------------------------
// Options and the project.
// ---------------------------------------------------------------------------

export type ModuleId = (typeof FIS_MODULES)[number]["id"];
export const MODULE_IDS: readonly ModuleId[] = FIS_MODULES.map((m) => m.id);

/** A resident window screened on purpose (F3 only), with its reason and source. */
export interface MaskJustification {
  cellId: string;
  maskKind: "window";
  reason: string;
  sourceIds: string[];
}

export interface FacadeOption {
  id: string;
  name: string;
  intent: string;
  /** cellId -> module. A cell not listed stays F0 (retain / repair). */
  assignments: Record<string, ModuleId>;
  justifications: MaskJustification[];
  costLines: CostLine[];
  benefitLines: BenefitLine[];
  /** History, privacy, accessibility, comfort: stated in words, never given dollar values. */
  nonFinancialBenefits: string[];
  scores: ScoreInput | null;
  /** A concept image of the option. Conceptual media, never a surveyed elevation. */
  renderSourceId: string | null;
}

export interface FacadeProject {
  schemaVersion: typeof FIS_SCHEMA_VERSION;
  id: string;
  name: string;
  revision: number;
  /** SYNTHETIC or MOCK data can never produce EXECUTE. */
  dataStatus: DataStatus;
  mode: "retrofit" | "new_construction";
  locationContext: string;
  /** null = not known; unknown occupancy counts as occupied for tenant-disruption costs. */
  occupied: boolean | null;
  /** Optional link to a Phase 1 property. Checked against real records, never invented (GOV-07). */
  property: { property_uuid: string; lead_id: string } | null;
  sources: FacadeSource[];
  /** Project-wide drivers (location, budget); a cell's own driver wins. */
  drivers: Partial<Record<DriverId, DriverInput>>;
  elevations: FacadeElevation[];
  cells: FacadeCell[];
  masks: FacadeMask[];
  gateRecords: GateRecord[];
  /** Repairs every option must carry (the F0 baseline scope). */
  requiredWork: CostLine[];
  budget: Budget;
  finance: FinanceInputs;
  weights: Weights;
  options: FacadeOption[];
}
