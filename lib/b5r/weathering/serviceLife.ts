// lib/b5r/weathering/serviceLife.ts
//
// The weathering layer (canon B5R-55, proposed): how long a building or street
// element should last where it is, how worn it is now, and when it next needs
// work. See docs/aim-b5r/WEATHERING.md.
//
//   estimated life = reference service life x quality x design x execution
//                    x indoor environment x outdoor environment x in-use x maintenance
//
// That is the factor method of ISO 15686 (part 8, service-life estimation): a
// sourced reference life under reference conditions, adjusted by seven factors
// for this place. The standard suggests 0.8 (worse than reference), 1.0
// (reference) or 1.2 (better) for each factor.
//
// Rules, all deterministic:
//   - Unknown stays unknown. A reference life without a source, or any factor
//     without a value and a basis, leaves the estimate unknown; nothing here
//     ships a default lifespan or a default factor.
//   - Condition is graded 1 (as new) to 5 (failed or unsafe) by a named person
//     from a dated photo taken from a registered viewpoint (capture clock,
//     VIS-10). This code never grades a photo.
//   - A latest grade at or past the element's intervention grade makes work
//     due on that date. Otherwise work falls due at the earlier of the condition
//     trend and the age estimate. When the latest look is better than that date
//     expects, the result is "check": a person re-inspects and, if it holds,
//     changes the reference life or a factor. The code never moves a date later
//     on its own.
//   - Graffiti, vandalism and litter are social and operational cycles, not
//     decay: they are logged as report-to-clear times, never given a lifespan.
//   - Wear describes materials and streets, never the people who live there
//     (GOV-29, B5R-54).

export const WEATHERING_VERSION = "aim-weathering-0.1.0";

/** Stewart Brand's shearing layers (How Buildings Learn, 1994, after Frank Duffy), slowest first. */
export const SHEARING_LAYERS = ["site", "structure", "skin", "services", "space_plan", "stuff"] as const;
export type ShearingLayer = (typeof SHEARING_LAYERS)[number];

export type WearKind = "material" | "social" | "operational";

/** How an element wears, and whether that is decay at all. */
export const MECHANISMS = {
  uv: { kind: "material", label: "Sunlight breaks down the binder and pigment, so paint fades and chalks" },
  abrasion: { kind: "material", label: "Feet, tyres and cleaning wear the surface away" },
  thermal: { kind: "material", label: "Heating and cooling cycles crack and loosen materials" },
  moisture: { kind: "material", label: "Water gets in: staining, efflorescence, rot, failed sealant" },
  corrosion: { kind: "material", label: "Steel and fixings rust" },
  root_heave: { kind: "material", label: "Tree roots lift and crack slabs" },
  cracking: { kind: "material", label: "Shrinkage and settlement crack concrete and plaster" },
  carbonation: { kind: "material", label: "Carbonation reaches the rebar, which rusts and splits the concrete" },
  lamp_failure: { kind: "material", label: "Lamps burn out; LEDs dim slowly instead" },
  graffiti: { kind: "social", label: "People mark it" },
  vandalism: { kind: "social", label: "People break it" },
  litter: { kind: "operational", label: "Trash collects until it is picked up" },
} as const satisfies Record<string, { kind: WearKind; label: string }>;
export type Mechanism = keyof typeof MECHANISMS;

export type Grade = 1 | 2 | 3 | 4 | 5;

export const CONDITION_GRADES: Record<Grade, string> = {
  1: "As new",
  2: "Minor wear, nothing to do",
  3: "Visible wear, still works",
  4: "Poor: needs work",
  5: "Failed or unsafe",
};

/** Work is due at grade 4 unless the element says otherwise. */
export const DEFAULT_INTERVENTION_GRADE: Grade = 4;
/** A trend needs observations at least this many days apart (a tuning constant, not canon). */
export const MIN_TREND_DAYS = 90;
/** The factor values ISO 15686 suggests; anything outside is allowed but flagged. */
export const ISO_USUAL_FACTOR_RANGE = [0.8, 1.2] as const;
const DAYS_PER_YEAR = 365.25;

export const FACTOR_NAMES = ["quality", "design", "execution", "indoor", "outdoor", "inUse", "maintenance"] as const;
export type FactorName = (typeof FACTOR_NAMES)[number];

export const FACTOR_LABELS: Record<FactorName, string> = {
  quality: "quality of the material or component",
  design: "design level",
  execution: "workmanship",
  indoor: "indoor environment",
  outdoor: "outdoor environment",
  inUse: "in-use conditions",
  maintenance: "maintenance level",
};

export interface Factor {
  /** The multiplier, or null while not set. */
  value: number | null;
  /** Why this value: a source, an observation, a manufacturer's condition. Required. */
  basis: string;
}

export interface ReferenceLife {
  /** Service life in years under the reference conditions, or null while not known. */
  years: number | null;
  /** Where it comes from: a product declaration, a standard, a published study. Required. */
  source: string;
  /** The conditions it was measured under. */
  conditions: string;
}

export interface Observation {
  /** YYYY-MM-DD, from the photo's capture time. */
  date: string;
  grade: Grade | null;
  /** The named person who graded it. */
  by: string;
  /** Photo reference in the evidence store. */
  photo: string;
  /** The registered viewpoint the photo was taken from, so photos compare like with like. */
  viewpoint: string;
}

export interface WeatheringElement {
  id: string;
  name: string;
  layer: ShearingLayer;
  mechanism: Mechanism;
  /** Who can fix it: the building's owner, the city or utility, or not known. */
  owner: "building" | "public" | "unknown";
  /** YYYY-MM-DD it was installed or last renewed, or null. */
  installed: string | null;
  reference: ReferenceLife;
  factors: Record<FactorName, Factor>;
  interventionGrade?: Grade;
  observations: Observation[];
}

export interface LifeEstimate {
  years: number | null;
  /** Product of the seven factors, when all are known. */
  factorProduct: number | null;
  unknown: string[];
  /** Factors outside the standard's usual range, for a person to check. */
  flagged: string[];
}

export type Status = "due" | "check" | "ok" | "unknown" | "not_decay";

export interface Assessment {
  id: string;
  kind: WearKind;
  status: Status;
  estimate: LifeEstimate | null;
  ageYears: number | null;
  /** Install date plus the estimated life. */
  ageDueDate: string | null;
  latest: Observation | null;
  trend: Trend | null;
  /** Where the due date comes from. */
  dueBy: "observed" | "trend" | "age" | null;
  dueDate: string | null;
  notes: string[];
  /** Observations left out, with the reason. */
  excluded: { date: string; why: string }[];
}

export interface Trend {
  /** Grades per year; positive means getting worse. */
  gradesPerYear: number;
  points: number;
  from: string;
  to: string;
  /** When the trend line reaches the intervention grade, if it is getting worse. */
  reachesInterventionOn: string | null;
}

const DAY_MS = 86_400_000;

/** Days since 1970-01-01 for a strict YYYY-MM-DD date, or null. */
export function dayNumber(date: string | null | undefined): number | null {
  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;
  const [y, m, d] = date.split("-").map(Number);
  const t = Date.UTC(y, m - 1, d);
  const back = new Date(t);
  if (back.getUTCFullYear() !== y || back.getUTCMonth() !== m - 1 || back.getUTCDate() !== d) return null;
  return t / DAY_MS;
}

export function dateOf(day: number): string {
  return new Date(Math.round(day) * DAY_MS).toISOString().slice(0, 10);
}

const round = (n: number, places: number) => Math.round(n * 10 ** places) / 10 ** places;

/** The factor method. Any missing input leaves the estimate unknown. */
export function estimateLife(el: Pick<WeatheringElement, "reference" | "factors">): LifeEstimate {
  const unknown: string[] = [];
  const flagged: string[] = [];
  const r = el.reference;
  if (r.years === null) unknown.push("reference service life not known");
  else if (!Number.isFinite(r.years) || r.years <= 0) unknown.push("reference service life is not a positive number of years");
  if (!r.source.trim()) unknown.push("reference service life has no source");
  let product = 1;
  for (const name of FACTOR_NAMES) {
    const f = el.factors[name];
    const label = FACTOR_LABELS[name];
    if (!f || f.value === null) { unknown.push(`${label} factor not set`); continue; }
    if (!Number.isFinite(f.value) || f.value <= 0) { unknown.push(`${label} factor is not a positive number`); continue; }
    if (!f.basis.trim()) { unknown.push(`${label} factor has no basis`); continue; }
    if (f.value < ISO_USUAL_FACTOR_RANGE[0] || f.value > ISO_USUAL_FACTOR_RANGE[1]) {
      flagged.push(`${label} factor ${f.value} is outside 0.8 to 1.2; check its basis: ${f.basis}`);
    }
    product *= f.value;
  }
  const known = unknown.length === 0;
  return {
    years: known ? round((r.years as number) * product, 2) : null,
    factorProduct: known ? round(product, 4) : null,
    unknown,
    flagged,
  };
}

/** Observations that can be used, oldest first, and the ones left out. */
export function usableObservations(obs: readonly Observation[]): { used: Observation[]; excluded: { date: string; why: string }[] } {
  const used: Observation[] = [];
  const excluded: { date: string; why: string }[] = [];
  for (const o of obs) {
    const why =
      dayNumber(o.date) === null ? "no valid date" :
      o.grade === null ? "not graded" :
      !Number.isInteger(o.grade) || o.grade < 1 || o.grade > 5 ? "grade is not 1 to 5" :
      !o.by.trim() ? "no named grader" :
      !o.photo.trim() ? "no photo" :
      !o.viewpoint.trim() ? "no registered viewpoint" : null;
    if (why) excluded.push({ date: o.date, why });
    else used.push(o);
  }
  used.sort((a, b) => (dayNumber(a.date) as number) - (dayNumber(b.date) as number) || a.photo.localeCompare(b.photo));
  return { used, excluded };
}

/** Least-squares trend of grade over time, when the observations span long enough. */
export function conditionTrend(used: readonly Observation[], interventionGrade: Grade): Trend | null {
  if (used.length < 2) return null;
  const days = used.map((o) => dayNumber(o.date) as number);
  const first = days[0];
  const last = days[days.length - 1];
  if (last - first < MIN_TREND_DAYS) return null;
  const xs = days.map((d) => (d - first) / DAYS_PER_YEAR);
  const ys = used.map((o) => o.grade as number);
  const mx = xs.reduce((a, b) => a + b, 0) / xs.length;
  const my = ys.reduce((a, b) => a + b, 0) / ys.length;
  let sxy = 0;
  let sxx = 0;
  for (let i = 0; i < xs.length; i++) {
    sxy += (xs[i] - mx) * (ys[i] - my);
    sxx += (xs[i] - mx) ** 2;
  }
  const slope = sxy / sxx;
  const reaches = slope > 0 ? first + (mx + (interventionGrade - my) / slope) * DAYS_PER_YEAR : null;
  return {
    gradesPerYear: round(slope, 3),
    points: used.length,
    from: used[0].date,
    to: used[used.length - 1].date,
    reachesInterventionOn: reaches === null ? null : dateOf(reaches),
  };
}

/** Where an element stands on a given day (YYYY-MM-DD). */
export function assess(el: WeatheringElement, asOf: string): Assessment {
  const today = dayNumber(asOf);
  if (today === null) throw new Error(`asOf must be a YYYY-MM-DD date, got "${asOf}"`);
  const kind = MECHANISMS[el.mechanism].kind;
  const later = el.observations.filter((o) => (dayNumber(o.date) ?? -Infinity) > today);
  const { used, excluded } = usableObservations(el.observations.filter((o) => !later.includes(o)));
  for (const o of later) excluded.push({ date: o.date, why: `after ${asOf}` });
  const latest = used.length ? used[used.length - 1] : null;
  const notes: string[] = [];
  if (el.owner === "public") notes.push("public element: report it to the city or utility; the building cannot fix it");

  if (kind !== "material") {
    notes.unshift(`${MECHANISMS[el.mechanism].label}: a ${kind} cycle, not decay. Log report-to-clear times instead of a service life.`);
    return { id: el.id, kind, status: "not_decay", estimate: null, ageYears: null, ageDueDate: null, latest, trend: null, dueBy: null, dueDate: null, notes, excluded };
  }

  const g = el.interventionGrade ?? DEFAULT_INTERVENTION_GRADE;
  const estimate = estimateLife(el);
  const installed = dayNumber(el.installed);
  if (el.installed !== null && installed === null) notes.push(`install date "${el.installed}" is not a YYYY-MM-DD date`);
  const ageYears = installed === null ? null : round((today - installed) / DAYS_PER_YEAR, 2);
  const ageDue = installed !== null && estimate.years !== null ? installed + estimate.years * DAYS_PER_YEAR : null;
  const trend = conditionTrend(used, g);
  const trendDue = trend?.reachesInterventionOn ? (dayNumber(trend.reachesInterventionOn) as number) : null;
  const base = { id: el.id, kind, estimate, ageYears, ageDueDate: ageDue === null ? null : dateOf(ageDue), latest, trend, notes, excluded };

  if (latest && (latest.grade as number) >= g) {
    // Due since the first look of the latest run at or past the intervention grade.
    let i = used.length - 1;
    while (i > 0 && (used[i - 1].grade as number) >= g) i--;
    return { ...base, status: "due", dueBy: "observed", dueDate: used[i].date };
  }

  const candidates: { by: "trend" | "age"; day: number }[] = [];
  if (trendDue !== null) candidates.push({ by: "trend", day: trendDue });
  if (ageDue !== null) candidates.push({ by: "age", day: ageDue });
  if (!candidates.length) {
    if (estimate.years === null) notes.push(`no age estimate: ${estimate.unknown.join("; ")}`);
    if (installed === null) notes.push("no install date");
    if (!trend) notes.push(`no trend: needs two graded photos from a registered viewpoint at least ${MIN_TREND_DAYS} days apart`);
    return { ...base, status: "unknown", dueBy: null, dueDate: null };
  }
  candidates.sort((a, b) => a.day - b.day || (a.by === "trend" ? -1 : 1));
  const next = candidates[0];
  const dueDate = dateOf(next.day);
  if (trendDue !== null && ageDue !== null && trendDue > ageDue) {
    notes.push(`the trend says ${dateOf(trendDue)}, later than the age estimate; the earlier date stands until a person changes the reference life or a factor`);
  }
  if (next.day > today) return { ...base, status: "ok", dueBy: next.by, dueDate };
  if (latest && (dayNumber(latest.date) as number) >= next.day) {
    notes.push(`the ${next.by} date has passed but the latest grade (${latest.grade}, ${latest.date}) is below ${g}: re-inspect, and if it holds, a person updates the estimate`);
    return { ...base, status: "check", dueBy: next.by, dueDate };
  }
  return { ...base, status: "due", dueBy: next.by, dueDate };
}

export interface ResponseEvent {
  /** ISO date-time it was reported. */
  reported: string;
  /** ISO date-time it was cleared, or null while still open. */
  cleared: string | null;
}

export interface ResponseSummary {
  cleared: number;
  open: number;
  /** Median hours from report to clear, over cleared events. */
  medianHours: number | null;
  /** Hours the oldest open event has waited, at asOf. */
  longestOpenHours: number | null;
  excluded: number;
}

/** Report-to-clear times for social and operational cycles (graffiti, vandalism, litter). */
export function responseTimes(events: readonly ResponseEvent[], asOf: string): ResponseSummary {
  const now = Date.parse(asOf);
  if (!Number.isFinite(now)) throw new Error(`asOf must be an ISO date or date-time, got "${asOf}"`);
  const hours: number[] = [];
  let open = 0;
  let longest: number | null = null;
  let excluded = 0;
  for (const e of events) {
    const r = Date.parse(e.reported);
    const c = e.cleared === null ? null : Date.parse(e.cleared);
    if (!Number.isFinite(r) || r > now || (c !== null && (!Number.isFinite(c) || c < r))) { excluded++; continue; }
    if (c === null || c > now) {
      open++;
      const waited = (now - r) / 3_600_000;
      longest = longest === null ? waited : Math.max(longest, waited);
    } else {
      hours.push((c - r) / 3_600_000);
    }
  }
  hours.sort((a, b) => a - b);
  const mid = Math.floor(hours.length / 2);
  const median = hours.length === 0 ? null : hours.length % 2 ? hours[mid] : (hours[mid - 1] + hours[mid]) / 2;
  return {
    cleared: hours.length,
    open,
    medianHours: median === null ? null : round(median, 1),
    longestOpenHours: longest === null ? null : round(longest, 1),
    excluded,
  };
}
