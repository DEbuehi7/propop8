/**
 * lib/diagnosticCalculators.ts
 * ----------------------------------------------------------------
 * Config + math for the 7 non-vacancy diagnostic widgets. Vacancy
 * Black Hole isn't here -- that one already has a real calculator at
 * /tools/vacancy-calculator, this covers the rest of the DIAGNOSTICS
 * array that currently just links there regardless of topic.
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
}

export interface DiagnosticCalculator {
  slug: string;
  name: string;
  line: string;
  inputs: CalcInput[];
  calculate: (v: Record<string, number>) => CalcResult;
  /** Pulled from lib/products.ts, never hardcoded, so a price/slug
   *  change there is never something this file can drift out of sync
   *  with. Falls back to the full audit when no narrower product
   *  matches the widget's theme yet -- see the note in each entry. */
  ctaHref: string;
  ctaLabel: string;
}

function pctFmt(n: number): string {
  return `${n >= 0 ? "+" : ""}${n.toFixed(0)}%`;
}
function moneyFmt(n: number): string {
  const sign = n < 0 ? "-" : "";
  return `${sign}$${Math.round(Math.abs(n)).toLocaleString()}`;
}

export const DIAGNOSTIC_CALCULATORS: DiagnosticCalculator[] = [
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
    calculate: (v) => {
      if (!v.closed) return { headline: "—", headlineIsCost: false, detail: "Enter your closed work order count to see your callback rate." };
      const rate = (v.reopened / v.closed) * 100;
      return {
        headline: pctFmt(rate) === "+0%" ? "0%" : pctFmt(rate),
        headlineIsCost: rate > 5,
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
    calculate: (v) => {
      if (!v.total) return { headline: "—", headlineIsCost: false, detail: "Enter total category spend to see vendor concentration." };
      const share = (v.topVendor / v.total) * 100;
      return {
        headline: `${share.toFixed(0)}%`,
        headlineIsCost: share >= 50,
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
    calculate: (v) => {
      if (!v.open) return { headline: "—", headlineIsCost: false, detail: "Enter your open work order count to see the aging share." };
      const rate = (v.aged / v.open) * 100;
      return {
        headline: `${rate.toFixed(0)}%`,
        headlineIsCost: rate > 15,
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
    calculate: (v) => {
      if (!v.frequency) return { headline: "—", headlineIsCost: false, detail: "Enter the expected run frequency to see how many cycles were missed." };
      const missed = Math.max(0, Math.floor(v.daysSince / v.frequency) - 1);
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
    calculate: (v) => {
      if (!v.past) return { headline: "—", headlineIsCost: false, detail: "Enter last year's spend to see the trend." };
      const change = ((v.current - v.past) / v.past) * 100;
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
    calculate: (v) => {
      if (!v.baseline) return { headline: "—", headlineIsCost: false, detail: "Enter your trailing average to see the variance." };
      const delta = v.current - v.baseline;
      const pct = (delta / v.baseline) * 100;
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

export function getCalculator(slug: string): DiagnosticCalculator | undefined {
  return DIAGNOSTIC_CALCULATORS.find((c) => c.slug === slug);
}
