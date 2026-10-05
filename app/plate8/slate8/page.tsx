'use client';

import React, { useState } from 'react';
import Link from 'next/link';

export default function Slate8Page() {
  const [activeTab, setActiveTab] = useState('discover');

  return (
    <div className="min-h-screen bg-gradient-to-br from-[#0A0E27] to-[#1A1F3A] text-[#E8EAEF]">
      {/* Header */}
      <div className="border-b border-[#2D3456] bg-[#0F1220]/50 backdrop-blur">
        <div className="max-w-7xl mx-auto px-6 py-6">
          <Link href="/plate8" className="text-purple-400 hover:text-purple-300 text-sm mb-4 inline-block">
            ← Back to Dashboard
          </Link>
          <div className="flex items-center gap-3 mb-2">
            <span className="text-4xl">🎬</span>
            <div>
              <h1 className="text-3xl font-bold">Slate8</h1>
              <p className="text-[#A0A7B8]">Video Discovery & Curation</p>
            </div>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="max-w-7xl mx-auto px-6 py-12">
        {/* Stats Grid */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-12">
          <div className="bg-[#1A1F3A] border border-[#2D3456] rounded-lg p-4">
            <p className="text-xs text-[#A0A7B8] uppercase tracking-wide mb-2">Videos Added</p>
            <p className="text-3xl font-bold text-purple-400">2,847</p>
          </div>
          <div className="bg-[#1A1F3A] border border-[#2D3456] rounded-lg p-4">
            <p className="text-xs text-[#A0A7B8] uppercase tracking-wide mb-2">Total Watch Time</p>
            <p className="text-3xl font-bold text-purple-400">1,247h</p>
          </div>
          <div className="bg-[#1A1F3A] border border-[#2D3456] rounded-lg p-4">
            <p className="text-xs text-[#A0A7B8] uppercase tracking-wide mb-2">Avg Rating</p>
            <p className="text-3xl font-bold text-purple-400">4.6★</p>
          </div>
          <div className="bg-[#1A1F3A] border border-[#2D3456] rounded-lg p-4">
            <p className="text-xs text-[#A0A7B8] uppercase tracking-wide mb-2">Collections</p>
            <p className="text-3xl font-bold text-purple-400">32</p>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex gap-4 mb-8 border-b border-[#2D3456]">
          {['discover', 'trending', 'watch'].map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`px-4 py-3 font-medium text-sm transition-colors border-b-2 ${
                activeTab === tab
                  ? 'border-purple-400 text-purple-400'
                  : 'border-transparent text-[#A0A7B8] hover:text-[#E8EAEF]'
              }`}
            >
              {tab.charAt(0).toUpperCase() + tab.slice(1)}
            </button>
          ))}
        </div>

        {/* Discover */}
        {activeTab === 'discover' && (
          <div className="bg-[#1A1F3A] border border-[#2D3456] rounded-lg p-8">
            <h2 className="text-lg font-semibold mb-6">Recommended Videos</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {[
                { title: 'The Art of Motion Design', creator: 'Design Horizons', rating: 4.8, views: 2.3 },
                { title: 'Neural Networks Explained', creator: 'AI Fundamentals', rating: 4.7, views: 5.1 },
                { title: 'Cinematic Storytelling', creator: 'Film Academy', rating: 4.9, views: 1.8 },
                { title: 'Data Visualization Secrets', creator: 'Visual Intelligence', rating: 4.6, views: 3.2 },
                { title: 'Advanced Synthesis', creator: 'Sound Design Pro', rating: 4.8, views: 2.9 },
                { title: 'Creative Coding', creator: 'Dev Artistry', rating: 4.7, views: 4.1 },
              ].map((video, i) => (
                <div key={i} className="bg-[#0F1220] rounded-lg border border-purple-500/20 overflow-hidden hover:border-purple-500/40 transition-colors">
                  <div className="aspect-video bg-gradient-to-br from-purple-900/30 to-purple-600/20 flex items-center justify-center">
                    <svg className="w-12 h-12 text-purple-400" fill="currentColor" viewBox="0 0 24 24">
                      <path d="M8 5v14l11-7z" />
                    </svg>
                  </div>
                  <div className="p-4">
                    <h3 className="font-semibold text-sm mb-1 text-[#E8EAEF]">{video.title}</h3>
                    <p className="text-xs text-[#A0A7B8] mb-3">{video.creator}</p>
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-purple-400 font-medium">★ {video.rating}</span>
                      <span className="text-[#A0A7B8]">{video.views}M views</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Trending */}
        {activeTab === 'trending' && (
          <div className="bg-[#1A1F3A] border border-[#2D3456] rounded-lg p-8">
            <h2 className="text-lg font-semibold mb-6">Trending This Week</h2>
            <div className="space-y-3">
              {[
                { rank: 1, title: 'Breakthrough in Quantum Computing', growth: '+342%', duration: '24:15' },
                { rank: 2, title: 'The Future of AI Art', growth: '+287%', duration: '18:42' },
                { rank: 3, title: 'Autonomous Systems Demo', growth: '+256%', duration: '31:08' },
                { rank: 4, title: 'Neural Interface Keynote', growth: '+198%', duration: '45:33' },
                { rank: 5, title: 'Creative AI Collaboration', growth: '+167%', duration: '22:19' },
                { rank: 6, title: 'Digital Ethics Panel', growth: '+145%', duration: '38:47' },
              ].map((item) => (
                <div key={item.rank} className="bg-[#0F1220] rounded p-4 border border-purple-500/20 flex items-center justify-between">
                  <div className="flex items-center gap-4 flex-1">
                    <div className="text-2xl font-bold text-purple-400 w-8">#{item.rank}</div>
                    <div className="flex-1">
                      <p className="font-medium text-[#E8EAEF]">{item.title}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-4 text-sm">
                    <span className="text-purple-400 font-mono">{item.growth}</span>
                    <span className="text-[#A0A7B8]">{item.duration}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Watch History */}
        {activeTab === 'watch' && (
          <div className="bg-[#1A1F3A] border border-[#2D3456] rounded-lg p-8">
            <h2 className="text-lg font-semibold mb-6">Watch History</h2>
            <div className="space-y-4">
              <div className="bg-[#0F1220] rounded p-4">
                <p className="text-sm font-semibold text-purple-400 mb-4">By Category</p>
                <div className="space-y-3">
                  {[
                    { category: 'Technology', count: 847, pct: 38 },
                    { category: 'Creative Arts', count: 523, pct: 24 },
                    { category: 'Science & Nature', count: 412, pct: 19 },
                    { category: 'Music & Audio', count: 287, pct: 13 },
                    { category: 'Other', count: 98, pct: 6 },
                  ].map((stat) => (
                    <div key={stat.category}>
                      <div className="flex justify-between mb-1">
                        <span className="text-xs text-[#A0A7B8]">{stat.category}</span>
                        <span className="text-purple-400 font-mono text-xs">{stat.count}</span>
                      </div>
                      <div className="w-full h-2 bg-[#1A1F3A] rounded overflow-hidden">
                        <div className="h-full bg-gradient-to-r from-purple-600 to-purple-400" style={{ width: `${stat.pct * 3.33}%` }} />
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="bg-[#0F1220] rounded p-4">
                <p className="text-sm font-semibold text-purple-400 mb-3">Recently Watched</p>
                <div className="space-y-2">
                  {['Advanced Synthesis (32:15)', 'Neural Networks Explained (28:47)', 'Cinematic Storytelling (45:22)', 'Data Visualization (19:53)', 'Creative Coding (56:11)'].map((title, i) => (
                    <div key={i} className="flex items-center justify-between text-xs">
                      <span className="text-[#A0A7B8]">{title}</span>
                      <span className="text-purple-400">✓</span>
                    </div>
                  ))}
                </div>
              </div>

              <div className="bg-[#0F1220] rounded p-4">
                <p className="text-sm font-semibold text-purple-400 mb-3">Watch Time Analytics</p>
                <div className="space-y-2">
                  <div className="flex justify-between text-xs">
                    <span className="text-[#A0A7B8]">Total This Month</span>
                    <span className="text-purple-400 font-mono">127.3h</span>
                  </div>
                  <div className="flex justify-between text-xs">
                    <span className="text-[#A0A7B8]">Daily Average</span>
                    <span className="text-purple-400 font-mono">4.1h</span>
                  </div>
                  <div className="flex justify-between text-xs">
                    <span className="text-[#A0A7B8]">Most Active Day</span>
                    <span className="text-purple-400 font-mono">Saturday (8.4h)</span>
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
