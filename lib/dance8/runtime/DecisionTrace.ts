import type { DecisionConfidence, DecisionGate, DecisionTrace as DecisionTraceEntry } from "../contracts/decision";

export interface DecisionTraceData {
  entries: DecisionTraceEntry[];
}

/**
 * Immutable log of all decisions with full metadata.
 */
export class DecisionTrace {
  private entries: DecisionTraceEntry[] = [];

  /**
   * Adds a decision entry to the trace.
   */
  addEntry(entry: DecisionTraceEntry): void {
    this.entries.push(entry);
  }

  /**
   * Returns all entries in the trace.
   */
  getEntries(): DecisionTraceEntry[] {
    return [...this.entries];
  }

  /**
   * Returns the last N decisions.
   */
  getRecentDecisions(count: number): DecisionTraceEntry[] {
    return this.entries.slice(-count);
  }

  /**
   * Returns entries within a time window.
   */
  getEntriesInWindow(startTime: number, endTime: number): DecisionTraceEntry[] {
    return this.entries.filter((e) => e.atTime >= startTime && e.atTime <= endTime);
  }

  /**
   * Returns trace statistics.
   */
  getStatistics(): {
    totalDecisions: number;
    executeCount: number;
    deferCount: number;
    escalateCount: number;
    killCount: number;
    fallbackCount: number;
    avgConfidence: number;
    limitingDimensionCounts: Record<string, number>;
  } {
    const stats = {
      totalDecisions: this.entries.length,
      executeCount: 0,
      deferCount: 0,
      escalateCount: 0,
      killCount: 0,
      fallbackCount: 0,
      avgConfidence: 0,
      limitingDimensionCounts: {} as Record<string, number>,
    };

    let confidenceSum = 0;
    for (const entry of this.entries) {
      if (entry.gate === "execute") stats.executeCount++;
      if (entry.gate === "defer") stats.deferCount++;
      if (entry.gate === "escalate") stats.escalateCount++;
      if (entry.gate === "kill") stats.killCount++;

      // Check for fallback (reasonCode contains "fallback")
      if (entry.reasonCode === "fallback_selected") stats.fallbackCount++;

      confidenceSum += entry.confidence.aggregate;

      // Count limiting dimensions
      const dim = entry.confidence.limitingDimension;
      stats.limitingDimensionCounts[dim] =
        (stats.limitingDimensionCounts[dim] ?? 0) + 1;
    }

    if (this.entries.length > 0) {
      stats.avgConfidence = confidenceSum / this.entries.length;
    }

    return stats;
  }

  /**
   * Exports the trace as JSON.
   */
  toJSON(): DecisionTraceData {
    return { entries: this.entries };
  }

  /**
   * Imports trace from JSON.
   */
  static fromJSON(data: DecisionTraceData): DecisionTrace {
    const trace = new DecisionTrace();
    for (const entry of data.entries) {
      trace.addEntry(entry);
    }
    return trace;
  }
}
