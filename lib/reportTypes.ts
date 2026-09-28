import type { Finding, SpendRow, AuditWindow } from "./auditEngine";

/**
 * lib/reportTypes.ts
 * ----------------------------------------------------------------
 * The one shape the review UI and the PDF renderer agree on.
 *
 * CHANGED WITH THE ENGINE REBUILD:
 *
 *   recoveryTotal / recoveryLabel  ->  triggerCount / triggerLabel / triggerNote
 *     "Identified annual recovery opportunity" asserted two things the
 *     ledger cannot support: that the dollars are recoverable, and that
 *     the period is annual. A count of review triggers asserts only what
 *     was actually counted.
 *
 *   auditPeriod  ->  window (derived, not typed)
 *     A hand-typed period can contradict the file it describes. The
 *     window now comes from buildWindow() in the engine, so the dates on
 *     the report and the dates in the data cannot disagree.
 *
 *   ADDED: netLedger, rowsReviewed
 *     Provenance. A reader should be able to see the size of the file the
 *     findings came out of without asking.
 */
export interface AuditReport {
  propertyName: string;
  clientName: string;
  reportDate: string;

  /** Count of included findings. Never a dollar figure. */
  triggerCount: number;
  /** e.g. "REVIEW TRIGGERS" */
  triggerLabel: string;
  /** The disclaimer that travels with the count, e.g. "not quantified savings". */
  triggerNote: string;

  /** Derived from the ledger by buildWindow(). Null when no row carried a parseable date. */
  window: AuditWindow | null;
  /** Net of all amounts including credits, formatted. */
  netLedger: string;
  /** Usable rows the findings were computed from. */
  rowsReviewed: number;

  summary: string;
  spendTable: SpendRow[];
  findings: Finding[];
}
