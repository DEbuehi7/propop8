'use client';

import React, { useState } from 'react';
import Link from 'next/link';

export default function Skate8Page() {
  const [activeTab, setActiveTab] = useState('telemetry');

  return (
    <div className="min-h-screen bg-gradient-to-br from-[#0A0E27] to-[#1A1F3A] text-[#E8EAEF]">
      {/* Header */}
      <div className="border-b border-[#2D3456] bg-[#0F1220]/50 backdrop-blur">
        <div className="max-w-7xl mx-auto px-6 py-6">
          <Link href="/plate8" className="text-red-400 hover:text-red-300 text-sm mb-4 inline-block">
            ← Back to Dashboard
          </Link>
          <div className="flex items-center gap-3 mb-2">
            <span className="text-4xl">🏎️</span>
            <div>
              <h1 className="text-3xl font-bold">Skate8</h1>
              <p className="text-[#A0A7B8]">Autonomous Racing & SLAM</p>
            </div>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="max-w-7xl mx-auto px-6 py-12">
        {/* Stats Grid */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-12">
          <div className="bg-[#1A1F3A] border border-[#2D3456] rounded-lg p-4">
            <p className="text-xs text-[#A0A7B8] uppercase tracking-wide mb-2">Best Lap Time</p>
            <p className="text-3xl font-bold text-red-400">28.4s</p>
          </div>
          <div className="bg-[#1A1F3A] border border-[#2D3456] rounded-lg p-4">
            <p className="text-xs text-[#A0A7B8] uppercase tracking-wide mb-2">Top Speed</p>
            <p className="text-3xl font-bold text-red-400">2,101 km/h</p>
          </div>
          <div className="bg-[#1A1F3A] border border-[#2D3456] rounded-lg p-4">
            <p className="text-xs text-[#A0A7B8] uppercase tracking-wide mb-2">Laps Completed</p>
            <p className="text-3xl font-bold text-red-400">156</p>
          </div>
          <div className="bg-[#1A1F3A] border border-[#2D3456] rounded-lg p-4">
            <p className="text-xs text-[#A0A7B8] uppercase tracking-wide mb-2">SLAM Accuracy</p>
            <p className="text-3xl font-bold text-red-400">99.8%</p>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex gap-4 mb-8 border-b border-[#2D3456]">
          {['telemetry', 'track', 'obstacles'].map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`px-4 py-3 font-medium text-sm transition-colors border-b-2 ${
                activeTab === tab
                  ? 'border-red-400 text-red-400'
                  : 'border-transparent text-[#A0A7B8] hover:text-[#E8EAEF]'
              }`}
            >
              {tab.charAt(0).toUpperCase() + tab.slice(1)}
            </button>
          ))}
        </div>

        {/* Telemetry */}
        {activeTab === 'telemetry' && (
          <div className="bg-[#1A1F3A] border border-[#2D3456] rounded-lg p-8">
            <h2 className="text-lg font-semibold mb-6">Real-time Vehicle Telemetry</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Speed Gauge */}
              <div className="bg-[#0F1220] rounded p-6">
                <p className="text-sm text-[#A0A7B8] mb-4">Current Speed</p>
                <svg viewBox="0 0 200 200" className="w-full">
                  {/* Gauge background */}
                  <circle cx="100" cy="100" r="90" fill="#1A1F3A" stroke="#2D3456" strokeWidth="2" />

                  {/* Gauge arc (red gradient for high speed) */}
                  <path
                    d="M 30 100 A 70 70 0 1 1 170 100"
                    fill="none"
                    stroke="#ff7a63"
                    strokeWidth="8"
                    strokeLinecap="round"
                    opacity="0.3"
                  />

                  {/* Speed needle (pointing to 80%) */}
                  <g transform="translate(100,100) rotate(234)">
                    <line x1="0" y1="0" x2="0" y2="-70" stroke="#ff7a63" strokeWidth="3" strokeLinecap="round" />
                    <circle cx="0" cy="0" r="6" fill="#ff7a63" />
                  </g>

                  {/* Center circle */}
                  <circle cx="100" cy="100" r="6" fill="#E8EAEF" />

                  {/* Labels */}
                  <text x="100" y="120" textAnchor="middle" fontSize="14" fill="#A0A7B8">
                    234 km/h
                  </text>
                  <text x="50" y="105" textAnchor="middle" fontSize="11" fill="#A0A7B8">
                    0
                  </text>
                  <text x="150" y="105" textAnchor="middle" fontSize="11" fill="#A0A7B8">
                    400
                  </text>
                </svg>
              </div>

              {/* Acceleration */}
              <div className="bg-[#0F1220] rounded p-6">
                <p className="text-sm text-[#A0A7B8] mb-4">Acceleration Profile</p>
                <div className="space-y-3">
                  <div>
                    <div className="flex justify-between mb-1">
                      <span className="text-xs text-[#A0A7B8]">G-Force (X)</span>
                      <span className="text-red-400 font-mono">+1.2G</span>
                    </div>
                    <div className="w-full h-2 bg-[#1A1F3A] rounded overflow-hidden">
                      <div className="h-full w-3/5 bg-gradient-to-r from-red-600 to-red-400" />
                    </div>
                  </div>
                  <div>
                    <div className="flex justify-between mb-1">
                      <span className="text-xs text-[#A0A7B8]">G-Force (Y)</span>
                      <span className="text-red-400 font-mono">+0.8G</span>
                    </div>
                    <div className="w-full h-2 bg-[#1A1F3A] rounded overflow-hidden">
                      <div className="h-full w-2/5 bg-gradient-to-r from-red-600 to-red-400" />
                    </div>
                  </div>
                  <div>
                    <div className="flex justify-between mb-1">
                      <span className="text-xs text-[#A0A7B8]">Brake Pressure</span>
                      <span className="text-red-400 font-mono">45%</span>
                    </div>
                    <div className="w-full h-2 bg-[#1A1F3A] rounded overflow-hidden">
                      <div className="h-full w-5/12 bg-gradient-to-r from-red-600 to-red-400" />
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Track Map */}
        {activeTab === 'track' && (
          <div className="bg-[#1A1F3A] border border-[#2D3456] rounded-lg p-8">
            <h2 className="text-lg font-semibold mb-6">Track Layout & Racing Line</h2>
            <svg viewBox="0 0 500 400" className="w-full max-w-2xl mx-auto bg-[#0F1220] rounded border border-red-500/30">
              {/* Track outer */}
              <path
                d="M 80 80 Q 200 20 350 80 L 400 200 Q 350 350 150 350 L 80 200 Z"
                fill="none"
                stroke="#2D3456"
                strokeWidth="20"
              />

              {/* Track inner */}
              <path
                d="M 100 120 Q 200 60 320 120 L 360 200 Q 320 320 150 320 L 100 200 Z"
                fill="none"
                stroke="#1A1F3A"
                strokeWidth="2"
              />

              {/* Optimal racing line */}
              <path
                d="M 100 120 Q 200 50 330 120 L 380 200 Q 340 330 150 330 L 100 200 Z"
                fill="none"
                stroke="#ff7a63"
                strokeWidth="2"
                strokeDasharray="5,5"
                opacity="0.6"
              />

              {/* Current vehicle position */}
              <circle cx="200" cy="60" r="8" fill="#ff7a63" />
              <circle cx="200" cy="60" r="12" fill="none" stroke="#ff7a63" strokeWidth="2" opacity="0.5" />

              {/* Direction arrow */}
              <path d="M 200 60 L 210 45" stroke="#ff7a63" strokeWidth="2" markerEnd="url(#arrowRed)" />

              {/* Markers */}
              <text x="50" y="200" textAnchor="middle" fontSize="12" fill="#A0A7B8" fontWeight="bold">
                S
              </text>
              <text x="250" y="20" textAnchor="middle" fontSize="12" fill="#A0A7B8" fontWeight="bold">
                T1
              </text>
              <text x="420" y="200" textAnchor="middle" fontSize="12" fill="#A0A7B8" fontWeight="bold">
                T2
              </text>
              <text x="150" y="360" textAnchor="middle" fontSize="12" fill="#A0A7B8" fontWeight="bold">
                T3
              </text>

              {/* Legend */}
              <text x="20" y="385" fontSize="11" fill="#A0A7B8">
                ▬ Optimal line
              </text>
              <line x1="100" y1="380" x2="130" y2="380" stroke="#ff7a63" strokeWidth="2" strokeDasharray="5,5" />

              <defs>
                <marker id="arrowRed" markerWidth="10" markerHeight="10" refX="9" refY="3" orient="auto" markerUnits="strokeWidth">
                  <path d="M0,0 L0,6 L9,3 z" fill="#ff7a63" />
                </marker>
              </defs>
            </svg>
          </div>
        )}

        {/* Obstacles & SLAM */}
        {activeTab === 'obstacles' && (
          <div className="bg-[#1A1F3A] border border-[#2D3456] rounded-lg p-8">
            <h2 className="text-lg font-semibold mb-6">Obstacle Detection & SLAM Mapping</h2>
            <div className="space-y-4">
              <div className="bg-[#0F1220] rounded p-4">
                <p className="text-sm font-semibold text-red-400 mb-3">Active Sensors</p>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                  {['LiDAR', 'IMU', 'Encoder', 'Camera', 'Radar', 'Barometer'].map((sensor) => (
                    <div key={sensor} className="bg-[#1A1F3A] border border-red-500/30 rounded px-3 py-2 text-xs">
                      <span className="inline-block w-2 h-2 bg-green-400 rounded-full mr-2" />
                      {sensor}
                    </div>
                  ))}
                </div>
              </div>

              <div className="bg-[#0F1220] rounded p-4">
                <p className="text-sm font-semibold text-red-400 mb-3">Obstacle Types Detected</p>
                <ul className="text-sm text-[#A0A7B8] space-y-2">
                  <li>• Static obstacles: 3 (cones, barriers)</li>
                  <li>• Dynamic obstacles: 0 (other vehicles)</li>
                  <li>• Track boundaries: Mapped with ±2cm accuracy</li>
                  <li>• Surface irregularities: Detected</li>
                  <li>• Localization error: &lt;1cm</li>
                </ul>
              </div>

              <div className="bg-[#0F1220] rounded p-4">
                <p className="text-sm font-semibold text-red-400 mb-3">SLAM Performance</p>
                <div className="space-y-2">
                  <div className="flex justify-between">
                    <span className="text-xs text-[#A0A7B8]">Loop Closure Detections</span>
                    <span className="text-red-400 font-mono">12</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-xs text-[#A0A7B8]">Keyframes Captured</span>
                    <span className="text-red-400 font-mono">487</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-xs text-[#A0A7B8]">Map Points Generated</span>
                    <span className="text-red-400 font-mono">142,893</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-xs text-[#A0A7B8]">Optimization Time</span>
                    <span className="text-red-400 font-mono">234ms</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
