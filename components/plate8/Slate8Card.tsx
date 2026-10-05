'use client';

import React from 'react';

interface Slate8CardProps {
  isOnline?: boolean;
}

export function Slate8Card({ isOnline = true }: Slate8CardProps) {
  return (
    <div className="bg-[#1A1F3A] border border-[#2D3456] rounded-lg p-6 h-full flex flex-col">
      {/* Header */}
      <div className="flex items-start justify-between mb-4">
        <div className="flex items-center gap-3">
          <span className="text-3xl">▶️</span>
          <div>
            <h3 className="text-lg font-semibold text-[#E8EAEF]">Slate8</h3>
            <p className="text-xs text-[#A0A7B8]">Video Discovery</p>
          </div>
        </div>
        <div
          className={`w-2 h-2 rounded-full ${isOnline ? 'bg-purple-400' : 'bg-gray-600'}`}
          title={isOnline ? 'Online' : 'Offline'}
        />
      </div>

      {/* Stats Section */}
      <div className="space-y-3 mb-6 flex-1">
        <div className="bg-[#0F1220] rounded p-3">
          <p className="text-xs text-[#A0A7B8] mb-1">Videos Added</p>
          <p className="text-2xl font-bold text-purple-400">892</p>
        </div>
        <div className="bg-[#0F1220] rounded p-3">
          <p className="text-xs text-[#A0A7B8] mb-1">Watch Time</p>
          <p className="text-2xl font-bold text-purple-400">156 hrs</p>
        </div>
      </div>

      {/* Action Button */}
      <button className="w-full bg-purple-500/20 border border-purple-500/50 text-purple-400 py-2 rounded-md text-sm font-medium hover:bg-purple-500/30 transition-colors">
        Add to Watchlist
      </button>
    </div>
  );
}
