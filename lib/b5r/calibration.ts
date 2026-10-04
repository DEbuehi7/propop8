import type { SimResult, Pct } from "./engine";

/** Metrics a user can log an actual against, and where to find the prediction in a SimResult. */
export const CALIBRATION_METRICS = {
  stabilizedNoi: "Stabilized NOI ($/yr)",
  allInBasis: "All-in basis ($)",
  cashRequired: "Cash required ($)",
  arv: "ARV ($)",
  cashLeftIn: "Cash left in after refi ($)",
  yoc: "Yield on cost (fraction)",
  durationOfExposureMonths: "Months of exposure",
} as const satisfies Record<string, string>;
export type CalibrationMetric = keyof typeof CALIBRATION_METRICS;

export const isCalibrationMetric = (m: unknown): m is CalibrationMetric => typeof m === "string" && m in CALIBRATION_METRICS;
export const predictedFor = (r: SimResult, m: CalibrationMetric): Pct => r[m];

/** (actual − P50) / P50. Null when P50 is zero (no meaningful ratio). */
export const errorPctOfP50 = (p: Pct, actual: number): number | null => (p.p50 ? (actual - p.p50) / Math.abs(p.p50) : null);

export interface CalibrationStats { n: number; meanErrorPct: number; stdErrorPct: number; withinP10P90: number; recommendation: string }

/** Mirrors calibration_error_stats() in the Python engine (population std, 0.15 threshold). */
export function calibrationStats(rows: { error_pct_of_p50: number | null; predicted_p10: number; predicted_p90: number; actual: number }[]): CalibrationStats | null {
  const errs = rows.map((r) => r.error_pct_of_p50).filter((e): e is number => e !== null && Number.isFinite(e));
  if (!errs.length) return null;
  const mean = errs.reduce((a, b) => a + b, 0) / errs.length;
  const std = Math.sqrt(errs.reduce((a, b) => a + (b - mean) ** 2, 0) / errs.length);
  const inside = rows.filter((r) => r.actual >= Math.min(r.predicted_p10, r.predicted_p90) && r.actual <= Math.max(r.predicted_p10, r.predicted_p90)).length / rows.length;
  return { n: errs.length, meanErrorPct: mean, stdErrorPct: std, withinP10P90: inside, recommendation: std > 0.15 ? "widen range" : "range looks calibrated" };
}
