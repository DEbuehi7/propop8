// lib/b5r/screen/contract.ts
//
// The AIM-B5R photo screen's contract with the model. The model only reads
// the photos and fills in this fixed shape (what it sees, with photo numbers);
// it decides nothing. validateObservations() then checks every item by fixed
// rules, and anything that breaks a rule is set aside with the reason, never
// silently kept (GOV-14, GOV-17). Pure: no files, no network.

import { INTERVENTION_LADDER } from "../../canon/vocab";

/** Items that come before the ladder (safety and compliance first, INF-01) and after it (site systems, INF-03). */
export const ACCESS_STEP = "Access and safety" as const;
export const SITE_STEP = "Site, water and landscape" as const;
/** Where an opportunity sits, least intervention first (B5R-18). */
export const OPPORTUNITY_STEPS = [ACCESS_STEP, ...INTERVENTION_LADDER, SITE_STEP] as const;
export type OpportunityStep = (typeof OPPORTUNITY_STEPS)[number];

export const SCENE_KINDS = ["existing_building", "building_interior", "vacant_land", "street_or_public_space", "mixed", "unclear"] as const;
export const BASES = ["observed", "inferred"] as const;
export const SEVERITIES = ["minor", "moderate", "major", "unknown"] as const;

/** Hazards a photo can raise, each with the gate it feeds and the next step (fixed text, not the model's). */
export const HAZARDS = {
  possible_unreinforced_masonry: { gate: "G4", next: "Seismic: check the city's retrofit records for the parcel and get a structural engineer's review." },
  possible_soft_story: { gate: "G4", next: "Seismic: check for a soft-story retrofit order and get a structural engineer's review." },
  structural_distress: { gate: "G4", next: "A structural engineer's condition report before any scope or price." },
  egress_or_fire_safety: { gate: "G4", next: "Egress and fire-life-safety review by a licensed professional; never traded for features (INF-08, GOV-26)." },
  accessibility_barrier: { gate: "G4", next: "Accessibility review: step-free routes, clearances and fixtures (INF-08, LET-07)." },
  roof_or_envelope_damage: { gate: "G4", next: "Roof and envelope inspection by a licensed contractor." },
  water_intrusion_or_mould_signs: { gate: "G4", next: "Moisture and mould inspection." },
  possible_hazardous_materials: { gate: "G4", next: "Lab sampling for asbestos and lead before anything is disturbed; a visual or thermal check is not enough (ROB-08)." },
  flood_or_drainage_low_point: { gate: "G2", next: "FEMA flood layers saved with their effective date and polygon query, and a drainage review (B5R-11)." },
  slope_or_landslide: { gate: "G2", next: "CGS landslide and seismic hazard check, and a geotechnical review on a steep site (B5R-11)." },
  wildfire_fuel: { gate: "G2", next: "CAL FIRE fire hazard severity zone check and defensible space (B5R-11)." },
  overhead_utilities: { gate: "G3", next: "Utility clearances before any addition, ADU or crane work." },
  other: { gate: "G4", next: "Review by the relevant licensed professional." },
} as const;
export type HazardCode = keyof typeof HAZARDS;

export type Basis = (typeof BASES)[number];

export interface Observations {
  scene: { kind: (typeof SCENE_KINDS)[number]; summary: string };
  photos: { photo: number; shows: string }[];
  building: { storiesVisible: number | null; construction: string | null; apparentUse: string | null; apparentEra: string | null } | null;
  features: { what: string; photos: number[]; basis: Basis }[];
  conditions: { what: string; severity: (typeof SEVERITIES)[number]; photos: number[]; basis: Basis }[];
  hazards: { code: HazardCode; note: string; photos: number[]; basis: Basis }[];
  opportunities: { step: OpportunityStep; title: string; why: string; photos: number[]; basis: Basis }[];
  limits: string[];
  peopleOrPlatesVisible: boolean;
}

export const TOOL_NAME = "record_screen";

const refs = { type: "array", items: { type: "integer", minimum: 1 }, description: "Photo numbers that show it" };
const basis = { type: "string", enum: BASES, description: "observed: visible in the photo; inferred: your reading of visible clues (name the clue)" };

/** The tool the model must call once: its input is the Observations shape. */
export const TOOL = {
  name: TOOL_NAME,
  description: "Record what the photos show for an AIM-B5R development screen. Call it exactly once.",
  input_schema: {
    type: "object",
    required: ["scene", "photos", "building", "features", "conditions", "hazards", "opportunities", "limits", "peopleOrPlatesVisible"],
    properties: {
      scene: {
        type: "object", required: ["kind", "summary"],
        properties: { kind: { type: "string", enum: SCENE_KINDS }, summary: { type: "string", description: "Two or three plain sentences on what the photos show" } },
      },
      photos: { type: "array", items: { type: "object", required: ["photo", "shows"], properties: { photo: { type: "integer", minimum: 1 }, shows: { type: "string" } } } },
      building: {
        type: ["object", "null"],
        properties: {
          storiesVisible: { type: ["integer", "null"], description: "Stories you can count above ground; null if you can't" },
          construction: { type: ["string", "null"], description: "Visible structure and materials, e.g. brick masonry, wood frame with stucco" },
          apparentUse: { type: ["string", "null"] },
          apparentEra: { type: ["string", "null"], description: "Only if clues allow, e.g. 'appears early 20th century'" },
        },
      },
      features: { type: "array", description: "Elements worth keeping (structure, windows, materials, character, trees)", items: { type: "object", required: ["what", "photos", "basis"], properties: { what: { type: "string" }, photos: refs, basis } } },
      conditions: { type: "array", description: "Visible condition issues", items: { type: "object", required: ["what", "severity", "photos", "basis"], properties: { what: { type: "string" }, severity: { type: "string", enum: SEVERITIES }, photos: refs, basis } } },
      hazards: { type: "array", items: { type: "object", required: ["code", "note", "photos", "basis"], properties: { code: { type: "string", enum: Object.keys(HAZARDS) }, note: { type: "string" }, photos: refs, basis } } },
      opportunities: {
        type: "array", description: "Residential development ideas to investigate, each tied to what the photos show",
        items: { type: "object", required: ["step", "title", "why", "photos", "basis"], properties: { step: { type: "string", enum: OPPORTUNITY_STEPS }, title: { type: "string" }, why: { type: "string" }, photos: refs, basis } },
      },
      limits: { type: "array", items: { type: "string" }, description: "What these photos cannot show" },
      peopleOrPlatesVisible: { type: "boolean", description: "True if any person, face or licence plate is visible" },
    },
  },
} as const;

/** The rules the model reads. The code enforces the ones it can (validateObservations). */
export const SYSTEM_PROMPT = [
  "You read photos for an AIM-B5R development screen. Describe only what the photos show; you decide nothing. Code assigns every gate, label and order afterwards.",
  "Rules:",
  "- Cite the photo numbers for every item. basis is 'observed' when it is visible and 'inferred' when it is your reading of visible clues; name the clue.",
  "- Don't identify the property, its address, owner or location, even when a sign is visible.",
  "- Don't describe people, faces, licence plates or belongings. If any are visible, set peopleOrPlatesVisible to true.",
  "- AIM-B5R is residential only: never propose retail, office, restaurant, hotel, market or other commercial uses.",
  "- No money: no prices, costs, rents, values, percentages or returns anywhere.",
  "- Opportunities are ideas to investigate, tied to what the photos show. Put each on the step it needs; the least intervention that works comes first, keeping and adapting what exists is the default, and complete redevelopment is a last resort.",
  "- Put safety and access first. Say plainly in limits what the photos can't show.",
  `Call ${TOOL_NAME} once.`,
].join("\n");

export interface SetAside {
  where: string;
  text: string;
  reason: string;
}

const MONEY_SRC = String.raw`[$€£]\s?\d[\d,.]*(\s?(million|billion|thousand|bn|[kmb])\b)?|\b\d[\d,.]*\s?(%|percent\b|usd\b|dollars?\b)|\b(roi|noi|irr|dscr|arv|cap rate|appraised|per square foot|psf)\b`;
const MONEY = new RegExp(MONEY_SRC, "i");
/** The text with every money or return figure blanked, so a set-aside item never shows one either. */
export const redactMoney = (text: string) => text.replace(new RegExp(MONEY_SRC, "gi"), "[figure removed]");
const COMMERCIAL = /\b(retail|restaurants?|caf[eé]s?|co-?working|food hall|shops?|storefronts?|commercial|mixed[- ]use|office space|offices|market hall|hotel use)\b/i;

const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);
const str = (v: unknown) => (typeof v === "string" ? v.trim() : "");

/**
 * Checks the model's answer. Throws when the shape itself is wrong (the
 * screen can't be trusted at all); otherwise keeps what passes and sets the
 * rest aside with the reason: unknown codes, photo numbers it wasn't shown,
 * money figures (GOV-17) and non-residential uses (B5R-33).
 */
export function validateObservations(raw: unknown, photoCount: number): { obs: Observations; setAside: SetAside[] } {
  if (!isObj(raw)) throw new Error("the model's answer is not an object");
  for (const k of TOOL.input_schema.required) if (!(k in raw)) throw new Error(`the model's answer has no "${k}"`);
  const setAside: SetAside[] = [];
  const aside = (where: string, text: string, reason: string) => setAside.push({ where, text, reason });
  const money = (where: string, text: string) => {
    if (MONEY.test(text)) { aside(where, redactMoney(text), "money or return figures aren't allowed in a photo screen (GOV-17)"); return true; }
    return false;
  };
  const photoRefs = (where: string, label: string, v: unknown): number[] | null => {
    const ns = Array.isArray(v) ? [...new Set(v.filter((n): n is number => Number.isInteger(n) && n >= 1 && n <= photoCount))].sort((a, b) => a - b) : [];
    if (!ns.length) { aside(where, label, `cites no photo it was shown (1 to ${photoCount})`); return null; }
    return ns;
  };
  const basisOf = (v: unknown): Basis => (v === "observed" ? "observed" : "inferred");

  const sc = isObj(raw.scene) ? raw.scene : {};
  const kind = (SCENE_KINDS as readonly string[]).includes(str(sc.kind)) ? (str(sc.kind) as Observations["scene"]["kind"]) : "unclear";
  let summary = str(sc.summary);
  if (money("scene", summary)) summary = "(set aside: the summary contained money figures)";

  const photos = (Array.isArray(raw.photos) ? raw.photos : []).filter(isObj)
    .map((p) => ({ photo: Number(p.photo), shows: str(p.shows) }))
    .filter((p) => Number.isInteger(p.photo) && p.photo >= 1 && p.photo <= photoCount && p.shows && !money(`photo ${p.photo}`, p.shows));

  const b = isObj(raw.building) ? raw.building : null;
  const field = (v: unknown, where: string) => {
    const s = str(v);
    return s && !money(where, s) ? s : null;
  };
  const building = b ? {
    storiesVisible: Number.isInteger(b.storiesVisible) && (b.storiesVisible as number) >= 0 && (b.storiesVisible as number) < 200 ? (b.storiesVisible as number) : null,
    construction: field(b.construction, "building"), apparentUse: field(b.apparentUse, "building"), apparentEra: field(b.apparentEra, "building"),
  } : null;

  const features: Observations["features"] = [];
  for (const x of (Array.isArray(raw.features) ? raw.features : []).filter(isObj)) {
    const what = str(x.what);
    if (!what || money("features", what)) continue;
    const ps = photoRefs("features", what, x.photos);
    if (ps) features.push({ what, photos: ps, basis: basisOf(x.basis) });
  }
  const conditions: Observations["conditions"] = [];
  for (const x of (Array.isArray(raw.conditions) ? raw.conditions : []).filter(isObj)) {
    const what = str(x.what);
    if (!what || money("conditions", what)) continue;
    const ps = photoRefs("conditions", what, x.photos);
    const severity = (SEVERITIES as readonly string[]).includes(str(x.severity)) ? (str(x.severity) as Observations["conditions"][number]["severity"]) : "unknown";
    if (ps) conditions.push({ what, severity, photos: ps, basis: basisOf(x.basis) });
  }
  const hazards: Observations["hazards"] = [];
  for (const x of (Array.isArray(raw.hazards) ? raw.hazards : []).filter(isObj)) {
    const code = str(x.code);
    const note = str(x.note);
    if (!(code in HAZARDS)) { aside("hazards", `${code}: ${note}`, "not one of the screen's hazard codes"); continue; }
    if (money("hazards", note)) continue;
    const ps = photoRefs("hazards", note || code, x.photos);
    if (ps) hazards.push({ code: code as HazardCode, note, photos: ps, basis: basisOf(x.basis) });
  }
  const opportunities: Observations["opportunities"] = [];
  for (const x of (Array.isArray(raw.opportunities) ? raw.opportunities : []).filter(isObj)) {
    const step = str(x.step);
    const title = str(x.title);
    const why = str(x.why);
    const text = `${title}: ${why}`;
    if (!(OPPORTUNITY_STEPS as readonly string[]).includes(step)) { aside("opportunities", text, `"${step}" is not a step on the intervention ladder`); continue; }
    if (!title) continue;
    if (money("opportunities", text)) continue;
    if (COMMERCIAL.test(text)) { aside("opportunities", text, "AIM-B5R is residential only (B5R-33)"); continue; }
    const ps = photoRefs("opportunities", text, x.photos);
    if (ps) opportunities.push({ step: step as OpportunityStep, title, why, photos: ps, basis: basisOf(x.basis) });
  }
  const limits = (Array.isArray(raw.limits) ? raw.limits : []).map(str).filter((l) => l && !money("limits", l));
  return {
    obs: { scene: { kind, summary }, photos, building, features, conditions, hazards, opportunities, limits, peopleOrPlatesVisible: raw.peopleOrPlatesVisible === true },
    setAside,
  };
}
