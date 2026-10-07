/**
 * lib/diagnosticCalculators.ts
 * ----------------------------------------------------------------
 * The single registry of diagnostic calculators. Seven are rendered by
 * app/tools/[slug]; Vacancy Black Hole is date-driven and keeps its own
 * page, so its entry carries `externalHref` instead of numeric inputs.
 * Its math lives in lib/calcMath.ts (computeVacancy) like everything else.
 *
 * Same principle as lib/auditEngine.ts: every calculate() function
 * here is plain arithmetic on what the visitor typed, nothing
 * inferred, nothing transmitted anywhere -- matches the "Nothing
 * transmits" trust line already on the free vacancy diagnostic.
 *
 * No "use client" here on purpose -- this is plain data + pure
 * functions, importable from both the server page (for
 * generateStaticParams) and the client component (for the actual
 * calculation), with nothing that needs to cross that boundary as a
 * function reference.
 */

import { LINKS } from "./products";
import { sharePct, changePct, missedCycles, THRESHOLDS, pctFmt, moneyFmt } from "./calcMath";

export interface CalcInput {
  key: string;
  label: string;
  prefix?: string; // e.g. "$"
  suffix?: string; // e.g. "days"
  defaultValue?: number;
}

export interface CalcResult {
  headline: string;
  /** true = pink (costs money / bad), false = mint (healthy) -- same
   *  convention as Finding.amountIsCost in lib/auditEngine.ts. */
  headlineIsCost: boolean;
  detail: string;
  /** Impossible input (e.g. more aged than open). The UI shows this instead of
   *  any number or visual, and nothing is handed to the audit link. */
  error?: string;
  /** Input is possible but the result would not mean anything (e.g. a $3
   *  baseline). Shown instead of the percentage. */
  note?: string;
}

export interface DiagnosticCalculator {
  slug: string;
  name: string;
  line: string;
  inputs: CalcInput[];
  calculate: (v: Record<string, number>) => CalcResult;
  /** Maps the typed values to the props of this slug's visual. The slug ->
   *  component map lives in components/calculatorVisuals.ts so this file
   *  stays free of React. */
  visualProps: (v: Record<string, number>) => Record<string, number>;
  /** Set for calculators that have their own page (vacancy). These are
   *  excluded from app/tools/[slug] and linked to this href instead. */
  externalHref?: string;
  /** Pulled from lib/products.ts, never hardcoded, so a price/slug
   *  change there is never something this file can drift out of sync
   *  with. Falls back to the full audit when no narrower product
   *  matches the widget's theme yet -- see the note in each entry. */
  ctaHref: string;
  ctaLabel: string;
}

const NO_NUMBER = { headline: "—", headlineIsCost: false } as const;

function impossible(message: string): CalcResult {
  return { ...NO_NUMBER, detail: message, error: message };
}

export const DIAGNOSTIC_CALCULATORS: DiagnosticCalculator[] = [
  {
    slug: "vacancy-black-hole",
    name: "Vacancy Black Hole",
    line: "The unit wasn't waiting for a tenant. It was waiting for operations.",
    ctaHref: LINKS.audit,
    ctaLabel: "Find my make-ready bottleneck",
    // Date-driven: move-out / rent-ready / lease-signed, not numbers. The page
    // at externalHref computes with computeVacancy() from lib/calcMath.ts.
    externalHref: "/tools/vacancy-calculator",
    inputs: [],
    visualProps: () => ({}),
    calculate: () => ({
      headline: "—",
      headlineIsCost: false,
      detail: "Open the vacancy calculator to enter move-out, rent-ready and lease-signed dates.",
    }),
  },
  {
    slug: "callback-nightmare",
    name: "Callback Nightmare",
    line: "The work order was closed. The problem wasn't.",
    ctaHref: LINKS.audit,
    ctaLabel: "Get the full audit →",
    inputs: [
      { key: "closed", label: "Work orders closed this period" },
      { key: "reopened", label: "Of those, reopened within 30 days" },
    ],
    visualProps: (v) => ({ totalWorkOrders: v.closed ?? 0, reopenedWithin30: v.reopened ?? 0 }),
    calculate: (v) => {
      if (!v.closed) return { headline: "—", headlineIsCost: false, detail: "Enter your closed work order count to see your callback rate." };
      if (v.reopened > v.closed) return impossible("Reopened work orders can't be more than the number closed.");
      const rate = sharePct(v.reopened, v.closed) ?? 0;
      return {
        headline: pctFmt(rate) === "+0%" ? "0%" : pctFmt(rate),
        headlineIsCost: rate > THRESHOLDS.callbackRatePct,
        detail: `${v.reopened} of ${v.closed} closed work orders came back within 30 days. Above roughly 5%, a callback rate usually points to a specific vendor or category, not random bad luck.`,
      };
    },
  },
  {
    slug: "vendor-money-pit",
    name: "Vendor Money Pit",
    line: "One vendor holds 71% of spend, and nobody has benchmarked them.",
    ctaHref: LINKS.vendorKit,
    ctaLabel: "Get the Vendor Ledger & NOI Audit Kit →",
    inputs: [
      { key: "total", label: "Total category spend", prefix: "$" },
      { key: "topVendor", label: "Spend with your top vendor in that category", prefix: "$" },
    ],
    visualProps: (v) => ({ totalSpend: v.total ?? 0, topVendorSpend: v.topVendor ?? 0 }),
    calculate: (v) => {
      if (!v.total) return { headline: "—", headlineIsCost: false, detail: "Enter total category spend to see vendor concentration." };
      if (v.topVendor > v.total) return impossible("Your top vendor's spend can't be more than the category total.");
      const share = sharePct(v.topVendor, v.total) ?? 0;
      return {
        headline: `${share.toFixed(0)}%`,
        headlineIsCost: share >= THRESHOLDS.vendorConcentrationPct,
        detail: `Your top vendor holds ${share.toFixed(0)}% of this category. Concentration by itself isn't a problem -- concentration nobody's gotten a comparison quote against usually is.`,
      };
    },
  },
  {
    slug: "deadline-graveyard",
    name: "Deadline Graveyard",
    line: "Nothing looked like an emergency until everything became one.",
    ctaHref: LINKS.audit,
    ctaLabel: "Get the full audit →",
    inputs: [
      { key: "open", label: "Total open work orders right now" },
      { key: "aged", label: "How many have been open past 30 days" },
    ],
    visualProps: (v) => ({ totalOpen: v.open ?? 0, agedPast30: v.aged ?? 0 }),
    calculate: (v) => {
      if (!v.open) return { headline: "—", headlineIsCost: false, detail: "Enter your open work order count to see the aging share." };
      if (v.aged > v.open) return impossible("Work orders past 30 days can't be more than the total open.");
      const rate = sharePct(v.aged, v.open) ?? 0;
      return {
        headline: `${rate.toFixed(0)}%`,
        headlineIsCost: rate > THRESHOLDS.agedShareOfOpenPct,
        detail: `${v.aged} of ${v.open} open work orders are past 30 days. Each one individually still looks minor -- that's exactly how a graveyard fills up.`,
      };
    },
  },
  {
    slug: "automation-graveyard",
    name: "Automation Graveyard",
    line: "It didn't crash. It just quietly stopped.",
    ctaHref: LINKS.automationKit,
    ctaLabel: "Get the Property Operations Automation Kit →",
    inputs: [
      { key: "frequency", label: "How often it's supposed to run (days)", suffix: "days" },
      { key: "daysSince", label: "Days since you last actually confirmed it ran", suffix: "days" },
    ],
    visualProps: (v) => ({ frequency: v.frequency ?? 0, daysSince: v.daysSince ?? 0 }),
    calculate: (v) => {
      if (!v.frequency) return { headline: "—", headlineIsCost: false, detail: "Enter the expected run frequency to see how many cycles were missed." };
      const missed = missedCycles(v.frequency, v.daysSince) ?? 0;
      return {
        headline: `${missed}`,
        headlineIsCost: missed > 0,
        detail: missed > 0
          ? `At a ${v.frequency}-day expected cadence, ${missed} run(s) likely never happened -- auto-late-fees, a maintenance routing rule, a smart-thermostat shutoff on a vacant unit. Most of these fail silently, and a dashboard that still says "active" won't tell you otherwise.`
          : "Within expected cadence based on what you entered.",
      };
    },
  },
  {
    slug: "asset-health-nightmare",
    name: "Asset Health Nightmare",
    line: "A property rarely becomes expensive overnight.",
    ctaHref: LINKS.audit,
    ctaLabel: "Get the full audit →",
    inputs: [
      { key: "past", label: "Maintenance spend, 12 months ago", prefix: "$" },
      { key: "current", label: "Maintenance spend, this month", prefix: "$" },
    ],
    visualProps: (v) => ({ spendLastYear: v.past ?? 0, spendThisMonth: v.current ?? 0 }),
    calculate: (v) => {
      if (!v.past) return { headline: "—", headlineIsCost: false, detail: "Enter last year's spend to see the trend." };
      const change = changePct(v.current, v.past) ?? 0;
      return {
        headline: pctFmt(change),
        headlineIsCost: change > 0,
        detail: `Maintenance spend has moved ${pctFmt(change)} over the past year. A property rarely jumps categories all at once -- this is what the drift looks like before that happens.`,
      };
    },
  },
  {
    slug: "utility-energy-bleed",
    name: "Utility Energy Bleed",
    line: "The utility bill arrived. Nobody investigated the variance.",
    ctaHref: LINKS.audit,
    ctaLabel: "Get the full audit →",
    inputs: [
      { key: "current", label: "This month's utility bill", prefix: "$" },
      { key: "baseline", label: "Trailing 12-month average bill", prefix: "$" },
    ],
    visualProps: (v) => ({ thisMonthBill: v.current ?? 0, trailingAverage: v.baseline ?? 0 }),
    calculate: (v) => {
      if (!v.baseline) return { headline: "—", headlineIsCost: false, detail: "Enter your trailing average to see the variance." };
      const delta = v.current - v.baseline;
      const pct = changePct(v.current, v.baseline) ?? 0;
      return {
        headline: moneyFmt(delta),
        headlineIsCost: delta > 0,
        detail: `That's ${pctFmt(pct)} against your own trailing average -- not an industry number, this property's actual baseline.`,
      };
    },
  },
  {
    slug: "operations-chaos-index",
    name: "Operations Chaos Index",
    line: "Your problem isn't one bad work order. It's the accumulation.",
    ctaHref: LINKS.audit,
    ctaLabel: "Get the full audit →",
    inputs: [
      { key: "count", label: "Separate small issues logged this quarter" },
      { key: "avgCost", label: "Average cost per issue", prefix: "$", defaultValue: 150 },
    ],
    visualProps: (v) => ({ issueCount: v.count ?? 0, avgCostPerIssue: v.avgCost || 150 }),
    calculate: (v) => {
      const total = v.count * (v.avgCost || 150);
      return {
        headline: moneyFmt(total),
        headlineIsCost: total > 0,
        detail: `${v.count} issues that each individually looked too small to flag, at roughly ${moneyFmt(v.avgCost || 150)} apiece. None of them were the problem. All of them together are.`,
      };
    },
  },
];

/** The one entry point the UI uses: rejects negative input, then calculates. */
export function calculateChecked(c: DiagnosticCalculator, v: Record<string, number>): CalcResult {
  if (c.inputs.some((i) => (v[i.key] ?? 0) < 0)) return impossible("Enter 0 or more in every field.");
  return c.calculate(v);
}

/** Calculators rendered by app/tools/[slug] (everything without its own page). */
export function renderableCalculators(): DiagnosticCalculator[] {
  return DIAGNOSTIC_CALCULATORS.filter((c) => !c.externalHref);
}

export function calculatorHref(c: DiagnosticCalculator): string {
  return c.externalHref ?? `/tools/${c.slug}`;
}

export function getCalculator(slug: string): DiagnosticCalculator | undefined {
  return DIAGNOSTIC_CALCULATORS.find((c) => c.slug === slug);
}
