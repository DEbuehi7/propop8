import { NextRequest, NextResponse } from 'next/server';
import {
  getMetricsSnapshot,
  getRecentErrors,
  getReadSourceDistribution,
  clearMetrics,
} from '@/lib/sessionMonitoring';

/**
 * Monitoring API for Phase 2C migration
 * 
 * GET /api/plate8/state8/monitoring
 * Returns real-time metrics on read performance, error rates, and data source distribution
 * 
 * Use during Phase 2C to monitor Supabase read adoption and fallback frequency
 */

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const action = searchParams.get('action') || 'snapshot';

  try {
    if (action === 'snapshot') {
      const metrics = getMetricsSnapshot();
      const distribution = getReadSourceDistribution();

      return NextResponse.json({
        timestamp: new Date().toISOString(),
        metrics,
        distribution,
        insight:
          distribution.supabase > 95
            ? '✅ Supabase adoption healthy (>95%)'
            : distribution.supabase > 70
              ? '⚠️ Supabase adoption moderate (70-95%)'
              : '🔴 Supabase adoption low (<70%)',
      });
    }

    if (action === 'errors') {
      const limit = parseInt(searchParams.get('limit') || '10', 10);
      const errors = getRecentErrors(limit);

      return NextResponse.json({
        timestamp: new Date().toISOString(),
        errorCount: errors.length,
        recentErrors: errors,
      });
    }

    if (action === 'reset') {
      clearMetrics();
      return NextResponse.json({
        message: 'Metrics cleared',
        timestamp: new Date().toISOString(),
      });
    }

    return NextResponse.json(
      { error: 'Invalid action' },
      { status: 400 }
    );
  } catch (error) {
    console.error('Monitoring API error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
