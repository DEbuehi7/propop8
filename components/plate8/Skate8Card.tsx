'use client';

import React from 'react';
import Link from 'next/link';

interface Skate8CardProps {
  isOnline?: boolean;
}

export function Skate8Card({ isOnline = true }: Skate8CardProps) {
  return (
    <div className="bg-[#1A1F3A] border border-[#2D3456] rounded-lg p-6 h-full flex flex-col">
      {/* Header */}
      <div className="flex items-start justify-between mb-4">
        <div className="flex items-center gap-3">
          <span className="text-3xl">🏎️</span>
          <div>
            <h3 className="text-lg font-semibold text-[#E8EAEF]">Skate8</h3>
            <p className="text-xs text-[#A0A7B8]">Autonomous Racing</p>
          </div>
        </div>
        <div
          className={`w-2 h-2 rounded-full ${isOnline ? 'bg-red-400' : 'bg-gray-600'}`}
          title={isOnline ? 'Online' : 'Offline'}
        />
      </div>

      {/* Stats Section */}
      <div className="space-y-3 mb-6 flex-1">
        <div className="bg-[#0F1220] rounded p-3">
          <p className="text-xs text-[#A0A7B8] mb-1">Top Speed</p>
          <p className="text-2xl font-bold text-red-400">2,101 km/h</p>
        </div>
        <div className="bg-[#0F1220] rounded p-3">
          <p className="text-xs text-[#A0A7B8] mb-1">Best Lap</p>
          <p className="text-2xl font-bold text-red-400">28.4s</p>
        </div>
      </div>

      {/* Action Button */}
      <Link
        href="/plate8/skate8"
        className="w-full bg-red-500/20 border border-red-500/50 text-red-400 py-2 rounded-md text-sm font-medium hover:bg-red-500/30 transition-colors text-center block"
      >
        View Telemetry
      </Link>
    </div>
  );
}
