/**
 * lib/brand/markState.ts
 * ----------------------------------------------------------------------------
 * The living 8: what the "8" in the PropOps8 wordmark shows. Pure; no React.
 *
 * The 8 changes only when a visitor's own calculator result says so. It never
 * moves on a timer and never lights up from a calculator's sample values
 * (canon GOV-01: visuals render state, they never create it). The calculation
 * stays in lib/diagnosticCalculators.ts and lib/calcMath.ts; this file only
 * reads the result those already produced (GOV-14).
 *
 *   idle       the plain wordmark 8: no result yet, or the last input was impossible
 *   cost       pink, lower bowl filled: the result costs money ("Leak found")
 *   healthy    mint, clean outline: the result is within range ("Healthy")
 *   uncertain  grey, dashed outline: the numbers can't support a result
 *
 * Each state changes the 8's structure as well as its colour, and always has
 * words and an icon beside it (canon VIS-02, EDO-09). Colours are the site's
 * own meanings from lib/chaosTokens.ts, the same ones the result was drawn in.
 */

import { PALETTE } from "../chaosTokens";
import { moneyFmt } from "../calcMath";
import { getCalculator } from "../diagnosticCalculators";
import { parseHandoff, sanitizeHandoff } from "../calculatorHandoff";

export type MarkKind = "idle" | "cost" | "healthy" | "uncertain";

export interface MarkState {
  kind: MarkKind;
  /** The figure shown beside the 8, as the calculator printed it. */
  figure?: string;
  /** Registry slug of the calculator that produced it. */
  source?: string;
}

export const IDLE: MarkState = { kind: "idle" };

/** The vacancy calculator has its own page; its results arrive under this slug. */
export const VACANCY_SLUG = "vacancy-black-hole";

/** Query parameter that carries cost or healthy to /audit beside the handoff. */
export const RESULT_PARAM = "calculator_result";

/** The audit handoff keeps headlines to 40 characters; a figure longer than that is not shown. */
const FIGURE_MAX = 40;

export interface MarkLook {
  /** Stroke and fill colour of the 8, and the colour of the status words. */
  color: string;
  /** The status words shown beside the 8. Empty when idle. */
  label: string;
  /** Dashed reads as "not enough to tell". */
  stroke: "solid" | "dashed";
  /** The lower bowl fills when the result costs money. */
  fillLower: boolean;
  icon: "drop" | "check" | "dots" | null;
}

/** Semantic state tokens for the mark (canon P8O-03's "semantic state tokens"). */
export const MARK_LOOK: Record<MarkKind, MarkLook> = {
  idle: { color: PALETTE.bright, label: "", stroke: "solid", fillLower: false, icon: null },
  cost: { color: PALETTE.pink, label: "Leak found", stroke: "solid", fillLower: true, icon: "drop" },
  healthy: { color: PALETTE.mint, label: "Healthy", stroke: "solid", fillLower: false, icon: "check" },
  uncertain: { color: PALETTE.label, label: "Not enough data", stroke: "dashed", fillLower: false, icon: "dots" },
};

const validSlug = (slug: string): string | null => (getCalculator(slug) ? slug : null);

/**
 * A diagnostic calculator's result (calculateChecked) as a mark.
 * Impossible input says nothing about the property, so it returns the plain 8;
 * the calculator page already says what is wrong.
 */
export function markFromResult(
  slug: string,
  r: { headline: string; headlineIsCost: boolean; error?: string; note?: string },
): MarkState {
  const source = validSlug(slug);
  if (!source || r.error) return IDLE;
  if (r.note) return { kind: "uncertain", source };
  const { headline } = sanitizeHandoff(source, r.headline);
  if (!headline) return IDLE;
  return { kind: r.headlineIsCost ? "cost" : "healthy", figure: headline, source };
}

/**
 * The vacancy calculator's result (computeVacancy) as a mark. Make-ready days
 * are the recoverable part, so any make-ready rent is a leak, shown in dollars;
 * no make-ready rent is healthy.
 */
export function markFromVacancy(
  m: { operationalExposure: number } | null,
): MarkState {
  if (!m || !Number.isFinite(m.operationalExposure) || m.operationalExposure < 0) return IDLE;
  return {
    kind: m.operationalExposure > 0 ? "cost" : "healthy",
    figure: moneyFmt(m.operationalExposure),
    source: VACANCY_SLUG,
  };
}

/** The extra query the audit link carries so /audit can redraw the same mark. */
export function markQuery(m: MarkState): Record<string, string> {
  return m.kind === "cost" || m.kind === "healthy" ? { [RESULT_PARAM]: m.kind } : {};
}

/**
 * The mark carried to /audit in its query string. Every value there can be
 * typed by anyone, so it goes through the same checks as the audit handoff:
 * a registry slug, a short headline with a digit, and exactly "cost" or
 * "healthy". Anything else is the plain 8: unknown, not a guess.
 * When the handoff carries a dollar exposure (the vacancy calculator), the
 * mark shows dollars, as it did on the calculator's page.
 */
export function markFromHandoff(q: URLSearchParams): MarkState {
  const { slug, headline } = parseHandoff(q);
  const kind = q.get(RESULT_PARAM);
  if (!slug || !headline || (kind !== "cost" && kind !== "healthy")) return IDLE;
  const raw = q.get("exposure");
  const exposure = raw === null || raw.trim() === "" ? NaN : Number(raw);
  // A figure too long to show whole is never cut short; the headline stands instead.
  const formatted = Number.isFinite(exposure) && exposure >= 0 ? moneyFmt(exposure) : null;
  const dollars = formatted && formatted.length <= FIGURE_MAX ? sanitizeHandoff(slug, formatted).headline : null;
  return { kind, figure: dollars ?? headline, source: slug };
}

export function sameMark(a: MarkState, b: MarkState): boolean {
  return a.kind === b.kind && a.figure === b.figure && a.source === b.source;
}

/** The visible words: "Leak found" and "$1,890", or nothing when idle. */
export function markWords(m: MarkState): { label: string; figure: string } {
  return { label: MARK_LOOK[m.kind].label, figure: m.kind === "cost" || m.kind === "healthy" ? m.figure ?? "" : "" };
}

/**
 * The full sentence for screen readers and the tooltip. It says whose numbers
 * these are, so a visitor's own figure is never read as a verified finding
 * (canon GOV-17).
 */
export function markSentence(m: MarkState): string {
  const name = (m.source && getCalculator(m.source)?.name) || "a calculator";
  switch (m.kind) {
    case "cost":
      return `Leak found: ${m.figure}, from the numbers you entered in ${name}. Not a verified finding.`;
    case "healthy":
      return `Healthy: ${m.figure}, from the numbers you entered in ${name}. Not a verified finding.`;
    case "uncertain":
      return `Not enough data: the numbers you entered in ${name} can't support a result.`;
    default:
      return "";
  }
}
