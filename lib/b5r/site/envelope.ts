// lib/b5r/site/envelope.ts
//
// Site fit (canon GOV-30): before a program goes into a study, spec or budget,
// check it against the lot it is meant for. The rules come from a written
// zoning source; anything not known stays unknown and is reported, never
// guessed. Pure and deterministic.

export const SQFT_PER_ACRE = 43_560;

export interface SiteRules {
  /** Lot dimensions in feet (a rectangle). */
  widthFt?: number;
  depthFt?: number;
  /** Lot area from the parcel record, for a lot that is not a rectangle. Dimensions win when both are given. */
  areaSqft?: number;
  /** Setbacks in feet; null when not known. */
  setbacksFt: { front: number; rear: number; side: number } | null;
  /** Maximum lot coverage as a fraction (0.4 is 40%); null when not known. */
  maxCoverage: number | null;
  /** Homes allowed on the lot (a primary, an ADU and a JADU is 3); null when not known. */
  homesAllowed: number | null;
  /** Floors the height limit allows; null when not known. */
  floorsAllowed: number | null;
  /** Paved parking spaces required; null when not known. */
  parkingSpaces?: number | null;
  /** Where the rules come from: a written zoning reply, a code section, a survey. Required. */
  source: string;
}

export interface SiteEnvelope {
  lotSqft: number | null;
  lotAcres: number | null;
  /** Largest ground footprint the coverage limit allows. */
  coverageCapSqft: number | null;
  /** Area inside the setbacks, taking the smaller of the two ways the lot can face the street. */
  setbackEnvelopeSqft: number | null;
  /** The smaller of the coverage cap and the setback envelope: buildable either way round. */
  footprintSqft: number | null;
  unknown: string[];
}

export interface Program {
  name: string;
  /** Total floor area of everything planned on the lot. */
  grossSqft: number;
  /** Homes it contains (a main house plus an in-law suite is 2). */
  homes: number;
  /** Floors it is drawn with, if any. */
  floors?: number;
}

export interface SiteFit {
  /** true fits, false does not, null depends on something not known yet. */
  fits: boolean | null;
  /** Gross area divided by the buildable footprint. */
  floorsNeeded: number | null;
  /** What breaks a rule. */
  issues: string[];
  /** What must be found out before the answer is final. */
  unknown: string[];
}

const ok = (n: number | undefined | null): n is number => typeof n === "number" && Number.isFinite(n) && n >= 0;
const sqft = (n: number) => `${Math.round(n).toLocaleString("en-US")} sq ft`;

/** Acres from square feet: always 43,560 sq ft per acre. */
export const acresOf = (sqftArea: number): number => sqftArea / SQFT_PER_ACRE;

/** What the lot allows, from its rules. */
export function siteEnvelope(r: SiteRules): SiteEnvelope {
  if (!r.source?.trim()) throw new Error("site rules need a source (a written zoning reply, a code section, a survey)");
  const unknown: string[] = [];
  const rect = ok(r.widthFt) && ok(r.depthFt);
  const lotSqft = rect ? r.widthFt! * r.depthFt! : ok(r.areaSqft) ? r.areaSqft! : null;
  if (lotSqft === null) unknown.push("lot area: no dimensions or parcel-record area");
  const coverageCapSqft = lotSqft !== null && ok(r.maxCoverage) && r.maxCoverage! <= 1 ? lotSqft * r.maxCoverage! : null;
  if (r.maxCoverage === null) unknown.push("maximum lot coverage");
  let setbackEnvelopeSqft: number | null = null;
  if (rect && r.setbacksFt) {
    const { front, rear, side } = r.setbacksFt;
    const w = r.widthFt!, d = r.depthFt!;
    const narrowFront = Math.max(0, w - 2 * side) * Math.max(0, d - front - rear);
    const wideFront = Math.max(0, d - 2 * side) * Math.max(0, w - front - rear);
    setbackEnvelopeSqft = Math.min(narrowFront, wideFront);
  } else if (!r.setbacksFt) {
    unknown.push("setbacks");
  } else {
    unknown.push("setback envelope: needs lot dimensions, not just an area");
  }
  const parts = [coverageCapSqft, setbackEnvelopeSqft].filter((x): x is number => x !== null);
  const footprintSqft = parts.length ? Math.min(...parts) : null;
  if (r.homesAllowed === null) unknown.push("homes allowed");
  if (r.floorsAllowed === null) unknown.push("height limit (floors allowed)");
  return { lotSqft, lotAcres: lotSqft === null ? null : acresOf(lotSqft), coverageCapSqft, setbackEnvelopeSqft, footprintSqft, unknown };
}

/** Does a program fit the lot? Every rule it breaks is listed; nothing unknown is guessed. */
export function checkProgram(r: SiteRules, p: Program): SiteFit {
  const env = siteEnvelope(r);
  const issues: string[] = [];
  const unknown: string[] = [];
  if (r.homesAllowed !== null && p.homes > r.homesAllowed) issues.push(`${p.name} has ${p.homes} homes; the site allows ${r.homesAllowed}`);
  if (r.homesAllowed === null) unknown.push("homes allowed");
  let floorsNeeded: number | null = null;
  if (env.footprintSqft === null || env.footprintSqft === 0) {
    unknown.push("buildable footprint (coverage or setbacks not known)");
  } else {
    floorsNeeded = p.grossSqft / env.footprintSqft;
    const need = Math.round(floorsNeeded * 10) / 10;
    if (r.floorsAllowed !== null && floorsNeeded > r.floorsAllowed) {
      issues.push(`${p.name} (${sqft(p.grossSqft)}) needs ${need} floors of full footprint; the height limit allows ${r.floorsAllowed}`);
    } else if (r.floorsAllowed === null && floorsNeeded > 1) {
      unknown.push(`height limit: ${p.name} needs ${need} floors of full footprint (${sqft(env.footprintSqft)} buildable)`);
    }
    if (p.floors !== undefined && p.floors > 0 && p.grossSqft / p.floors > env.footprintSqft) {
      issues.push(`${p.name} is drawn on ${p.floors} floor(s) of ${sqft(p.grossSqft / p.floors)}; the buildable footprint is ${sqft(env.footprintSqft)}`);
    }
    if (p.floors !== undefined && r.floorsAllowed !== null && p.floors > r.floorsAllowed) {
      issues.push(`${p.name} is drawn with ${p.floors} floors; the height limit allows ${r.floorsAllowed}`);
    }
  }
  return { fits: issues.length ? false : unknown.length ? null : true, floorsNeeded, issues, unknown };
}
