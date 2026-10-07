'use client';

import React from 'react';
import Link from 'next/link';

interface Late8CardProps {
  isOnline?: boolean;
}

export function Late8Card({ isOnline = true }: Late8CardProps) {
  return (
    <div className="bg-[#1A1F3A] border border-[#2D3456] rounded-lg p-6 h-full flex flex-col">
      {/* Header */}
      <div className="flex items-start justify-between mb-4">
        <div className="flex items-center gap-3">
          <span className="text-3xl">📰</span>
          <div>
            <h3 className="text-lg font-semibold text-[#E8EAEF]">Late8</h3>
            <p className="text-xs text-[#A0A7B8]">News & Audio</p>
          </div>
        </div>
        <div
          className={`w-2 h-2 rounded-full ${isOnline ? 'bg-teal-400' : 'bg-gray-600'}`}
          title={isOnline ? 'Online' : 'Offline'}
        />
      </div>

      {/* Stats Section */}
      <div className="space-y-3 mb-6 flex-1">
        <div className="bg-[#0F1220] rounded p-3">
          <p className="text-xs text-[#A0A7B8] mb-1">New Dispatches</p>
          <p className="text-2xl font-bold text-teal-400">3</p>
        </div>
        <div className="bg-[#0F1220] rounded p-3">
          <p className="text-xs text-[#A0A7B8] mb-1">Listening Time</p>
          <p className="text-2xl font-bold text-teal-400">8.3 hrs</p>
        </div>
      </div>

      {/* Action Button */}
      <Link
        href="/plate8/late8"
        className="w-full bg-teal-500/20 border border-teal-500/50 text-teal-400 py-2 rounded-md text-sm font-medium hover:bg-teal-500/30 transition-colors text-center block"
      >
        View Feed
      </Link>
    </div>
  );
}
