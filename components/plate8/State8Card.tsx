'use client';

import React from 'react';
import Link from 'next/link';

interface State8CardProps {
  isOnline?: boolean;
}

export function State8Card({ isOnline = true }: State8CardProps) {
  return (
    <div className="bg-[#1A1F3A] border border-[#2D3456] rounded-lg p-6 h-full flex flex-col">
      {/* Header */}
      <div className="flex items-start justify-between mb-4">
        <div className="flex items-center gap-3">
          <span className="text-3xl">🎙️</span>
          <div>
            <h3 className="text-lg font-semibold text-[#E8EAEF]">State8</h3>
            <p className="text-xs text-[#A0A7B8]">Voice & Audio</p>
          </div>
        </div>
        <div
          className={`w-2 h-2 rounded-full ${isOnline ? 'bg-magenta-400' : 'bg-gray-600'}`}
          title={isOnline ? 'Online' : 'Offline'}
        />
      </div>

      {/* Stats Section */}
      <div className="space-y-3 mb-6 flex-1">
        <div className="bg-[#0F1220] rounded p-3">
          <p className="text-xs text-[#A0A7B8] mb-1">Current Session</p>
          <p className="text-2xl font-bold text-magenta-400">2h 14m</p>
        </div>
        <div className="bg-[#0F1220] rounded p-3">
          <p className="text-xs text-[#A0A7B8] mb-1">Transcription Accuracy</p>
          <p className="text-2xl font-bold text-magenta-400">98.2%</p>
        </div>
      </div>

      {/* Action Button */}
      <Link
        href="/plate8/state8"
        className="w-full bg-magenta-500/20 border border-magenta-500/50 text-magenta-400 py-2 rounded-md text-sm font-medium hover:bg-magenta-500/30 transition-colors text-center block"
      >
        View Analysis
      </Link>
    </div>
  );
}
