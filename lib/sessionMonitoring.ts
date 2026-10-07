/**
 * Phase 2C: Monitoring & Observability for Migration
 * 
 * Tracks:
 * - Read latency (Supabase vs Map)
 * - Data source (which backend served the request)
 * - Error rates and fallback frequency
 * - Query patterns
 * 
 * Exported to monitoring dashboard for Phase 2C visibility
 */

interface ReadMetric {
  timestamp: number;
  action: 'get' | 'list';
  source: 'supabase' | 'map'; // Which backend served the data
  latencyMs: number;
  success: boolean;
  errorMessage?: string;
  fallbackUsed: boolean; // true if Map was used because Supabase failed
}

interface MetricsSnapshot {
  totalReads: number;
  supabaseReads: number;
  mapReads: number;
  fallbackCount: number;
  avgLatencyMs: number;
  errorCount: number;
  supbaseSuccessRate: number;
  mapSuccessRate: number;
}

// In-memory metrics buffer (last 1000 reads)
const metricsBuffer: ReadMetric[] = [];
const maxBufferSize = 1000;

/** Callers describe the read; the timestamp is always assigned here. */
export function recordRead(metric: Omit<ReadMetric, 'timestamp'>) {
  metricsBuffer.push({
    ...metric,
    timestamp: Date.now(),
  });

  // Maintain buffer size
  if (metricsBuffer.length > maxBufferSize) {
    metricsBuffer.shift();
  }
}

export function getMetricsSnapshot(): MetricsSnapshot {
  if (metricsBuffer.length === 0) {
    return {
      totalReads: 0,
      supabaseReads: 0,
      mapReads: 0,
      fallbackCount: 0,
      avgLatencyMs: 0,
      errorCount: 0,
      supbaseSuccessRate: 0,
      mapSuccessRate: 0,
    };
  }

  const supabaseMetrics = metricsBuffer.filter((m) => m.source === 'supabase');
  const mapMetrics = metricsBuffer.filter((m) => m.source === 'map');
  const fallbacks = metricsBuffer.filter((m) => m.fallbackUsed);
  const errors = metricsBuffer.filter((m) => !m.success);

  const avgLatency =
    metricsBuffer.reduce((sum, m) => sum + m.latencyMs, 0) / metricsBuffer.length;

  const supabaseSuccess = supabaseMetrics.filter((m) => m.success).length;
  const mapSuccess = mapMetrics.filter((m) => m.success).length;

  return {
    totalReads: metricsBuffer.length,
    supabaseReads: supabaseMetrics.length,
    mapReads: mapMetrics.length,
    fallbackCount: fallbacks.length,
    avgLatencyMs: Math.round(avgLatency),
    errorCount: errors.length,
    supbaseSuccessRate:
      supabaseMetrics.length > 0
        ? Math.round((supabaseSuccess / supabaseMetrics.length) * 100)
        : 0,
    mapSuccessRate:
      mapMetrics.length > 0
        ? Math.round((mapSuccess / mapMetrics.length) * 100)
        : 0,
  };
}

export function getRecentErrors(limit = 10): ReadMetric[] {
  return metricsBuffer
    .filter((m) => !m.success)
    .slice(-limit)
    .reverse();
}

export function getReadSourceDistribution() {
  const snapshot = getMetricsSnapshot();
  const total = snapshot.totalReads;
  if (total === 0) return { supabase: 0, map: 0 };

  return {
    supabase: Math.round((snapshot.supabaseReads / total) * 100),
    map: Math.round((snapshot.mapReads / total) * 100),
  };
}

export function clearMetrics() {
  metricsBuffer.length = 0;
}
