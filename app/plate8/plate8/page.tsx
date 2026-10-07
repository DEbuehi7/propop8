'use client';

import React, { useState } from 'react';
import Link from 'next/link';

export default function Plate8Page() {
  const [activeTab, setActiveTab] = useState('decoder');

  return (
    <div className="min-h-screen bg-gradient-to-br from-[#0A0E27] to-[#1A1F3A] text-[#E8EAEF]">
      {/* Header */}
      <div className="border-b border-[#2D3456] bg-[#0F1220]/50 backdrop-blur">
        <div className="max-w-7xl mx-auto px-6 py-6">
          <Link href="/plate8" className="text-orange-400 hover:text-orange-300 text-sm mb-4 inline-block">
            ← Back to Dashboard
          </Link>
          <div className="flex items-center gap-3 mb-2">
            <span className="text-4xl">🅰️</span>
            <div>
              <h1 className="text-3xl font-bold">Plate8</h1>
              <p className="text-[#A0A7B8]">License Plate Word Decoder</p>
            </div>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="max-w-7xl mx-auto px-6 py-12">
        {/* Stats Grid */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-12">
          <div className="bg-[#1A1F3A] border border-[#2D3456] rounded-lg p-4">
            <p className="text-xs text-[#A0A7B8] uppercase tracking-wide mb-2">Plates Decoded</p>
            <p className="text-3xl font-bold text-orange-400">1,247</p>
          </div>
          <div className="bg-[#1A1F3A] border border-[#2D3456] rounded-lg p-4">
            <p className="text-xs text-[#A0A7B8] uppercase tracking-wide mb-2">Avg. Word Length</p>
            <p className="text-3xl font-bold text-orange-400">4.2</p>
          </div>
          <div className="bg-[#1A1F3A] border border-[#2D3456] rounded-lg p-4">
            <p className="text-xs text-[#A0A7B8] uppercase tracking-wide mb-2">Success Rate</p>
            <p className="text-3xl font-bold text-orange-400">94.7%</p>
          </div>
          <div className="bg-[#1A1F3A] border border-[#2D3456] rounded-lg p-4">
            <p className="text-xs text-[#A0A7B8] uppercase tracking-wide mb-2">Personal Best</p>
            <p className="text-3xl font-bold text-orange-400">2 chars</p>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex gap-4 mb-8 border-b border-[#2D3456]">
          {['decoder', 'solutions', 'stats'].map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`px-4 py-3 font-medium text-sm transition-colors border-b-2 ${
                activeTab === tab
                  ? 'border-orange-400 text-orange-400'
                  : 'border-transparent text-[#A0A7B8] hover:text-[#E8EAEF]'
              }`}
            >
              {tab.charAt(0).toUpperCase() + tab.slice(1)}
            </button>
          ))}
        </div>

        {/* Decoder */}
        {activeTab === 'decoder' && (
          <div className="bg-[#1A1F3A] border border-[#2D3456] rounded-lg p-8">
            <h2 className="text-lg font-semibold mb-6">Plate Decoder</h2>
            <div className="space-y-6">
              <div>
                <label className="block text-sm font-medium text-[#A0A7B8] mb-2">Enter License Plate</label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    placeholder="e.g., 2FAST4U"
                    defaultValue="2FAST4U"
                    maxLength={7}
                    className="flex-1 bg-[#0F1220] border border-orange-500/30 rounded px-4 py-2 text-[#E8EAEF] placeholder-[#A0A7B8] focus:outline-none focus:border-orange-400"
                  />
                  <button className="bg-orange-500/20 border border-orange-500/50 text-orange-400 px-6 py-2 rounded font-medium hover:bg-orange-500/30 transition-colors">
                    Decode
                  </button>
                </div>
              </div>

              <div className="bg-[#0F1220] rounded p-6 border border-orange-500/20">
                <p className="text-xs text-[#A0A7B8] uppercase tracking-wide mb-3">Solutions Found</p>
                <div className="space-y-2">
                  <div className="flex items-center justify-between p-3 bg-[#1A1F3A] rounded">
                    <span className="font-mono text-orange-400 font-bold">2FAST</span>
                    <span className="text-xs text-[#A0A7B8]">4 characters</span>
                  </div>
                  <div className="flex items-center justify-between p-3 bg-[#1A1F3A] rounded">
                    <span className="font-mono text-orange-400 font-bold">FAST</span>
                    <span className="text-xs text-[#A0A7B8]">Common word</span>
                  </div>
                  <div className="flex items-center justify-between p-3 bg-[#1A1F3A] rounded">
                    <span className="font-mono text-orange-400 font-bold">AFT</span>
                    <span className="text-xs text-[#A0A7B8]">Nautical term</span>
                  </div>
                </div>
              </div>

              <div className="bg-[#0F1220] rounded p-4 border border-orange-500/20">
                <p className="text-xs text-[#A0A7B8] uppercase tracking-wide mb-2">Constraints</p>
                <ul className="text-sm text-[#A0A7B8] space-y-1">
                  <li>✓ Must be legal English word (dictionary)</li>
                  <li>✓ Numbers map to letters: 0=O, 1=I/L, 3=E, 4=A, 5=S, 7=T, 8=B</li>
                  <li>✓ Minimum 2 characters, maximum 7</li>
                  <li>✓ Case-insensitive matching</li>
                </ul>
              </div>
            </div>
          </div>
        )}

        {/* Solutions History */}
        {activeTab === 'solutions' && (
          <div className="bg-[#1A1F3A] border border-[#2D3456] rounded-lg p-8">
            <h2 className="text-lg font-semibold mb-6">Recent Decodings</h2>
            <div className="space-y-3">
              {[
                { plate: '2FAST4U', words: ['FAST', 'AFT', '2FAST'], best: 'FAST', date: 'Today' },
                { plate: 'B4NANAS', words: ['BANANAS', 'BANAS', 'NANAS'], best: 'BANANAS', date: 'Oct 4' },
                { plate: 'LUVY0U', words: ['LUVY', 'YOU'], best: 'YOU', date: 'Oct 4' },
                { plate: 'H3LL0W0RLD', words: ['HELLO', 'WORLD', 'HELLOWORLD'], best: 'HELLO', date: 'Oct 3' },
              ].map((solution, i) => (
                <div key={i} className="bg-[#0F1220] rounded p-4 border border-orange-500/20">
                  <div className="flex items-center justify-between mb-3">
                    <span className="font-mono text-lg font-bold text-orange-400">{solution.plate}</span>
                    <span className="text-xs text-[#A0A7B8]">{solution.date}</span>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {solution.words.map((word) => (
                      <span
                        key={word}
                        className={`px-3 py-1 rounded text-xs font-medium ${
                          word === solution.best
                            ? 'bg-orange-500/30 text-orange-400 border border-orange-500/50'
                            : 'bg-[#1A1F3A] text-[#A0A7B8]'
                        }`}
                      >
                        {word}
                      </span>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Stats */}
        {activeTab === 'stats' && (
          <div className="bg-[#1A1F3A] border border-[#2D3456] rounded-lg p-8">
            <h2 className="text-lg font-semibold mb-6">Decoding Statistics</h2>
            <div className="space-y-4">
              <div className="bg-[#0F1220] rounded p-4">
                <p className="text-sm font-semibold text-orange-400 mb-4">Word Length Distribution</p>
                <div className="space-y-2">
                  {[
                    { len: '2 char', count: 124, pct: 10 },
                    { len: '3 char', count: 356, pct: 29 },
                    { len: '4 char', count: 412, pct: 33 },
                    { len: '5 char', count: 288, pct: 23 },
                    { len: '6+ char', count: 67, pct: 5 },
                  ].map((stat) => (
                    <div key={stat.len}>
                      <div className="flex justify-between mb-1">
                        <span className="text-xs text-[#A0A7B8]">{stat.len}</span>
                        <span className="text-xs text-orange-400">{stat.count}</span>
                      </div>
                      <div className="w-full h-2 bg-[#1A1F3A] rounded overflow-hidden">
                        <div className="h-full bg-gradient-to-r from-orange-600 to-orange-400" style={{ width: `${stat.pct * 5}%` }} />
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="bg-[#0F1220] rounded p-4">
                <p className="text-sm font-semibold text-orange-400 mb-3">Top Decoded Words</p>
                <div className="space-y-2">
                  {['FAST', 'LOVE', 'COOL', 'BEST', 'PURE'].map((word, i) => (
                    <div key={word} className="flex items-center justify-between">
                      <span className="font-mono text-[#E8EAEF]">#{i + 1} {word}</span>
                      <span className="text-xs text-[#A0A7B8]">{47 - i * 8} times</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
