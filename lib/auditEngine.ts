/**
 * lib/auditEngine.ts
 * ----------------------------------------------------------------
 * Deterministic ledger analysis. Rebuilt against the pre-pilot
 * doctrine: THE LEDGER SURFACES REVIEW TRIGGERS. It does not
 * establish cause, fault, fraud, savings, or recurrence.
 *
 * WHAT CHANGED FROM THE PREVIOUS VERSION, AND WHY
 *
 * 1. parseCsv mishandled credits. `Number(str.replace(/[^0-9.-]/g,""))`
 *    turned the accounting negative "(85.00)" into +85. components/
 *    LedgerCheck.tsx fixed this months ago; this file never got it.
 *    That bug inflated every vendor total and every concentration
 *    share on any export using paren notation -- and now that credits
 *    and reversals are a reported output, it corrupted those directly.
 *    Ported the LedgerCheck fix here verbatim.
 *
 * 2. buildSpendTable's baseline was min(amount) x count. On a file
 *    with any credit line, min() is negative, the baseline is
 *    negative, and `baseline > 0 ? ... : 0` printed a calm 0% variance
 *    over nonsense. Replaced with a real monthly baseline: the latest
 *    month present vs the arithmetic mean of up to 5 prior months, per
 *    category. When there aren't at least 2 prior months of data, the
 *    row is marked baselineUsable:false and the renderer must print
 *    INSUFFICIENT BASELINE rather than a number.
 *
 * 3. checkAging said `mostly ${topCategory}` where topCategory was
 *    just the max-count category. Across 7 items in 7 categories the
 *    winner has a count of 1, and the sentence was false. It now only
 *    claims concentration when one category holds more than half, and
 *    otherwise reports the spread. It also totals the aged dollars and
 *    the >90-day subset, which the old version never computed.
 *
 * 4. Duplicates are split. Exact duplicate candidates (identical date,
 *    vendor, category and amount) are a different finding type from
 *    near-duplicate candidates (same vendor and amount, different
 *    dates within a window). Neither is called "likely duplicate" --
 *    this ledger has no invoice or work-order ID, so an exact match is
 *    still only a candidate.
 *
 * 5. recoveryTotal is gone. Summing flagged amounts and calling it
 *    "annual recovery opportunity" asserted both recoverability and an
 *    annual period, neither of which follows from the file. Replaced
 *    with reviewTriggerCount.
 *
 * 6. Every finding carries a claimType: FACT / CALCULATION /
 *    INFERENCE / PREDICTION.
 *
 * KNOWN LIMIT KEPT DELIBERATELY: checkVendorConcentration still
 * requires vendors.size > 1. A category with a single vendor is 100%
 * concentrated, which is the strongest dependency signal there is, but
 * it's also the ordinary shape of a small portfolio and firing on
 * every such category would bury the real signals. Revisit with a
 * minimum-spend floor rather than by dropping the guard.
 */
import Papa from "papaparse";
import { ratio, sharePct, changePct } from "./calcMath";

export interface LedgerRow {
  date: string;
  vendor: string;
  category: string;
  amount: number;
  unit?: string;
  description?: string;
  workOrderId?: string;
  status?: string;
  openedDate?: string;
  /** Parsed and preserved, but no current check reads it. Kept because
   *  HEADER_ALIASES maps closed_date and dropping the field silently
   *  discards a column the operator did send. */
  closedDate?: string;
  /** 1-based source row number, preserved for provenance. */
  sourceRow: number;
}

export type ClaimType = "FACT" | "CALCULATION" | "INFERENCE" | "PREDICTION";

export interface Finding {
  id: string;
  category: string;
  title: string;
  description: string;
  amount: string;
  amountLabel: string;
  amountIsCost: boolean;
  /** Rendered as "REVIEW NEXT" -- what a human should check, never a verdict. */
  recommendation: string;
  include: boolean;
  claimType: ClaimType;
  /** Source row numbers behind this finding, for provenance. */
  sourceRows: number[];
  visual?:
    | { kind: "concentration"; sharePct: number; topSpend: number; totalSpend: number }
    | { kind: "aging"; totalOpen: number; agedCount: number };
}

export interface SpendRow {
  category: string;
  thisPeriod: string;
  baseline: string;
  variancePct: number;
  /** false => renderer MUST print INSUFFICIENT BASELINE, not variancePct. */
  baselineUsable: boolean;
}

export interface AuditWindow {
  firstDate: string;
  lastDate: string;
  /** The latest COMPLETE month. A partial trailing month is excluded --
   *  see buildWindow. */
  latestMonth: string;
  baselineMonths: string[];
  /** Set when a trailing partial month was excluded from analysis, so the
   *  report can say so rather than silently dropping data the reader can
   *  see in the date range. */
  partialMonthExcluded: string | null;
  /** Printed verbatim on the report. */
  baselineFormula: string;
}

export interface EngineResult {
  findings: Finding[];
  spendTable: SpendRow[];
  reviewTriggerCount: number;
  window: AuditWindow | null;
  netLedger: number;
  droppedRows: number;
  totalRows: number;
}

/** Exported so components/LedgerCheck.tsx screens for the same columns this
 *  engine actually reads. They had drifted: the screener looked for
 *  work-order fields (opened/closed/workOrderId) and had no entry for
 *  `status` or `date` at all, so it reported "3/7 headers matched" and
 *  "opened not found" on a file this engine parsed completely, aging
 *  analysis included. One map, one truth. */
export const HEADER_ALIASES: Record<string, keyof LedgerRow> = {
  date: "date", "invoice date": "date", "service date": "date",
  vendor: "vendor", "vendor name": "vendor",
  category: "category", "cost category": "category", type: "category",
  amount: "amount", cost: "amount", total: "amount",
  unit: "unit", "unit number": "unit",
  description: "description", notes: "description",
  work_order_id: "workOrderId", "work order id": "workOrderId", "work order #": "workOrderId",
  status: "status",
  opened_date: "openedDate", "opened date": "openedDate", "date opened": "openedDate",
  closed_date: "closedDate", "closed date": "closedDate", "date closed": "closedDate",
};

/** "Opened Date", "opened_date", "Work-Order ID" and "workorderid" must all
 *  resolve identically. The free screener (components/LedgerCheck.tsx) already
 *  matched this loosely while this engine matched exact lowercase strings, so
 *  the screener could say "columns found" about a file the engine then read as
 *  zero rows. One normaliser, used by both. */
export const normHeader = (h: string): string => h.toLowerCase().replace(/[^a-z0-9]/g, "");

const NORM_ALIASES: Record<string, keyof LedgerRow> = Object.fromEntries(
  Object.entries(HEADER_ALIASES).map(([k, v]) => [normHeader(k), v])
);

/**
 * Reads a money cell. Returns NaN for anything it cannot read UNAMBIGUOUSLY,
 * so the row is counted in droppedRows and disclosed, never guessed.
 *
 * Negatives: (85.00), ($85.00), $(85.00), -85, -$85, 85.00-, and the unicode
 * minus/dashes some exports emit. Before this, "$(85.00)", "85.00-" and a
 * unicode minus all silently became +85 -- a credit turning into a charge.
 *
 * Rejected (NaN): letters ("12 CR"), European decimal commas ("1.234,56",
 * "12,50"), Indian grouping, and anything else that is not a plain number.
 */
export function toAmount(v: unknown): number {
  if (typeof v === "number") return Number.isFinite(v) ? v : NaN;
  const raw = String(v ?? "")
    .trim()
    .replace(/[\u2212\u2012\u2013\u2014]/g, "-");
  if (!raw) return NaN;
  const t = raw.replace(/[$\u20AC\u00A3\s]/g, "");
  const neg = t.startsWith("-") || t.endsWith("-") || (t.startsWith("(") && t.endsWith(")"));
  const core = t.replace(/^[-(]+|[-)]+$/g, "");
  if (!/\d/.test(core)) return NaN;
  if (!/^(\d{1,3}(,\d{3})+|\d+)?(\.\d+)?$/.test(core)) return NaN;
  const n = parseFloat(core.replace(/,/g, ""));
  if (!Number.isFinite(n)) return NaN;
  return neg ? -Math.abs(n) : n;
}

function daysIn(y: number, m: number): number {
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
}

/**
 * The calendar date WRITTEN in the cell, as UTC-midnight milliseconds, or null.
 *
 * Date.parse is timezone-dependent for M/D/YYYY and for datetimes: it reads
 * them in local time, then monthKey read the result in UTC, so on a machine
 * east of UTC "10/01/2026" landed in September. This reads the written date
 * and ignores timezone entirely. M/D/YYYY is read US-style; a first part above
 * 12 is rejected (null), not silently flipped to D/M.
 */
export function parseLedgerDate(input: string | null | undefined): number | null {
  const t = String(input ?? "").trim();
  if (!t) return null;
  let y: number, m: number, d: number;
  let hit = /^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})(?:[T\s].*)?$/.exec(t);
  if (hit) {
    y = +hit[1]; m = +hit[2]; d = +hit[3];
  } else if ((hit = /^(\d{1,2})[-/](\d{1,2})[-/](\d{2}|\d{4})(?:[\s,T].*)?$/.exec(t))) {
    m = +hit[1]; d = +hit[2]; y = +hit[3];
    if (hit[3].length === 2) y += 2000;
  } else if (/[a-z]{3}/i.test(t)) {
    const p = Date.parse(t); // "Oct 5, 2026": parsed in local time, so read local parts
    if (Number.isNaN(p)) return null;
    const dt = new Date(p);
    y = dt.getFullYear(); m = dt.getMonth() + 1; d = dt.getDate();
  } else {
    return null;
  }
  if (m < 1 || m > 12 || d < 1 || d > daysIn(y, m)) return null;
  return Date.UTC(y, m - 1, d);
}

/** YYYY-MM, or null if the date doesn't parse. Never guesses a format. */
function monthKey(dateStr: string): string | null {
  const t = parseLedgerDate(dateStr);
  if (t === null) return null;
  const d = new Date(t);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

export function parseCsv(text: string): { rows: LedgerRow[]; droppedRows: number; totalRows: number } {
  const parsed = Papa.parse<Record<string, string>>(text, {
    header: true,
    skipEmptyLines: true,
    transformHeader: (h) => normHeader(h),
  });

  const rows: LedgerRow[] = [];
  let dropped = 0;

  parsed.data.forEach((raw, i) => {
    const row: Partial<LedgerRow> = { sourceRow: i + 2 }; // +2: 1-based, plus header
    for (const [key, value] of Object.entries(raw)) {
      const mapped = NORM_ALIASES[key];
      if (!mapped) continue;
      if (mapped === "amount") {
        const num = toAmount(value);
        if (!Number.isNaN(num)) row.amount = num;
      } else {
        (row as Record<string, unknown>)[mapped] = String(value ?? "").trim();
      }
    }
    if (row.date && row.vendor && row.category && typeof row.amount === "number") {
      rows.push(row as LedgerRow);
    } else {
      dropped++;
    }
  });

  return { rows, droppedRows: dropped, totalRows: parsed.data.length };
}

function money(v: number): string {
  const sign = v < 0 ? "-" : "";
  return `${sign}$${Math.round(Math.abs(v)).toLocaleString()}`;
}

let nextId = 1;
function findingId(): string {
  return `f${nextId++}`;
}

/* -------------------------------------------------------------------------- */
/*  Window + baseline                                                          */
/* -------------------------------------------------------------------------- */

const BASELINE_LOOKBACK = 5;
const MIN_BASELINE_MONTHS = 2;

/** Days in the month containing this date (UTC). */
function daysInMonthOf(d: Date): number {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate();
}

/**
 * The analysis month must be a COMPLETE month.
 *
 * The first version of this used the latest month present in the file, which
 * is wrong for the ordinary case: an export pulled on the 8th contains eight
 * days of that month. Comparing eight days against five full months produced
 * confident, plausible-looking, entirely false findings -- on the first real
 * test file it flagged three categories at +217%, +95% and +56% whose "month
 * totals" were just the open aged items, and showed -100% for every category
 * that simply hadn't been billed yet that month.
 *
 * A month counts as complete only when the file's last date is the final day
 * of that month. Otherwise the trailing month is excluded from the analysis
 * and named in partialMonthExcluded, so the report can say what it dropped
 * rather than leaving the reader to notice the date range doesn't match the
 * month analysed.
 */
function buildWindow(rows: LedgerRow[]): AuditWindow | null {
  const dated = rows
    .map((r) => ({ r, t: parseLedgerDate(r.date), m: monthKey(r.date) }))
    .filter((x): x is { r: LedgerRow; t: number; m: string } => x.t !== null && x.m !== null);
  if (dated.length === 0) return null;

  dated.sort((a, b) => a.t - b.t);
  const months = [...new Set(dated.map((x) => x.m as string))].sort();

  const lastDate = new Date(dated[dated.length - 1].t);
  const trailingIsComplete = lastDate.getUTCDate() === daysInMonthOf(lastDate);

  let analysisIdx = months.length - 1;
  let partialMonthExcluded: string | null = null;

  // Only exclude when there's an earlier month to fall back to. A single
  // partial month is still analysed -- it's all there is -- and every
  // category will report INSUFFICIENT BASELINE anyway.
  if (!trailingIsComplete && months.length > 1) {
    partialMonthExcluded = months[months.length - 1];
    analysisIdx = months.length - 2;
  }

  const latestMonth = months[analysisIdx];
  const baselineMonths = months.slice(Math.max(0, analysisIdx - BASELINE_LOOKBACK), analysisIdx);

  return {
    firstDate: dated[0].r.date,
    lastDate: dated[dated.length - 1].r.date,
    latestMonth,
    baselineMonths,
    partialMonthExcluded,
    baselineFormula: baselineMonths.length
      ? `Arithmetic mean of monthly category spend, ${baselineMonths[0]} through ${baselineMonths[baselineMonths.length - 1]} (${baselineMonths.length} month(s))`
      : "No prior months available in this file",
  };
}

/** Latest month vs mean of prior months, per category. A category with
 *  fewer than MIN_BASELINE_MONTHS of prior data is marked unusable
 *  rather than given a number that looks authoritative. */
function buildSpendTable(rows: LedgerRow[], win: AuditWindow | null): SpendRow[] {
  if (!win) return [];

  const byCatMonth = new Map<string, Map<string, number>>();
  for (const r of rows) {
    const m = monthKey(r.date);
    if (!m) continue;
    if (!byCatMonth.has(r.category)) byCatMonth.set(r.category, new Map());
    const months = byCatMonth.get(r.category)!;
    months.set(m, (months.get(m) ?? 0) + r.amount);
  }

  const table: SpendRow[] = [];
  for (const [category, months] of byCatMonth) {
    const current = months.get(win.latestMonth) ?? 0;
    const priors = win.baselineMonths
      .map((m) => months.get(m))
      .filter((v): v is number => v !== undefined);

    if (priors.length < MIN_BASELINE_MONTHS) {
      table.push({
        category,
        thisPeriod: money(current),
        baseline: "—",
        variancePct: 0,
        baselineUsable: false,
      });
      continue;
    }

    const mean = priors.reduce((a, b) => a + b, 0) / priors.length;
    // A non-positive mean cannot anchor a percentage. Credits, reversals or
    // a coding change can produce one; the old version printed 0% and moved on.
    if (mean <= 0) {
      table.push({
        category,
        thisPeriod: money(current),
        baseline: money(mean),
        variancePct: 0,
        baselineUsable: false,
      });
      continue;
    }

    table.push({
      category,
      thisPeriod: money(current),
      baseline: money(mean),
      variancePct: Math.round(changePct(current, mean) ?? 0),
      baselineUsable: true,
    });
  }

  return table.sort((a, b) => {
    if (a.baselineUsable !== b.baselineUsable) return a.baselineUsable ? -1 : 1;
    return b.variancePct - a.variancePct;
  });
}

/* -------------------------------------------------------------------------- */
/*  Checks                                                                     */
/* -------------------------------------------------------------------------- */

const VARIANCE_TRIGGER_PCT = 25;

/** Category variance worth a look. CALCULATION -- the arithmetic is
 *  reproducible; what caused it is not in this file. Names the largest
 *  single entry, because one capital job can be most of a "spike." */
function checkCategoryVariance(rows: LedgerRow[], table: SpendRow[], win: AuditWindow | null): Finding[] {
  if (!win) return [];
  const findings: Finding[] = [];

  for (const row of table) {
    if (!row.baselineUsable || row.variancePct < VARIANCE_TRIGGER_PCT) continue;

    const inMonth = rows.filter((r) => r.category === row.category && monthKey(r.date) === win.latestMonth);
    const monthTotal = inMonth.reduce((a, b) => a + b.amount, 0);
    const largest = [...inMonth].sort((a, b) => b.amount - a.amount)[0];
    const largestShare = largest ? (sharePct(largest.amount, monthTotal) ?? 0) : 0;

    findings.push({
      id: findingId(),
      category: `${row.category} variance`,
      title: `${row.category} spend in ${win.latestMonth} was ${row.variancePct > 0 ? "+" : ""}${row.variancePct}% against its own baseline`,
      description:
        `${money(monthTotal)} in ${win.latestMonth} versus a baseline mean of ${row.baseline}. ` +
        (largest && largestShare >= 50
          ? `A single ${money(largest.amount)} entry accounts for ${largestShare.toFixed(0)}% of the month's ${row.category.toLowerCase()} spend.`
          : `No single entry dominates the month.`),
      amount: money(monthTotal),
      amountLabel: `${win.latestMonth.toUpperCase()} TOTAL`,
      amountIsCost: true,
      recommendation:
        "Verify invoice scope and coding. Treat the variance as explained only after confirming whether this was one-time work, recurring work, or a miscoded charge.",
      include: true,
      claimType: "CALCULATION",
      sourceRows: inMonth.map((r) => r.sourceRow),
    });
  }
  return findings;
}

/** Vendor concentration. CALCULATION for the share; the dependency
 *  reading is explicitly framed as a signal, not misconduct. */
function checkVendorConcentration(rows: LedgerRow[]): Finding[] {
  const byCategory = new Map<string, Map<string, number>>();
  const rowsFor = new Map<string, LedgerRow[]>();

  for (const r of rows) {
    if (!byCategory.has(r.category)) byCategory.set(r.category, new Map());
    byCategory.get(r.category)!.set(r.vendor, (byCategory.get(r.category)!.get(r.vendor) ?? 0) + r.amount);
    const key = `${r.category}||${r.vendor}`;
    if (!rowsFor.has(key)) rowsFor.set(key, []);
    rowsFor.get(key)!.push(r);
  }

  const findings: Finding[] = [];
  for (const [category, vendors] of byCategory) {
    const total = [...vendors.values()].reduce((a, b) => a + b, 0);
    if (total <= 0) continue;
    const [topVendor, topAmount] = [...vendors.entries()].sort((a, b) => b[1] - a[1])[0];
    const share = ratio(topAmount, total) ?? 0;

    if (share >= 0.6 && vendors.size > 1) {
      findings.push({
        id: findingId(),
        category: "Vendor concentration",
        title: `${topVendor} accounts for ${(share * 100).toFixed(1)}% of ${category} spend`,
        description:
          `${money(topAmount)} of ${money(total)} total ${category.toLowerCase()} spend across ${vendors.size} vendors in this file. ` +
          `Concentration is a dependency signal, not evidence of bad pricing or misconduct.`,
        amount: money(topAmount),
        amountLabel: "CONCENTRATED WITH ONE VENDOR",
        amountIsCost: true,
        recommendation:
          "Compare scope, response time, pricing and backup-vendor capacity before changing procurement.",
        include: true,
        claimType: "CALCULATION",
        sourceRows: (rowsFor.get(`${category}||${topVendor}`) ?? []).map((r) => r.sourceRow),
        visual: { kind: "concentration", sharePct: share * 100, topSpend: topAmount, totalSpend: total },
      });
    }
  }
  return findings;
}

/** Exact duplicate candidates: identical date, vendor, category, amount.
 *  Still only candidates -- this schema carries no invoice or work-order
 *  identifier, so an exact match cannot be confirmed from the ledger. */
function checkExactDuplicates(rows: LedgerRow[]): Finding[] {
  const groups = new Map<string, LedgerRow[]>();
  for (const r of rows) {
    if (r.amount <= 0) continue;
    const key = `${r.date}||${r.vendor}||${r.category}||${r.amount}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(r);
  }

  const dupeGroups = [...groups.values()].filter((g) => g.length > 1);
  if (dupeGroups.length === 0) return [];

  const extraValue = dupeGroups.reduce((sum, g) => sum + g[0].amount * (g.length - 1), 0);
  const allRows = dupeGroups.flat();

  return [{
    id: findingId(),
    category: "Exact duplicate candidates",
    title: `${dupeGroups.length} exact duplicate group(s) found, extra-row face value ${money(extraValue)}`,
    description:
      `Each group shares an identical date, vendor, category and amount. The ledger has no invoice number or work-order ID, ` +
      `so even an exact match is only a candidate until source documents are checked.`,
    amount: money(extraValue),
    amountLabel: "EXTRA-ROW FACE VALUE",
    amountIsCost: true,
    recommendation:
      "Match each group to invoice number, work order, unit/location and proof of service before requesting any credit.",
    include: true,
    claimType: "FACT",
    sourceRows: allRows.map((r) => r.sourceRow),
  }];
}

/** Near-duplicate / split-charge candidates: same vendor and amount on
 *  DIFFERENT dates within a window. Kept separate from exact duplicates
 *  so the two are never added together. */
function checkNearDuplicates(rows: LedgerRow[], windowDays = 7): Finding[] {
  const exactKeys = new Set<string>();
  const seenExact = new Map<string, number>();
  for (const r of rows) {
    const k = `${r.date}||${r.vendor}||${r.category}||${r.amount}`;
    seenExact.set(k, (seenExact.get(k) ?? 0) + 1);
  }
  for (const [k, n] of seenExact) if (n > 1) exactKeys.add(k);

  const pairs: Array<[LedgerRow, LedgerRow]> = [];
  const used = new Set<number>();

  const sorted = [...rows]
    .filter((r) => r.amount > 0 && parseLedgerDate(r.date) !== null)
    .sort((a, b) => (parseLedgerDate(a.date) as number) - (parseLedgerDate(b.date) as number));

  for (let i = 0; i < sorted.length; i++) {
    if (used.has(sorted[i].sourceRow)) continue;
    for (let j = i + 1; j < sorted.length; j++) {
      if (used.has(sorted[j].sourceRow)) continue;
      const a = sorted[i];
      const b = sorted[j];
      if (a.date === b.date) continue; // that's an exact-duplicate case
      const gap = Math.abs((parseLedgerDate(b.date) as number) - (parseLedgerDate(a.date) as number)) / 86_400_000;
      if (gap > windowDays) break; // sorted, so nothing further can be closer
      if (a.vendor === b.vendor && a.amount === b.amount) {
        const k = `${a.date}||${a.vendor}||${a.category}||${a.amount}`;
        if (exactKeys.has(k)) continue;
        pairs.push([a, b]);
        used.add(a.sourceRow);
        used.add(b.sourceRow);
        break;
      }
    }
  }

  if (pairs.length === 0) return [];
  const faceValue = pairs.reduce((sum, [a]) => sum + a.amount, 0);

  return [{
    id: findingId(),
    category: "Near-duplicate candidates",
    title: `${pairs.length} same-vendor, same-amount charge pair(s) within ${windowDays} days on different dates`,
    description:
      pairs
        .slice(0, 3)
        .map(([a, b]) => `${a.vendor}: ${money(a.amount)} on ${a.date} and ${b.date}`)
        .join("; ") +
      (pairs.length > 3 ? `; and ${pairs.length - 3} more.` : ".") +
      ` Same amount on nearby dates is not enough to call this duplicate billing -- split invoices, staged work and recurring service all look identical here.`,
    amount: money(faceValue),
    amountLabel: "FACE VALUE OF ONE SIDE",
    amountIsCost: true,
    recommendation:
      "Compare invoice and job identifiers. Keep this separate from exact-duplicate counts unless the supporting documents match.",
    include: true,
    claimType: "INFERENCE",
    sourceRows: pairs.flatMap(([a, b]) => [a.sourceRow, b.sourceRow]),
  }];
}

/** Credits and reversals -- a FACT, and the reason several baselines
 *  may be unusable. Surfacing it explains those rows rather than
 *  leaving a silent gap in the spend table. */
function checkCredits(rows: LedgerRow[]): Finding[] {
  const credits = rows.filter((r) => r.amount < 0);
  if (credits.length === 0) return [];
  const total = credits.reduce((a, b) => a + b.amount, 0);
  const byCategory = new Map<string, number>();
  for (const c of credits) byCategory.set(c.category, (byCategory.get(c.category) ?? 0) + c.amount);

  return [{
    id: findingId(),
    category: "Credits and reversals",
    title: `${credits.length} credit/reversal line(s) totalling ${money(total)}`,
    description:
      `Spread across ${byCategory.size} categor${byCategory.size === 1 ? "y" : "ies"}. ` +
      `Credits offset spend in the same category, which can make a monthly baseline non-positive and its variance unreportable.`,
    amount: money(total),
    amountLabel: "NET CREDIT",
    amountIsCost: false,
    recommendation:
      "Confirm each credit is matched to the original charge, and that the offset landed in the period you expect.",
    include: true,
    claimType: "FACT",
    sourceRows: credits.map((r) => r.sourceRow),
  }];
}

/** Open-item aging. Requires status + openedDate; skipped, not
 *  estimated, without them. Only claims concentration when one
 *  category actually holds a majority. */
function checkAging(rows: LedgerRow[], asOf: number, thresholdDays = 30): Finding[] {
  const openRows = rows.filter((r) => r.status?.toLowerCase() === "open" && r.openedDate);
  if (openRows.length === 0) return [];

  // Age is measured to an explicit as-of date, printed in the finding, so the
  // same file gives the same answer in a test and the report says what "older
  // than 30 days" was measured against.
  const asOfDay = new Date(asOf).toISOString().slice(0, 10);
  const ageOf = (r: LedgerRow) => {
    const opened = parseLedgerDate(r.openedDate);
    return opened === null ? NaN : (Date.parse(asOfDay) - opened) / 86_400_000;
  };

  const aged = openRows.filter((r) => {
    const a = ageOf(r);
    return !Number.isNaN(a) && a > thresholdDays;
  });
  if (aged.length === 0) return [];

  const agedTotal = aged.reduce((a, b) => a + b.amount, 0);
  const over90 = aged.filter((r) => ageOf(r) > 90);
  const over90Total = over90.reduce((a, b) => a + b.amount, 0);

  const byCategory = new Map<string, number>();
  for (const r of aged) byCategory.set(r.category, (byCategory.get(r.category) ?? 0) + 1);
  const [topCategory, topCount] = [...byCategory.entries()].sort((a, b) => b[1] - a[1])[0];

  // Only assert concentration when one category actually holds a majority.
  // The old version said `mostly ${topCategory}` unconditionally, which was
  // false whenever items spread evenly -- 7 items across 7 categories made
  // a count of 1 into "mostly."
  const isConcentrated = topCount > aged.length / 2;
  const spread = isConcentrated
    ? `${topCount} of ${aged.length} are in ${topCategory}.`
    : `They span ${byCategory.size} different categories, so this file does not support a claim that aging is concentrated in any one of them.`;

  return [{
    id: findingId(),
    category: "Open-item aging",
    title: `${aged.length} open item(s) older than ${thresholdDays} days, totalling ${money(agedTotal)}`,
    description:
      `${over90.length} are older than 90 days, totalling ${money(over90Total)}. ${spread} Age is measured to ${asOfDay}.`,
    amount: money(agedTotal),
    amountLabel: `OPEN >${thresholdDays} DAYS`,
    amountIsCost: true,
    recommendation:
      "Confirm what 'open' means in the source system -- unpaid, unresolved, awaiting approval or uncleared -- before assigning an operational cause.",
    include: true,
    claimType: "FACT",
    sourceRows: aged.map((r) => r.sourceRow),
    visual: { kind: "aging", totalOpen: openRows.length, agedCount: aged.length },
  }];
}

/* -------------------------------------------------------------------------- */

export function runEngine(
  rows: LedgerRow[],
  opts: { asOf?: number } = {}
): Omit<EngineResult, "droppedRows" | "totalRows"> {
  const asOf = opts.asOf ?? Date.now();
  nextId = 1;
  const win = buildWindow(rows);
  const spendTable = buildSpendTable(rows, win);

  const findings = [
    ...checkCategoryVariance(rows, spendTable, win),
    ...checkVendorConcentration(rows),
    ...checkExactDuplicates(rows),
    ...checkNearDuplicates(rows),
    ...checkCredits(rows),
    ...checkAging(rows, asOf),
  ];

  return {
    findings,
    spendTable,
    // Count of things worth a human look. NOT a dollar total, and not
    // described as recoverable or annual -- neither follows from the file.
    reviewTriggerCount: findings.filter((f) => f.include).length,
    window: win,
    netLedger: rows.reduce((a, b) => a + b.amount, 0),
  };
}
