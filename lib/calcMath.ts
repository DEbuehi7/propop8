/**
 * lib/calcMath.ts
 * ----------------------------------------------------------------
 * The one place the arithmetic lives. Both lib/diagnosticCalculators.ts
 * (the free calculators) and lib/auditEngine.ts (the paid audit) import
 * from here, so a calculator and the audit can never disagree on how a
 * share, a change or a vacancy cost is computed.
 *
 * Pure functions only: no I/O, no Date.now(), no formatting beyond the
 * two display helpers at the bottom. Zero or unusable denominators return
 * null, never 0 -- "unknown" is not the same as "zero".
 */

/** part / total as a plain ratio (0.6 = 60%). null when total is not > 0. */
export function ratio(part: number, total: number): number | null {
  if (!Number.isFinite(part) || !Number.isFinite(total) || total <= 0) return null;
  return part / total;
}

/** part as a percentage of total. null when total is not > 0. */
export function sharePct(part: number, total: number): number | null {
  const r = ratio(part, total);
  return r === null ? null : r * 100;
}

/** Percent change from baseline to current. null when baseline is not > 0. */
export function changePct(current: number, baseline: number): number | null {
  if (!Number.isFinite(current) || !Number.isFinite(baseline) || baseline <= 0) return null;
  return ((current - baseline) / baseline) * 100;
}

/**
 * Runs that were due, and have not been confirmed, since the last confirmed run.
 * Runs are due at frequency, 2*frequency, ... so a job confirmed 133 days ago on a
 * 23-day cycle was due on days 23, 46, 69, 92 and 115: five runs. This is the
 * single source for both the number and the dots in the automation calculator.
 */
export function missedCycles(frequencyDays: number, daysSinceConfirmed: number): number | null {
  if (!Number.isFinite(frequencyDays) || frequencyDays <= 0) return null;
  if (!Number.isFinite(daysSinceConfirmed) || daysSinceConfirmed < 0) return null;
  return Math.floor(daysSinceConfirmed / frequencyDays);
}

export interface VacancyInput {
  monthlyRent: number;
  /** ISO yyyy-mm-dd */
  moveOut: string;
  readyDate: string;
  leaseDate: string;
  /** 30 is the PM convention; 30.44 is calendar-exact. */
  daysPerMonth?: number;
}

export interface VacancyMetrics {
  operationalDays: number;
  leasingDays: number;
  totalDays: number;
  dailyRent: number;
  operationalExposure: number;
  leasingExposure: number;
  totalExposure: number;
  operationalPercent: number;
  leasingPercent: number;
}

function dayNumber(iso: string): number | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!m) return null;
  const ms = Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return Number.isNaN(ms) ? null : ms / 86400000;
}

/** Whole days from one ISO date to another; null if either is not a valid date. */
export function daysBetweenIso(fromIso: string, toIso: string): number | null {
  const a = dayNumber(fromIso);
  const b = dayNumber(toIso);
  return a === null || b === null ? null : b - a;
}

/**
 * Vacancy split: move-out -> rent-ready is operational, rent-ready ->
 * lease-signed is leasing. Returns null on any invalid or out-of-order input
 * instead of guessing.
 */
export function computeVacancy(i: VacancyInput): VacancyMetrics | null {
  const perMonth = i.daysPerMonth ?? 30;
  if (!(i.monthlyRent > 0) || !(perMonth > 0)) return null;
  const operationalDays = daysBetweenIso(i.moveOut, i.readyDate);
  const leasingDays = daysBetweenIso(i.readyDate, i.leaseDate);
  if (operationalDays === null || leasingDays === null) return null;
  if (operationalDays < 0 || leasingDays < 0) return null;
  const totalDays = operationalDays + leasingDays;
  const dailyRent = i.monthlyRent / perMonth;
  const operationalExposure = Math.round(operationalDays * dailyRent);
  const totalExposure = Math.round(totalDays * dailyRent);
  return {
    operationalDays,
    leasingDays,
    totalDays,
    dailyRent: Math.round(dailyRent),
    operationalExposure,
    leasingExposure: totalExposure - operationalExposure,
    totalExposure,
    operationalPercent: totalDays > 0 ? (operationalDays / totalDays) * 100 : 0,
    leasingPercent: totalDays > 0 ? (leasingDays / totalDays) * 100 : 0,
  };
}

/** Thresholds shared by calculator colouring and the audit narrative. */
export const THRESHOLDS = {
  callbackRatePct: 5,
  agedShareOfOpenPct: 15,
  vendorConcentrationPct: 50,
  /** Below this dollar baseline a percentage change says nothing (a move from $3 to $24,555 is +818,400%). */
  minComparableBaseline: 100,
} as const;

export function pctFmt(n: number): string {
  return `${n >= 0 ? "+" : ""}${n.toFixed(0)}%`;
}

export function moneyFmt(n: number): string {
  const sign = n < 0 ? "-" : "";
  return `${sign}$${Math.round(Math.abs(n)).toLocaleString("en-US")}`;
}
