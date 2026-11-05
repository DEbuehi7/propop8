/**
 * FIS-Flat module catalogue F0-F7 (study section 5), flat first.
 *
 * Status: "available" modules can be planned now; F6 fins are a later
 * selective pilot (P2+), so an option using them is held at DEFER; F7
 * (curved, LED, kinetic, planted) is disabled and cannot be placed at all.
 * Specification fields stay null until a manufacturer or tested assembly is
 * chosen: an unknown is shown as unknown, and a missing price is never zero.
 *
 * Each module also names the gates it triggers (so a gate it triggers cannot
 * be declared "not applicable"), its study tier L0-L4, and the canon
 * INTERVENTION_LADDER step it belongs to (a proposed mapping, not canon).
 */
import { INTERVENTION_LADDER } from "../../canon/vocab";
import { FIS_CATALOGUE_VERSION, type FacadeGateId, type ModuleId } from "./contracts";

export type ModuleStatus = "available" | "pilot" | "disabled";
export type StudyTier = "L0" | "L1" | "L2" | "L3" | "L4";
export type LadderStep = (typeof INTERVENTION_LADDER)[number];
/** wall: sits on opaque wall; cell: a layer in front of the whole cell; local: one fixed point. */
export type Placement = "wall" | "cell" | "local";

export interface ModuleSpec {
  moduleSizeMm: string | null;
  cutoutPct: number | null;
  attachment: string | null;
  finish: string | null;
  serviceReach: string | null;
  assemblyApproval: string | null;
  lifespanYears: number | null;
  warranty: string | null;
  partNumber: string | null;
  sourceId: string | null;
}

export interface FacadeModule {
  id: ModuleId;
  name: string;
  purpose: string;
  eligible: string;
  procurement: string;
  status: ModuleStatus;
  placement: Placement;
  /** Adds weight or projection to the wall, so it needs an attachment path (FG2) and surveyed geometry. */
  attached: boolean;
  /** Made off site, so the option needs a fabrication cost line. */
  fabricated: boolean;
  triggers: FacadeGateId[];
  tier: StudyTier;
  ladder: LadderStep;
  maintenance: string;
  spec: ModuleSpec;
}

const UNKNOWN_SPEC: ModuleSpec = {
  moduleSizeMm: null, cutoutPct: null, attachment: null, finish: null, serviceReach: null,
  assemblyApproval: null, lifespanYears: null, warranty: null, partNumber: null, sourceId: null,
};

const ENVELOPE: LadderStep = "Envelope improvements";
const MEDIA: LadderStep = "Lighting / media retrofit";

export const CATALOGUE: readonly FacadeModule[] = [
  {
    id: "F0", name: "Retain / repair", purpose: "Inspect and repair weather damage, brick, windows, flashing and historic elements",
    eligible: "Baseline across the building", procurement: "Subject to assessment and approvals",
    status: "available", placement: "wall", attached: false, fabricated: false, triggers: ["FG1", "FG3", "FG6", "FG7"],
    tier: "L0", ladder: ENVELOPE, maintenance: "Existing inspection and repair cycle", spec: UNKNOWN_SPEC,
  },
  {
    id: "F1", name: "Flat finish / graphic", purpose: "Compatible coatings, murals, flat graphics",
    eligible: "Approved solid wall areas", procurement: "Review colour, material and mural permits",
    status: "available", placement: "wall", attached: false, fabricated: false, triggers: ["FG1", "FG3", "FG5", "FG7"],
    tier: "L1", ladder: MEDIA, maintenance: "Recoat and clean; graffiti and fade plan", spec: UNKNOWN_SPEC,
  },
  {
    id: "F2", name: "Flat opaque panel", purpose: "Replaceable wall finish or approved cladding system",
    eligible: "Opaque host wall, only after an envelope assessment", procurement: "Needs assembly and attachment evidence",
    status: "available", placement: "wall", attached: true, fabricated: true, triggers: ["FG1", "FG2", "FG3", "FG6", "FG7"],
    tier: "L2", ladder: ENVELOPE, maintenance: "Panel replacement by part number; joint and sealant inspection", spec: UNKNOWN_SPEC,
  },
  {
    id: "F3", name: "Perforated planar screen", purpose: "Targeted privacy or solar filtering",
    eligible: "Selected exposed windows, corridors, common zones", procurement: "Needs shading, structural, fire and access checks",
    status: "available", placement: "cell", attached: true, fabricated: true, triggers: ["FG1", "FG2", "FG3", "FG4", "FG6", "FG7"],
    tier: "L2", ladder: ENVELOPE, maintenance: "Cleaning reach behind the screen; dirt and debris checks", spec: UNKNOWN_SPEC,
  },
  {
    id: "F4", name: "Wayfinding", purpose: "Address, delivery, entrance and parking navigation",
    eligible: "Approved entry and service routes, street level", procurement: "Verify accessibility and sign compliance",
    status: "available", placement: "local", attached: true, fabricated: true, triggers: ["FG1", "FG4", "FG5", "FG7"],
    tier: "L1", ladder: MEDIA, maintenance: "Legibility checks; replace faded or damaged signs", spec: UNKNOWN_SPEC,
  },
  {
    id: "F5", name: "Service access", purpose: "Removable protected access to a utility or inspection point",
    eligible: "Approved utility and inspection points", procurement: "Never blocks emergency or equipment access",
    status: "available", placement: "local", attached: true, fabricated: true, triggers: ["FG1", "FG6", "FG7"],
    tier: "L2", ladder: ENVELOPE, maintenance: "Opening test at each inspection; hinge and lock parts", spec: UNKNOWN_SPEC,
  },
  {
    id: "F6", name: "Planar fins / folds", purpose: "Orientation-specific shade and depth",
    eligible: "Bay zones with verified wind and seismic attachment", procurement: "Later selective pilot (P2 or later)",
    status: "pilot", placement: "cell", attached: true, fabricated: true, triggers: ["FG1", "FG2", "FG3", "FG4", "FG6", "FG7"],
    tier: "L2", ladder: ENVELOPE, maintenance: "Fixings, corrosion and bird-nesting checks", spec: UNKNOWN_SPEC,
  },
  {
    id: "F7", name: "Specialized advanced", purpose: "Curved, responsive, LED, kinetic or planted assemblies",
    eligible: "Only isolated, justified contexts", procurement: "Advanced expressions (P5) need their own decision contract",
    status: "disabled", placement: "cell", attached: true, fabricated: true, triggers: ["FG1", "FG2", "FG3", "FG4", "FG5", "FG6", "FG7"],
    tier: "L4", ladder: MEDIA, maintenance: "Controls, power and upkeep plan required before any use", spec: UNKNOWN_SPEC,
  },
];

export { FIS_CATALOGUE_VERSION };

const BY_ID = new Map(CATALOGUE.map((m) => [m.id, m]));
export function moduleOf(id: ModuleId): FacadeModule {
  const m = BY_ID.get(id);
  if (!m) throw new Error(`unknown module ${id}`);
  return m;
}
export function isModuleId(x: unknown): x is ModuleId {
  return typeof x === "string" && BY_ID.has(x as ModuleId);
}
