'use client';

import { useEffect, useState } from 'react';

interface Metrics {
  timestamp: string;
  metrics: {
    totalReads: number;
    supabaseReads: number;
    mapReads: number;
    fallbackCount: number;
    avgLatencyMs: number;
    errorCount: number;
    supbaseSuccessRate: number;
    mapSuccessRate: number;
  };
  distribution: {
    supabase: number;
    map: number;
  };
  insight: string;
}

export default function MonitoringPage() {
  const [metrics, setMetrics] = useState<Metrics | null>(null);
  const [errors, setErrors] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [autoRefresh, setAutoRefresh] = useState(true);

  const fetchMetrics = async () => {
    try {
      const response = await fetch('/api/plate8/state8/monitoring?action=snapshot');
      const data = await response.json();
      setMetrics(data);
    } catch (error) {
      console.error('Failed to fetch metrics:', error);
    }
  };

  const fetchErrors = async () => {
    try {
      const response = await fetch('/api/plate8/state8/monitoring?action=errors&limit=5');
      const data = await response.json();
      setErrors(data.recentErrors || []);
    } catch (error) {
      console.error('Failed to fetch errors:', error);
    }
  };

  const handleReset = async () => {
    try {
      await fetch('/api/plate8/state8/monitoring?action=reset', { method: 'GET' });
      fetchMetrics();
      fetchErrors();
    } catch (error) {
      console.error('Failed to reset metrics:', error);
    }
  };

  useEffect(() => {
    fetchMetrics();
    fetchErrors();
    setLoading(false);

    if (autoRefresh) {
      const interval = setInterval(() => {
        fetchMetrics();
        fetchErrors();
      }, 5000);

      return () => clearInterval(interval);
    }
  }, [autoRefresh]);

  if (loading) {
    return (
      <div className="p-6">
        <div className="text-gray-500">Loading monitoring data...</div>
      </div>
    );
  }

  if (!metrics) {
    return (
      <div className="p-6">
        <div className="text-red-500">Failed to load monitoring data</div>
        <p className="text-sm text-gray-600 mt-2">
          Make sure Supabase is configured and the API is running
        </p>
      </div>
    );
  }

  const { metrics: m, distribution, insight } = metrics;

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="max-w-5xl mx-auto">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900">Phase 2C Monitoring</h1>
          <p className="text-gray-600 mt-2">Supabase Migration and Read Strategy</p>
          <p className="text-sm text-gray-500 mt-1">
            Last updated: {new Date(metrics.timestamp).toLocaleTimeString()}
          </p>
        </div>

        <div className="flex gap-3 mb-6">
          <button
            onClick={() => setAutoRefresh(!autoRefresh)}
            className={`px-4 py-2 rounded font-medium transition ${
              autoRefresh
                ? 'bg-blue-600 text-white hover:bg-blue-700'
                : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
            }`}
          >
            {autoRefresh ? 'Pause' : 'Resume'}
          </button>
          <button
            onClick={fetchMetrics}
            className="px-4 py-2 bg-gray-200 text-gray-700 rounded font-medium hover:bg-gray-300 transition"
          >
            Refresh
          </button>
          <button
            onClick={handleReset}
            className="px-4 py-2 bg-red-100 text-red-700 rounded font-medium hover:bg-red-200 transition"
          >
            Reset
          </button>
        </div>

        <div className="mb-6 p-4 bg-blue-50 border border-blue-200 rounded-lg">
          <p className="text-blue-900 font-medium">{insight}</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
          <MetricCard label="Total Reads" value={m.totalReads} />
          <MetricCard label="Supabase" value={m.supabaseReads} />
          <MetricCard label="Fallbacks" value={m.fallbackCount} />
          <MetricCard label="Errors" value={m.errorCount} />
        </div>

        <div className="bg-white p-6 rounded-lg border border-gray-200 mb-8">
          <h3 className="font-semibold text-gray-900 mb-4">Read Distribution</h3>
          <div className="space-y-3">
            <div>
              <div className="flex justify-between mb-1">
                <span className="text-sm font-medium">Supabase</span>
                <span className="font-bold text-green-600">{distribution.supabase}%</span>
              </div>
              <div className="w-full bg-gray-200 rounded-full h-4">
                <div
                  className="bg-green-500 h-4 rounded-full transition-all"
                  style={{ width: `${distribution.supabase}%` }}
                />
              </div>
            </div>
            <div>
              <div className="flex justify-between mb-1">
                <span className="text-sm font-medium">Map (Fallback)</span>
                <span className="font-bold text-blue-600">{distribution.map}%</span>
              </div>
              <div className="w-full bg-gray-200 rounded-full h-4">
                <div
                  className="bg-blue-500 h-4 rounded-full transition-all"
                  style={{ width: `${distribution.map}%` }}
                />
              </div>
            </div>
          </div>
        </div>

        <div className="bg-white p-6 rounded-lg border border-gray-200 mb-8">
          <h3 className="font-semibold text-gray-900 mb-4">Performance</h3>
          <div className="flex justify-between items-end">
            <div>
              <p className="text-4xl font-bold text-purple-600">{m.avgLatencyMs}ms</p>
              <p className="text-sm text-gray-600 mt-2">Average Latency</p>
            </div>
            <div>
              <p className="text-4xl font-bold text-green-600">{m.supbaseSuccessRate}%</p>
              <p className="text-sm text-gray-600 mt-2">Supabase Success</p>
            </div>
          </div>
        </div>

        {errors.length > 0 && (
          <div className="bg-white p-6 rounded-lg border border-red-200">
            <h3 className="font-semibold text-red-900 mb-4">Recent Errors ({errors.length})</h3>
            <div className="space-y-2">
              {errors.map((error, idx) => (
                <div key={idx} className="bg-red-50 p-2 rounded text-sm font-mono text-red-700">
                  {error.errorMessage}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function MetricCard({ label, value }: { label: string; value: number }) {
  return (
    <div className="bg-white p-4 rounded-lg border border-gray-200">
      <p className="text-sm text-gray-600 font-medium">{label}</p>
      <p className="text-3xl font-bold text-gray-900 mt-2">{value}</p>
    </div>
  );
}
