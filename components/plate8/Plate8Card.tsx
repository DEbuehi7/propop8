'use client';

import React from 'react';

interface Plate8CardProps {
  isOnline?: boolean;
}

export function Plate8Card({ isOnline = true }: Plate8CardProps) {
  return (
    <div className="bg-[#1A1F3A] border border-[#2D3456] rounded-lg p-6 h-full flex flex-col">
      {/* Header */}
      <div className="flex items-start justify-between mb-4">
        <div className="flex items-center gap-3">
          <span className="text-3xl">🅰️</span>
          <div>
            <h3 className="text-lg font-semibold text-[#E8EAEF]">Plate8</h3>
            <p className="text-xs text-[#A0A7B8]">Word Derivation</p>
          </div>
        </div>
        <div
          className={`w-2 h-2 rounded-full ${isOnline ? 'bg-orange-400' : 'bg-gray-600'}`}
          title={isOnline ? 'Online' : 'Offline'}
        />
      </div>

      {/* Stats Section */}
      <div className="space-y-3 mb-6 flex-1">
        <div className="bg-[#0F1220] rounded p-3">
          <p className="text-xs text-[#A0A7B8] mb-1">Plates Decoded</p>
          <p className="text-2xl font-bold text-orange-400">1,247</p>
        </div>
        <div className="bg-[#0F1220] rounded p-3">
          <p className="text-xs text-[#A0A7B8] mb-1">Avg. Word Length</p>
          <p className="text-2xl font-bold text-orange-400">4.2 chars</p>
        </div>
      </div>

      {/* Action Button */}
      <button className="w-full bg-orange-500/20 border border-orange-500/50 text-orange-400 py-2 rounded-md text-sm font-medium hover:bg-orange-500/30 transition-colors">
        Play Game
      </button>
    </div>
  );
}
