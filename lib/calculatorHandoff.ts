/**
 * lib/calculatorHandoff.ts
 * ----------------------------------------------------------------
 * Carries "which calculator sent this person, and what number they saw"
 * from a calculator page -> /audit -> Tally hidden fields -> webhook ->
 * audit_intakes.calculator_snapshot -> admin.
 *
 * Every hop is user-controllable (query string, Tally hidden field), so
 * both ends run values through sanitizeHandoff(): the slug must be a real
 * registry slug and the headline must be a short, plain display string.
 * Anything else becomes null -- unknown, not a guess.
 */

import { AUDIT } from "./products";
import { getCalculator } from "./diagnosticCalculators";

export interface CalculatorHandoff {
  slug: string | null;
  headline: string | null;
}

const HEADLINE_MAX = 40;
// Digits, letters, space and the punctuation the calculators actually emit
// ($ % + - , . and the em dash). Everything else is dropped.
const HEADLINE_ALLOWED = /[^0-9A-Za-z $%+\-,.—]/g;

export function sanitizeHandoff(slug: unknown, headline: unknown): CalculatorHandoff {
  const s = typeof slug === "string" ? slug.trim() : "";
  const validSlug = s && getCalculator(s) ? s : null;
  let h: string | null = null;
  if (typeof headline === "string") {
    const cleaned = headline.replace(HEADLINE_ALLOWED, "").replace(/\s+/g, " ").trim().slice(0, HEADLINE_MAX);
    // A headline is a number the visitor saw. "—" (no result) or any text with
    // no digit is "unknown", so it is dropped rather than handed to the audit.
    h = /\d/.test(cleaned) ? cleaned : null;
  }
  // A headline with no valid source calculator has no meaning; drop it.
  return validSlug ? { slug: validSlug, headline: h } : { slug: null, headline: null };
}

/** URL for the calculator's CTA into the audit intake. */
export function buildAuditHref(
  slug: string,
  headline: string,
  extra: Record<string, string | number> = {},
  base: string = AUDIT,
): string {
  const clean = sanitizeHandoff(slug, headline);
  const q = new URLSearchParams();
  if (clean.slug) q.set("calculator_slug", clean.slug);
  if (clean.headline) q.set("calculator_headline", clean.headline);
  for (const [k, v] of Object.entries(extra)) q.set(k, String(v));
  const qs = q.toString();
  return qs ? `${base}?${qs}` : base;
}

/** Read the handoff from /audit's query string. */
export function parseHandoff(q: URLSearchParams): CalculatorHandoff {
  return sanitizeHandoff(q.get("calculator_slug"), q.get("calculator_headline"));
}
