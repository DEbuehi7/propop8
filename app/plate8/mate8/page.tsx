'use client';

import React, { useState } from 'react';
import Link from 'next/link';

export default function Mate8Page() {
  const [activeTab, setActiveTab] = useState('position');

  // Mock chess position data
  const pieces = [
    { type: 'shield', pos: 'e4', value: 3, color: 'cyan' },
    { type: 'shield', pos: 'd4', value: 3, color: 'cyan' },
    { type: 'sword', pos: 'f5', value: 5, color: 'cyan' },
    { type: 'sword', pos: 'g5', value: 5, color: 'cyan' },
    { type: 'shield', pos: 'e5', value: 3, color: 'red' },
    { type: 'shield', pos: 'd5', value: 3, color: 'red' },
    { type: 'sword', pos: 'f4', value: 5, color: 'red' },
    { type: 'sword', pos: 'c3', value: 5, color: 'red' },
  ];

  return (
    <div className="min-h-screen bg-gradient-to-br from-[#0A0E27] to-[#1A1F3A] text-[#E8EAEF]">
      {/* Header */}
      <div className="border-b border-[#2D3456] bg-[#0F1220]/50 backdrop-blur">
        <div className="max-w-7xl mx-auto px-6 py-6">
          <Link href="/plate8" className="text-cyan-400 hover:text-cyan-300 text-sm mb-4 inline-block">
            ← Back to Dashboard
          </Link>
          <div className="flex items-center gap-3 mb-2">
            <span className="text-4xl">♟️</span>
            <div>
              <h1 className="text-3xl font-bold">Mate8</h1>
              <p className="text-[#A0A7B8]">AI-Powered Chess Analysis</p>
            </div>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="max-w-7xl mx-auto px-6 py-12">
        {/* Stats Grid */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-12">
          <div className="bg-[#1A1F3A] border border-[#2D3456] rounded-lg p-4">
            <p className="text-xs text-[#A0A7B8] uppercase tracking-wide mb-2">Games Analyzed</p>
            <p className="text-3xl font-bold text-cyan-400">247</p>
          </div>
          <div className="bg-[#1A1F3A] border border-[#2D3456] rounded-lg p-4">
            <p className="text-xs text-[#A0A7B8] uppercase tracking-wide mb-2">Avg. Evaluation</p>
            <p className="text-3xl font-bold text-cyan-400">+2.1</p>
          </div>
          <div className="bg-[#1A1F3A] border border-[#2D3456] rounded-lg p-4">
            <p className="text-xs text-[#A0A7B8] uppercase tracking-wide mb-2">Best Game</p>
            <p className="text-3xl font-bold text-cyan-400">+5.8</p>
          </div>
          <div className="bg-[#1A1F3A] border border-[#2D3456] rounded-lg p-4">
            <p className="text-xs text-[#A0A7B8] uppercase tracking-wide mb-2">Engine Used</p>
            <p className="text-lg font-bold text-cyan-400">Stockfish 16</p>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex gap-4 mb-8 border-b border-[#2D3456]">
          {['position', 'analysis', 'games'].map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`px-4 py-3 font-medium text-sm transition-colors border-b-2 ${
                activeTab === tab
                  ? 'border-cyan-400 text-cyan-400'
                  : 'border-transparent text-[#A0A7B8] hover:text-[#E8EAEF]'
              }`}
            >
              {tab.charAt(0).toUpperCase() + tab.slice(1)}
            </button>
          ))}
        </div>

        {/* Position Visualization - Sword & Shield */}
        {activeTab === 'position' && (
          <div className="bg-[#1A1F3A] border border-[#2D3456] rounded-lg p-8">
            <h2 className="text-lg font-semibold mb-6">Sword & Shield Analysis</h2>
            <p className="text-sm text-[#A0A7B8] mb-8">
              Circles represent defensive pieces (shields), vectors represent attacking pieces (swords)
            </p>

            <div className="flex gap-12 items-start">
              {/* White Position */}
              <div className="flex-1">
                <h3 className="text-cyan-400 font-semibold mb-6">White to Move</h3>
                <svg viewBox="0 0 400 400" className="w-full max-w-sm bg-[#0F1220] rounded border border-cyan-500/30">
                  {/* Grid lines */}
                  {Array.from({ length: 9 }).map((_, i) => (
                    <line key={`h${i}`} x1={i * 40} y1="0" x2={i * 40} y2="400" stroke="#2D3456" strokeWidth="1" />
                  ))}
                  {Array.from({ length: 9 }).map((_, i) => (
                    <line key={`v${i}`} x1="0" y1={i * 40} x2="400" y2={i * 40} stroke="#2D3456" strokeWidth="1" />
                  ))}

                  {/* Defense circles (shields) - Cyan */}
                  <circle cx="160" cy="160" r="20" fill="none" stroke="#06d6ff" strokeWidth="3" opacity="0.7" />
                  <text x="160" y="167" textAnchor="middle" fill="#06d6ff" fontSize="12" fontWeight="bold">
                    e4
                  </text>

                  <circle cx="120" cy="160" r="20" fill="none" stroke="#06d6ff" strokeWidth="3" opacity="0.7" />
                  <text x="120" y="167" textAnchor="middle" fill="#06d6ff" fontSize="12" fontWeight="bold">
                    d4
                  </text>

                  {/* Attack vectors (swords) - Cyan */}
                  <line x1="200" y1="120" x2="260" y2="60" stroke="#06d6ff" strokeWidth="3" markerEnd="url(#arrowCyan)" opacity="0.8" />
                  <text x="220" y="80" fill="#06d6ff" fontSize="11">
                    f5
                  </text>

                  <line x1="240" y1="120" x2="300" y2="60" stroke="#06d6ff" strokeWidth="3" markerEnd="url(#arrowCyan)" opacity="0.8" />
                  <text x="270" y="80" fill="#06d6ff" fontSize="11">
                    g5
                  </text>

                  {/* Arrow markers */}
                  <defs>
                    <marker id="arrowCyan" markerWidth="10" markerHeight="10" refX="9" refY="3" orient="auto" markerUnits="strokeWidth">
                      <path d="M0,0 L0,6 L9,3 z" fill="#06d6ff" />
                    </marker>
                  </defs>

                  {/* Coordinates */}
                  {Array.from({ length: 8 }).map((_, i) => (
                    <text key={`file${i}`} x={i * 50 + 25} y="390" textAnchor="middle" fill="#A0A7B8" fontSize="10">
                      {String.fromCharCode(97 + i)}
                    </text>
                  ))}
                  {Array.from({ length: 8 }).map((_, i) => (
                    <text key={`rank${i}`} x="10" y={400 - i * 50 - 15} textAnchor="middle" fill="#A0A7B8" fontSize="10">
                      {8 - i}
                    </text>
                  ))}
                </svg>
              </div>

              {/* Black Position */}
              <div className="flex-1">
                <h3 className="text-red-400 font-semibold mb-6">Black Position</h3>
                <svg viewBox="0 0 400 400" className="w-full max-w-sm bg-[#0F1220] rounded border border-red-500/30">
                  {/* Grid lines */}
                  {Array.from({ length: 9 }).map((_, i) => (
                    <line key={`h${i}`} x1={i * 40} y1="0" x2={i * 40} y2="400" stroke="#2D3456" strokeWidth="1" />
                  ))}
                  {Array.from({ length: 9 }).map((_, i) => (
                    <line key={`v${i}`} x1="0" y1={i * 40} x2="400" y2={i * 40} stroke="#2D3456" strokeWidth="1" />
                  ))}

                  {/* Defense circles - Red */}
                  <circle cx="160" cy="200" r="20" fill="none" stroke="#ff7a63" strokeWidth="3" opacity="0.7" />
                  <text x="160" y="207" textAnchor="middle" fill="#ff7a63" fontSize="12" fontWeight="bold">
                    e5
                  </text>

                  <circle cx="120" cy="200" r="20" fill="none" stroke="#ff7a63" strokeWidth="3" opacity="0.7" />
                  <text x="120" y="207" textAnchor="middle" fill="#ff7a63" fontSize="12" fontWeight="bold">
                    d5
                  </text>

                  {/* Attack vectors - Red */}
                  <line x1="200" y1="240" x2="260" y2="300" stroke="#ff7a63" strokeWidth="3" markerEnd="url(#arrowRed)" opacity="0.8" />
                  <text x="220" y="280" fill="#ff7a63" fontSize="11">
                    f4
                  </text>

                  <line x1="80" y1="240" x2="40" y2="280" stroke="#ff7a63" strokeWidth="3" markerEnd="url(#arrowRed)" opacity="0.8" />
                  <text x="50" y="270" fill="#ff7a63" fontSize="11">
                    c3
                  </text>

                  <defs>
                    <marker id="arrowRed" markerWidth="10" markerHeight="10" refX="9" refY="3" orient="auto" markerUnits="strokeWidth">
                      <path d="M0,0 L0,6 L9,3 z" fill="#ff7a63" />
                    </marker>
                  </defs>

                  {/* Coordinates */}
                  {Array.from({ length: 8 }).map((_, i) => (
                    <text key={`file${i}`} x={i * 50 + 25} y="390" textAnchor="middle" fill="#A0A7B8" fontSize="10">
                      {String.fromCharCode(97 + i)}
                    </text>
                  ))}
                  {Array.from({ length: 8 }).map((_, i) => (
                    <text key={`rank${i}`} x="10" y={400 - i * 50 - 15} textAnchor="middle" fill="#A0A7B8" fontSize="10">
                      {8 - i}
                    </text>
                  ))}
                </svg>
              </div>
            </div>
          </div>
        )}

        {/* Analysis Tab */}
        {activeTab === 'analysis' && (
          <div className="bg-[#1A1F3A] border border-[#2D3456] rounded-lg p-8">
            <h2 className="text-lg font-semibold mb-6">Game Analysis</h2>
            <div className="space-y-4">
              {[
                { move: '1. e4 e5', eval: '+0.3', bestMove: 'e4', depth: 25 },
                { move: '2. Nf3 Nc6', eval: '+0.4', bestMove: 'Nf3', depth: 26 },
                { move: '3. Bb5 a6', eval: '+0.5', bestMove: 'Bb5', depth: 24 },
              ].map((analysis, i) => (
                <div key={i} className="bg-[#0F1220] rounded p-4 border border-cyan-500/20">
                  <div className="flex items-center justify-between">
                    <span className="font-mono text-cyan-400">{analysis.move}</span>
                    <div className="text-right">
                      <p className="text-sm text-[#A0A7B8]">Eval: {analysis.eval}</p>
                      <p className="text-xs text-[#A0A7B8]">Depth {analysis.depth}</p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Games Tab */}
        {activeTab === 'games' && (
          <div className="bg-[#1A1F3A] border border-[#2D3456] rounded-lg p-8">
            <h2 className="text-lg font-semibold mb-6">Recent Games</h2>
            <div className="space-y-3">
              {[
                { result: 'Win', opponent: 'Stockfish 16', rating: 3200, date: 'Oct 5' },
                { result: 'Draw', opponent: 'AlphaZero', rating: 'Super-GM', date: 'Oct 4' },
                { result: 'Win', opponent: 'Kasparov Sim', rating: 2850, date: 'Oct 3' },
              ].map((game, i) => (
                <div key={i} className="flex items-center justify-between bg-[#0F1220] rounded p-4 border border-cyan-500/20">
                  <div>
                    <p className="font-semibold text-[#E8EAEF]">{game.opponent}</p>
                    <p className="text-xs text-[#A0A7B8]">Rating: {game.rating}</p>
                  </div>
                  <div className="text-right">
                    <p className={`font-bold ${game.result === 'Win' ? 'text-cyan-400' : 'text-[#A0A7B8]'}`}>{game.result}</p>
                    <p className="text-xs text-[#A0A7B8]">{game.date}</p>
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
