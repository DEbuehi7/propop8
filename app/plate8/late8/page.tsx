'use client';

import React, { useState } from 'react';
import Link from 'next/link';

export default function Late8Page() {
  const [activeTab, setActiveTab] = useState('feed');
  const [playingId, setPlayingId] = useState<number | null>(null);

  return (
    <div className="min-h-screen bg-gradient-to-br from-[#0A0E27] to-[#1A1F3A] text-[#E8EAEF]">
      {/* Header */}
      <div className="border-b border-[#2D3456] bg-[#0F1220]/50 backdrop-blur">
        <div className="max-w-7xl mx-auto px-6 py-6">
          <Link href="/plate8" className="text-teal-400 hover:text-teal-300 text-sm mb-4 inline-block">
            ← Back to Dashboard
          </Link>
          <div className="flex items-center gap-3 mb-2">
            <span className="text-4xl">📻</span>
            <div>
              <h1 className="text-3xl font-bold">Late8</h1>
              <p className="text-[#A0A7B8]">News & Audio Intelligence</p>
            </div>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="max-w-7xl mx-auto px-6 py-12">
        {/* Stats Grid */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-12">
          <div className="bg-[#1A1F3A] border border-[#2D3456] rounded-lg p-4">
            <p className="text-xs text-[#A0A7B8] uppercase tracking-wide mb-2">New Dispatches</p>
            <p className="text-3xl font-bold text-teal-400">1,842</p>
          </div>
          <div className="bg-[#1A1F3A] border border-[#2D3456] rounded-lg p-4">
            <p className="text-xs text-[#A0A7B8] uppercase tracking-wide mb-2">Listening Time</p>
            <p className="text-3xl font-bold text-teal-400">847h</p>
          </div>
          <div className="bg-[#1A1F3A] border border-[#2D3456] rounded-lg p-4">
            <p className="text-xs text-[#A0A7B8] uppercase tracking-wide mb-2">Sources Tracked</p>
            <p className="text-3xl font-bold text-teal-400">287</p>
          </div>
          <div className="bg-[#1A1F3A] border border-[#2D3456] rounded-lg p-4">
            <p className="text-xs text-[#A0A7B8] uppercase tracking-wide mb-2">Topics Covered</p>
            <p className="text-3xl font-bold text-teal-400">64</p>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex gap-4 mb-8 border-b border-[#2D3456]">
          {['feed', 'trending', 'sources'].map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`px-4 py-3 font-medium text-sm transition-colors border-b-2 ${
                activeTab === tab
                  ? 'border-teal-400 text-teal-400'
                  : 'border-transparent text-[#A0A7B8] hover:text-[#E8EAEF]'
              }`}
            >
              {tab.charAt(0).toUpperCase() + tab.slice(1)}
            </button>
          ))}
        </div>

        {/* Feed */}
        {activeTab === 'feed' && (
          <div className="bg-[#1A1F3A] border border-[#2D3456] rounded-lg p-8">
            <h2 className="text-lg font-semibold mb-6">News & Audio Feed</h2>
            <div className="space-y-4">
              {[
                { id: 1, title: 'AI Safety Frameworks Update', source: 'Tech Today', duration: '12:34', time: '2h ago', category: 'AI' },
                { id: 2, title: 'Quantum Breakthrough Analysis', source: 'Science Hour', duration: '28:15', time: '4h ago', category: 'Science' },
                { id: 3, title: 'Global Tech Market Trends', source: 'Business Report', duration: '18:42', time: '6h ago', category: 'Business' },
                { id: 4, title: 'Neural Interface Development', source: 'Innovation Watch', duration: '22:08', time: '8h ago', category: 'Tech' },
                { id: 5, title: 'Autonomous Systems Ethics', source: 'Ethics Matters', duration: '15:53', time: '10h ago', category: 'Ethics' },
              ].map((item) => (
                <div
                  key={item.id}
                  className="bg-[#0F1220] rounded p-4 border border-teal-500/20 hover:border-teal-500/40 transition-colors"
                >
                  <div className="flex items-start gap-4">
                    <button
                      onClick={() => setPlayingId(playingId === item.id ? null : item.id)}
                      className="flex-shrink-0 w-12 h-12 rounded-lg bg-teal-500/20 border border-teal-500/50 flex items-center justify-center hover:bg-teal-500/30 transition-colors"
                    >
                      <svg
                        className="w-6 h-6 text-teal-400"
                        fill={playingId === item.id ? 'currentColor' : 'none'}
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        {playingId === item.id ? (
                          <rect x="6" y="4" width="4" height="16" fill="currentColor" />
                        ) : null}
                        {playingId === item.id ? (
                          <rect x="14" y="4" width="4" height="16" fill="currentColor" />
                        ) : (
                          <path d="M8 5v14l11-7z" />
                        )}
                      </svg>
                    </button>
                    <div className="flex-1 min-w-0">
                      <h3 className="font-semibold text-[#E8EAEF] mb-1">{item.title}</h3>
                      <div className="flex items-center gap-2 text-xs text-[#A0A7B8] mb-2">
                        <span>{item.source}</span>
                        <span>•</span>
                        <span className="text-teal-400">{item.duration}</span>
                        <span>•</span>
                        <span>{item.time}</span>
                      </div>
                      <span className="inline-block px-2 py-1 text-xs bg-teal-500/20 text-teal-400 rounded border border-teal-500/30">
                        {item.category}
                      </span>
                    </div>
                  </div>
                  {playingId === item.id && (
                    <div className="mt-4 pt-4 border-t border-teal-500/20">
                      <div className="flex items-center gap-2">
                        <div className="flex-1 h-1 bg-[#1A1F3A] rounded overflow-hidden">
                          <div className="h-full bg-gradient-to-r from-teal-600 to-teal-400 w-1/3" />
                        </div>
                        <span className="text-xs text-[#A0A7B8]">4:12 / 12:34</span>
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Trending */}
        {activeTab === 'trending' && (
          <div className="bg-[#1A1F3A] border border-[#2D3456] rounded-lg p-8">
            <h2 className="text-lg font-semibold mb-6">Trending Topics</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {[
                { topic: 'Artificial Intelligence', mentions: 1247, trend: '+34%', color: 'from-teal-600 to-teal-400' },
                { topic: 'Climate Science', mentions: 892, trend: '+18%', color: 'from-cyan-600 to-cyan-400' },
                { topic: 'Space Exploration', mentions: 756, trend: '+42%', color: 'from-blue-600 to-blue-400' },
                { topic: 'Biotechnology', mentions: 634, trend: '+26%', color: 'from-teal-600 to-teal-400' },
                { topic: 'Renewable Energy', mentions: 512, trend: '+15%', color: 'from-green-600 to-green-400' },
                { topic: 'Digital Privacy', mentions: 487, trend: '+31%', color: 'from-teal-600 to-teal-400' },
              ].map((item, i) => (
                <div key={i} className="bg-[#0F1220] rounded p-4 border border-teal-500/20">
                  <div className="flex justify-between items-start mb-3">
                    <div>
                      <p className="font-semibold text-[#E8EAEF]">{item.topic}</p>
                      <p className="text-xs text-[#A0A7B8]">{item.mentions} mentions</p>
                    </div>
                    <span className="text-teal-400 text-sm font-mono">{item.trend}</span>
                  </div>
                  <div className="w-full h-1 bg-[#1A1F3A] rounded overflow-hidden">
                    <div className={`h-full bg-gradient-to-r ${item.color}`} style={{ width: `${(item.mentions / 1247) * 100}%` }} />
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Sources */}
        {activeTab === 'sources' && (
          <div className="bg-[#1A1F3A] border border-[#2D3456] rounded-lg p-8">
            <h2 className="text-lg font-semibold mb-6">News Sources</h2>
            <div className="space-y-3">
              {[
                { name: 'Tech Today', category: 'Technology', reliability: 98, articles: 342 },
                { name: 'Science Hour', category: 'Science', reliability: 96, articles: 287 },
                { name: 'Business Report', category: 'Finance', reliability: 94, articles: 456 },
                { name: 'Innovation Watch', category: 'Startups', reliability: 92, articles: 189 },
                { name: 'Ethics Matters', category: 'Policy', reliability: 91, articles: 143 },
                { name: 'Global News', category: 'General', reliability: 89, articles: 612 },
              ].map((source, i) => (
                <div key={i} className="bg-[#0F1220] rounded p-4 border border-teal-500/20">
                  <div className="flex items-center justify-between mb-2">
                    <div>
                      <p className="font-semibold text-[#E8EAEF]">{source.name}</p>
                      <p className="text-xs text-[#A0A7B8]">{source.category}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-teal-400 font-mono text-sm">{source.reliability}%</p>
                      <p className="text-xs text-[#A0A7B8]">{source.articles} articles</p>
                    </div>
                  </div>
                  <div className="w-full h-1 bg-[#1A1F3A] rounded overflow-hidden">
                    <div className="h-full bg-gradient-to-r from-teal-600 to-teal-400" style={{ width: `${source.reliability}%` }} />
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
