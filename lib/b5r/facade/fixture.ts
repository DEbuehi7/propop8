/**
 * SYNTHETIC fixture for FIS-Flat (study section 13: "if a real property
 * is not available, begin with a clearly labeled synthetic geometry fixture
 * to validate software, not performance").
 *
 * A made-up five-storey, seven-bay, west-facing walk-up. It is not a real
 * building, parcel or employer site (GOV-16), it links to no property, and
 * every number that would be a price is null (not priced), so the page shows
 * the blank, source-backed model the study asks for. The three options are
 * the study's comparison set: repair baseline, minimal selective flat, and
 * enhanced but still planar. Their preference scores are SYNTHETIC values
 * that exercise the scorer; they are not a design judgement.
 */
import {
  CRITERIA, FIS_SCHEMA_VERSION,
  type CostKind, type CostLine, type CriterionId, type DriverInput, type FacadeCell, type FacadeMask, type FacadeProject, type MaskKind, type RoomUse,
} from "./contracts";

const FLOORS = 5;
const BAYS = 7;
const ELEV = "elev-west";
export const cellId = (floor: number, bay: number) => `c-${floor}-${bay}`;

type Rect = FacadeMask["rect"];
const WINDOW: Rect = { x: 0.18, y: 0.2, w: 0.64, h: 0.58 };
const DOOR: Rect = { x: 0.22, y: 0.22, w: 0.56, h: 0.78 };
const FIRE_ESCAPE: Rect = { x: 0, y: 0.72, w: 1, h: 0.28 };
const DOWNSPOUT: Rect = { x: 0.4, y: 0, w: 0.2, h: 1 };
const VENT: Rect = { x: 0.38, y: 0.12, w: 0.24, h: 0.14 };
const METERS: Rect = { x: 0.15, y: 0.4, w: 0.7, h: 0.4 };
const CORNICE: Rect = { x: 0, y: 0, w: 1, h: 0.22 };

interface Bay { use: RoomUse; masks: [MaskKind, Rect][] }
const STREET: Bay[] = [
  { use: "resident_amenity", masks: [] },
  { use: "lobby", masks: [["egress", DOOR]] },
  { use: "mechanical", masks: [["utility", METERS], ["maintenance_access", { x: 0.15, y: 0.82, w: 0.7, h: 0.18 }]] },
  { use: "mail_delivery", masks: [["window", WINDOW]] },
  { use: "resident_amenity", masks: [] },
  { use: "laundry", masks: [["window", { x: 0.18, y: 0.35, w: 0.64, h: 0.45 }], ["utility", VENT]] },
  { use: "stair", masks: [["egress", DOOR]] },
];
const UPPER: Bay[] = [
  { use: "bedroom", masks: [] },
  { use: "bedroom", masks: [["window", WINDOW]] },
  { use: "living", masks: [["utility", DOWNSPOUT]] },
  { use: "living", masks: [["window", WINDOW]] },
  { use: "living", masks: [] },
  { use: "studio", masks: [["window", WINDOW], ["egress", FIRE_ESCAPE]] },
  { use: "bathroom", masks: [["utility", VENT]] },
];

const SRC = { geom: "syn-geometry", walk: "syn-field-walk", sun: "syn-sun-note" } as const;
const d = (value: string, state: DriverInput["state"], sourceIds: string[]): DriverInput => ({ value, state, sourceIds });

function buildCells(): { cells: FacadeCell[]; masks: FacadeMask[] } {
  const cells: FacadeCell[] = [];
  const masks: FacadeMask[] = [];
  for (let floor = 0; floor < FLOORS; floor++) {
    const top = floor === FLOORS - 1;
    (floor === 0 ? STREET : UPPER).forEach((bay, b) => {
      const id = cellId(floor, b);
      const kinds = bay.masks.map(([k]) => k);
      const drivers: FacadeCell["drivers"] = { space_function: d(bay.use.replace("_", " "), "provisional", [SRC.walk]) };
      if (kinds.includes("window")) {
        drivers.view_outward = d("Window: seated and standing views not yet checked", "missing", []);
        drivers.daylight_lighting = d("West exposure: strong afternoon sun likely; not modeled", "provisional", [SRC.sun]);
      }
      if (kinds.includes("utility")) drivers.utilities = d(floor === 0 && b === 2 ? "Gas and electric meters" : b === 2 ? "Roof drain downspout" : "Exhaust vent", "provisional", [SRC.walk]);
      if (top) drivers.maintenance = d("Cornice and parapet not surveyed; access method unknown", "missing", []);
      cells.push({
        id, elevationId: ELEV, floor, bay: b, roomUse: bay.use,
        geometryState: top ? "UNMEASURED" : "FIELD_OBSERVED",
        sourceIds: top ? [SRC.geom] : [SRC.geom, SRC.walk],
        drivers,
        ...(top ? { note: "Top floor: cornice not measured, so only F0 until it is surveyed" } : {}),
      });
      const all: [MaskKind, Rect][] = [...bay.masks, ...(top ? [["historic", CORNICE] as [MaskKind, Rect]] : [])];
      all.forEach(([kind, rect], i) => {
        masks.push({ id: `m-${floor}-${b}-${i}`, cellId: id, kind, rect, state: "provisional", sourceIds: [SRC.walk] });
      });
    });
  }
  return { cells, masks };
}

const unpriced = (id: string, kind: CostKind, label: string): CostLine => ({
  id, kind, label, amountUsd: null, estimateClass: "ROUGH_ORDER", sourceIds: [], date: "", confidence: "low",
  region: "", scopeDefinition: "", assumptions: "Not priced: needs a takeoff or written bid",
});

const SYNTHETIC_SCORES = (v: Record<CriterionId, number>) => ({
  values: v, scoredBy: "Synthetic fixture", date: "2026-11-04", basis: "SYNTHETIC values that exercise the scorer; not a design judgement",
});

const { cells, masks } = buildCells();
// The address sign sits on the wall beside the lobby door (a v0.2 "beside" placement; FG1 reviews it).
const minimal = { [cellId(0, 1)]: "F4", [cellId(0, 2)]: "F5", [cellId(0, 4)]: "F1" } as const;
const screened = [1, 2, 3].map((f) => cellId(f, 3));

export const SYNTHETIC_PROJECT: FacadeProject = {
  schemaVersion: FIS_SCHEMA_VERSION,
  id: "fis-synthetic-01",
  name: "Synthetic five-storey walk-up (software fixture)",
  revision: 1,
  dataStatus: "SYNTHETIC",
  mode: "retrofit",
  locationContext: "SYNTHETIC: a generic west-facing street elevation. Not a real building, parcel or employer site.",
  occupied: null,
  property: null,
  sources: [
    { id: SRC.geom, type: "synthetic", title: "Synthetic elevation grid (no real building)", uri: "lib/b5r/facade/fixture.ts", sha256: null, captureDate: null, author: "FIS-Flat v0.1 fixture", permission: "synthetic", tier: 4 },
    { id: SRC.walk, type: "synthetic", title: "Synthetic field-walk notes", uri: "lib/b5r/facade/fixture.ts", sha256: null, captureDate: null, author: "FIS-Flat v0.1 fixture", permission: "synthetic", tier: 4 },
    { id: SRC.sun, type: "synthetic", title: "Synthetic note: west sun on living-room windows", uri: "lib/b5r/facade/fixture.ts", sha256: null, captureDate: null, author: "FIS-Flat v0.1 fixture", permission: "synthetic", tier: 4 },
  ],
  drivers: {
    location_context: d("Synthetic west-facing street elevation; no parcel, climate or hazard data", "provisional", [SRC.geom]),
    history_identity: d("Cornice treated as historic fabric until a historic-resource check says otherwise", "provisional", [SRC.walk]),
    budget_financing: d("No approved budget", "missing", []),
    thermal_envelope: d("Wall assembly unknown; no envelope assessment", "missing", []),
  },
  elevations: [{
    id: ELEV, name: "West street elevation", orientation: "W", floors: FLOORS, bays: BAYS,
    bayWidthsMm: Array(BAYS).fill(null), floorHeightsMm: Array(FLOORS).fill(null),
    schematicBayWidths: [1, 1.6, 1, 1.6, 1, 1.6, 1], baseGeometrySourceId: SRC.geom, surveyState: "FIELD_OBSERVED",
  }],
  cells,
  masks,
  gateRecords: [],
  requiredWork: [unpriced("rw-condition", "required_repairs", "Condition survey and required repairs: brick, windows, flashing, fire escape, cornice")],
  budget: { approvedUsd: null, approvedBy: "", date: "", sourceIds: [] },
  finance: { discountRate: null, horizonYears: null, endOfLifeUsd: null, sourceIds: [] },
  weights: {
    values: Object.fromEntries(CRITERIA.map((c) => [c.id, c.weight])) as Record<CriterionId, number>,
    chosenBy: "Owner's Fresno default set (canon B5R-43)",
    date: "2026-11-04",
  },
  options: [
    {
      id: "opt-a", name: "A · Repair baseline",
      intent: "Inspect and repair brick, windows, flashing, fire escape and cornice; change nothing else (L0).",
      assignments: {}, justifications: [],
      costLines: [unpriced("a-access", "access", "Scaffold or lift access"), unpriced("a-cont", "contingency", "Contingency"), unpriced("a-tenant", "tenant_disruption", "Resident notice and coordination")],
      benefitLines: [],
      nonFinancialBenefits: ["Keeps every window, exit and historic element as it is"],
      scores: SYNTHETIC_SCORES({ resident_comfort: 4, lifecycle_value: 2, environmental: 1, constructability: 4, context: 3, adaptability: 2 }),
      renderSourceId: null,
    },
    {
      id: "opt-b", name: "B · Minimal selective flat",
      intent: "Repair baseline plus an address sign beside the lobby door, a mural on one blank wall and a protected meter door (L1).",
      assignments: { ...minimal }, justifications: [],
      costLines: [
        unpriced("b-design", "design_permits", "Design, sign and mural permits"), unpriced("b-access", "access", "Lift access"),
        unpriced("b-mat", "materials", "Paint, sign and door materials"), unpriced("b-fab", "fabrication", "Sign and meter door fabrication"),
        unpriced("b-install", "install", "Installation"), unpriced("b-tenant", "tenant_disruption", "Resident notice and coordination"),
        unpriced("b-cont", "contingency", "Contingency"),
      ],
      benefitLines: [{ id: "b-om", kind: "incremental_om", label: "Mural upkeep and sign cleaning", annualUsd: null, state: "missing", estimateClass: "ROUGH_ORDER", sourceIds: [], date: "", method: "" }],
      nonFinancialBenefits: ["Clearer address and entry for visitors and deliveries", "Community mural on a blank wall (artwork rights and mural registration to check)"],
      scores: SYNTHETIC_SCORES({ resident_comfort: 4, lifecycle_value: 2, environmental: 1, constructability: 4, context: 4, adaptability: 3 }),
      renderSourceId: null,
    },
    {
      id: "opt-c", name: "C · Enhanced planar",
      intent: "Option B plus perforated screens on three west living-room windows and flat panels on the piers beside them (L2).",
      assignments: { ...minimal, ...Object.fromEntries(screened.map((c) => [c, "F3" as const])), ...Object.fromEntries([1, 2, 3].map((f) => [cellId(f, 4), "F2" as const])) },
      justifications: screened.map((c) => ({
        cellId: c, maskKind: "window" as const, sourceIds: [SRC.sun],
        reason: "West-facing living-room window: afternoon sun and street privacy. Screen open area and daylight must be tested before approval.",
      })),
      costLines: [
        unpriced("c-design", "design_permits", "Design, engineering and permits"), unpriced("c-access", "access", "Scaffold access"),
        unpriced("c-mat", "materials", "Screen, panel, sign and paint materials"), unpriced("c-fab", "fabrication", "Screen, panel and sign fabrication"),
        unpriced("c-install", "install", "Installation"), unpriced("c-tenant", "tenant_disruption", "Resident notice, access to units and coordination"),
        unpriced("c-cont", "contingency", "Contingency"),
      ],
      benefitLines: [
        { id: "c-energy", kind: "energy_savings", label: "Cooling energy savings (not modeled)", annualUsd: null, state: "missing", estimateClass: "ROUGH_ORDER", sourceIds: [], date: "", method: "" },
        { id: "c-om", kind: "incremental_om", label: "Screen and panel cleaning and inspection", annualUsd: null, state: "missing", estimateClass: "ROUGH_ORDER", sourceIds: [], date: "", method: "" },
      ],
      nonFinancialBenefits: ["Afternoon shade and privacy for three living rooms (daylight loss to test)"],
      scores: SYNTHETIC_SCORES({ resident_comfort: 3, lifecycle_value: 3, environmental: 3, constructability: 2, context: 3, adaptability: 3 }),
      renderSourceId: null,
    },
  ],
};
