import type { DealInputs, Tri } from "./engine";

const TODAY = "2026-09-29";
const A = (low: number, mode: number, high: number, unit: string, source: string, provenance: Tri["provenance"] = "assumed", confidence: Tri["confidence"] = "low"): Tri =>
  ({ low, mode, high, unit, source, date: TODAY, provenance, confidence });

/** Same illustrative Kern County 12-unit deal as aim_b5r_example.py. Every number is ASSUMED. */
export const EXAMPLE_DEAL: DealInputs = {
  dealId: "EXAMPLE-KERN-12U-001",
  units: 12,
  purchasePrice: 950_000,
  buyClosingCosts: 19_000,
  acquisitionLoanAmount: 712_500,
  acquisitionLoanRate: 0.105,
  refiAmortizationYears: 30,
  refiClosingCostsPct: 0.02,
  notes: "Illustrative only. Not a real property.",
  rehabCost: A(180_000, 240_000, 340_000, "USD", "ASSUMED - no contractor bid yet"),
  rehabDurationMonths: A(5, 8, 13, "months", "ASSUMED - no GC schedule yet"),
  grossPotentialRentMonthly: A(13_200, 15_600, 17_400, "USD/month, all units at stabilized market rent", "ASSUMED - no rent comp pull yet"),
  vacancyCreditLossPct: A(0.05, 0.07, 0.12, "fraction", "ASSUMED - Kern County multifamily rule-of-thumb"),
  otherIncomeMonthly: A(200, 350, 550, "USD/month", "ASSUMED - laundry/parking placeholder"),
  opexAnnualExCapex: A(48_000, 58_000, 72_000, "USD/year", "ASSUMED - no T-12 yet"),
  propertyTaxAnnual: A(11_400, 11_875, 12_400, "USD/year", "ASSUMED - 1.25% of purchase price", "modeled", "med"),
  insuranceAnnual: A(9_000, 11_500, 15_000, "USD/year", "ASSUMED - no quote yet"),
  exitCapRate: A(0.058, 0.065, 0.075, "fraction", "ASSUMED - no recent comp set yet"),
  refiRate: A(0.065, 0.072, 0.082, "fraction", "ASSUMED - no lender term sheet yet"),
  holdingCostMonthly: A(6_500, 7_800, 9_500, "USD/month", "ASSUMED - interest-only debt service + carry during rehab", "modeled"),
};
