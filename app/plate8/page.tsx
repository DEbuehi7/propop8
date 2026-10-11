'use client';

import React, { useState } from 'react';
import {
  State8Card,
  Mate8Card,
  Skate8Card,
  Plate8Card,
  Slate8Card,
  Late8Card,
} from '@/components/plate8';
import ActivityFeed from '@/components/plate8/ActivityFeed';

interface Instrument {
  id: string;
  name: string;
  description: string;
  icon: string;
  component: React.ComponentType<{ isOnline: boolean }>;
}

const instruments: Instrument[] = [
  {
    id: 'state8',
    name: 'State8',
    description: 'Voice & Audio Analysis',
    icon: '🎙️',
    component: State8Card,
  },
  {
    id: 'mate8',
    name: 'Mate8',
    description: 'Analytical Chess',
    icon: '♟️',
    component: Mate8Card,
  },
  {
    id: 'skate8',
    name: 'Skate8',
    description: 'Autonomous Racing',
    icon: '🏎️',
    component: Skate8Card,
  },
  {
    id: 'plate8',
    name: 'Plate8',
    description: 'Word Derivation',
    icon: '🅰️',
    component: Plate8Card,
  },
  {
    id: 'slate8',
    name: 'Slate8',
    description: 'Video Discovery',
    icon: '▶️',
    component: Slate8Card,
  },
  {
    id: 'late8',
    name: 'Late8',
    description: 'News & Audio',
    icon: '📰',
    component: Late8Card,
  },
];

interface Activity {
  time: string;
  text: string;
  color: string;
  label: string;
}

const MOCK_ACTIVITIES: Activity[] = [
  { time: '12:52', text: 'New plate game started', color: 'orange', label: 'PLATE' },
  { time: '12:49', text: 'Chess analysis completed (+2.1)', color: 'cyan', label: 'MATE' },
  { time: '12:46', text: 'Best lap: 28.4s (2,101 km/h)', color: 'coral', label: 'SKATE' },
  { time: '12:42', text: 'Real-time speech transcription', color: 'magenta', label: 'STATE' },
  { time: '12:38', text: 'Added to watchlist', color: 'purple', label: 'SLATE' },
  { time: '12:34', text: '3 new dispatches', color: 'teal', label: 'LATE' },
];

export default function Plate8Dashboard() {
  const [activities] = useState<Activity[]>(MOCK_ACTIVITIES);
  const [systemStatus] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(instruments.map((instrument) => [instrument.id, true]))
  );

  return (
    <div className="min-h-screen bg-gradient-to-br from-[#0A0E27] to-[#1A1F3A] text-[#E8EAEF]">
      {/* Hero Section */}
      <div className="relative h-[500px] overflow-hidden bg-gradient-to-b from-slate-900 via-blue-900 to-transparent">
        {/* Background image with overlay */}
        <div
          className="absolute inset-0 bg-cover bg-center opacity-40"
          style={{
            backgroundImage:
              'url("https://images.unsplash.com/photo-1506905925346-21bda4d32df4?w=1600&h=900&fit=crop")',
          }}
        />
        <div className="absolute inset-0 bg-gradient-to-b from-transparent via-transparent to-[#0A0E27]" />

        {/* Hero content */}
        <div className="relative h-full flex flex-col items-center justify-center px-6">
          <div className="text-center">
            <div className="text-6xl font-bold mb-6 leading-tight tracking-tight">
              <span className="text-cyan-400">Play</span>
              <span className="text-white"> </span>
              <span className="text-pink-400">Create</span>
              <span className="text-white"> </span>
              <span className="text-emerald-400">Explore</span>
              <span className="text-white"> </span>
              <span className="text-yellow-400">Learn</span>
            </div>
            <p className="text-lg text-[#A0A7B8]">
              Six computational instruments for a more intelligent tomorrow.
            </p>
            <p className="text-sm text-[#A0A7B8] mt-2">
              &quot;A smarter you. A more livable world.&quot;
            </p>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="max-w-7xl mx-auto px-6 py-12">
        {/* Instrument Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mb-12">
          {instruments.map((instrument) => {
            const Component = instrument.component;
            return (
              <div key={instrument.id} className="h-full">
                <Component isOnline={systemStatus[instrument.id] !== false} />
              </div>
            );
          })}
        </div>

        {/* Bottom Section: Activity Feed and Horizon */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mt-16">
          {/* Live Activity */}
          <div className="lg:col-span-2">
            <h3 className="text-xl font-semibold text-[#E8EAEF] mb-4">Live Activity</h3>
            <ActivityFeed activities={activities} />
          </div>

          {/* System Status and Horizon */}
          <div className="space-y-6">
            {/* System Status */}
            <div className="bg-[#1A1F3A] border border-[#2D3456] rounded-lg p-6">
              <h4 className="text-sm font-semibold text-[#A0A7B8] uppercase tracking-wide mb-4">
                System Status
              </h4>
              <div className="space-y-2">
                {instruments.map((instrument) => (
                  <div key={instrument.id} className="flex items-center gap-2 text-sm">
                    <div
                      className="w-2 h-2 rounded-full bg-green-400"
                      title={`${instrument.name} online`}
                    />
                    <span className="text-[#A0A7B8]">
                      {instrument.name.toLowerCase()}
                    </span>
                    <span className="text-xs text-[#A0A7B8]">online</span>
                  </div>
                ))}
              </div>
              <div className="mt-4 text-xs text-green-400">✓ All Systems Nominal</div>
            </div>

            {/* Horizon Section */}
            <div className="bg-gradient-to-br from-purple-900/30 to-blue-900/30 border border-purple-500/30 rounded-lg p-6">
              <h4 className="text-lg font-bold text-[#E8EAEF] mb-2">Horizon</h4>
              <p className="text-sm text-[#A0A7B8] mb-4">
                &quot;Intelligence should make the world more interesting, not the interface more complicated.&quot;
              </p>
              <p className="text-xs text-purple-300 font-semibold">
                REAL PLACES. REAL IDEAS. A BRIGHTER TOMORROW.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
