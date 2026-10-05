'use client';

import React, { useState } from 'react';
import Link from 'next/link';

export default function State8Page() {
  const [activeTab, setActiveTab] = useState('waveform');

  // Mock waveform data - 60 frequency bins
  const waveformData = Array.from({ length: 60 }, () => Math.random() * 0.9 + 0.1);

  return (
    <div className="min-h-screen bg-gradient-to-br from-[#0A0E27] to-[#1A1F3A] text-[#E8EAEF]">
      {/* Header */}
      <div className="border-b border-[#2D3456] bg-[#0F1220]/50 backdrop-blur">
        <div className="max-w-7xl mx-auto px-6 py-6">
          <Link href="/plate8" className="text-magenta-400 hover:text-magenta-300 text-sm mb-4 inline-block">
            ← Back to Dashboard
          </Link>
          <div className="flex items-center gap-3 mb-2">
            <span className="text-4xl">🎙️</span>
            <div>
              <h1 className="text-3xl font-bold">State8</h1>
              <p className="text-[#A0A7B8]">Real-time Voice & Audio Analysis</p>
            </div>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="max-w-7xl mx-auto px-6 py-12">
        {/* Stats Grid */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-12">
          <div className="bg-[#1A1F3A] border border-[#2D3456] rounded-lg p-4">
            <p className="text-xs text-[#A0A7B8] uppercase tracking-wide mb-2">Session Duration</p>
            <p className="text-3xl font-bold text-magenta-400">2h 14m</p>
          </div>
          <div className="bg-[#1A1F3A] border border-[#2D3456] rounded-lg p-4">
            <p className="text-xs text-[#A0A7B8] uppercase tracking-wide mb-2">Transcription Accuracy</p>
            <p className="text-3xl font-bold text-magenta-400">98.2%</p>
          </div>
          <div className="bg-[#1A1F3A] border border-[#2D3456] rounded-lg p-4">
            <p className="text-xs text-[#A0A7B8] uppercase tracking-wide mb-2">Words Transcribed</p>
            <p className="text-3xl font-bold text-magenta-400">8,247</p>
          </div>
          <div className="bg-[#1A1F3A] border border-[#2D3456] rounded-lg p-4">
            <p className="text-xs text-[#A0A7B8] uppercase tracking-wide mb-2">Avg. Confidence</p>
            <p className="text-3xl font-bold text-magenta-400">94.7%</p>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex gap-4 mb-8 border-b border-[#2D3456]">
          {['waveform', 'timeline', 'insights'].map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`px-4 py-3 font-medium text-sm transition-colors border-b-2 ${
                activeTab === tab
                  ? 'border-magenta-400 text-magenta-400'
                  : 'border-transparent text-[#A0A7B8] hover:text-[#E8EAEF]'
              }`}
            >
              {tab.charAt(0).toUpperCase() + tab.slice(1)}
            </button>
          ))}
        </div>

        {/* Waveform Visualization */}
        {activeTab === 'waveform' && (
          <div className="bg-[#1A1F3A] border border-[#2D3456] rounded-lg p-8">
            <h2 className="text-lg font-semibold mb-6">Real-time Frequency Spectrum</h2>
            <div className="h-64 flex items-end justify-center gap-1 bg-[#0F1220] rounded p-4">
              {waveformData.map((value, i) => (
                <div
                  key={i}
                  className="flex-1 bg-gradient-to-t from-magenta-500 to-magenta-300 rounded-t opacity-75 hover:opacity-100 transition-opacity"
                  style={{
                    height: `${value * 100}%`,
                    minHeight: '4px',
                  }}
                  title={`Frequency ${i + 1}: ${(value * 100).toFixed(1)}%`}
                />
              ))}
            </div>
            <p className="text-xs text-[#A0A7B8] mt-4">
              60-band frequency spectrum with real-time updates. Peak frequencies indicate dominant phonetic content.
            </p>
          </div>
        )}

        {/* Timeline */}
        {activeTab === 'timeline' && (
          <div className="bg-[#1A1F3A] border border-[#2D3456] rounded-lg p-8">
            <h2 className="text-lg font-semibold mb-6">Transcription Timeline</h2>
            <div className="space-y-4">
              {[
                { time: '0:00', text: 'Hello, this is a test transcription.', confidence: 99 },
                { time: '0:05', text: 'The system is capturing audio in real-time.', confidence: 97 },
                { time: '0:12', text: 'Accuracy is measured with confidence scores.', confidence: 95 },
                { time: '0:19', text: 'All segments are stored for future reference.', confidence: 98 },
              ].map((segment, i) => (
                <div key={i} className="bg-[#0F1220] rounded p-4 border border-magenta-500/20">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm font-mono text-magenta-400">{segment.time}</span>
                    <span className="text-xs text-[#A0A7B8]">{segment.confidence}% confidence</span>
                  </div>
                  <p className="text-[#E8EAEF]">{segment.text}</p>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Insights */}
        {activeTab === 'insights' && (
          <div className="bg-[#1A1F3A] border border-[#2D3456] rounded-lg p-8">
            <h2 className="text-lg font-semibold mb-6">Audio Insights</h2>
            <div className="space-y-4">
              <div className="bg-[#0F1220] rounded p-4">
                <p className="text-sm font-semibold text-magenta-400 mb-2">Speech Characteristics</p>
                <ul className="text-sm text-[#A0A7B8] space-y-1">
                  <li>• Average speech rate: 142 words/minute</li>
                  <li>• Detected language: English (US)</li>
                  <li>• Background noise level: Low (-25dB)</li>
                  <li>• Audio clarity: Excellent</li>
                </ul>
              </div>
              <div className="bg-[#0F1220] rounded p-4">
                <p className="text-sm font-semibold text-magenta-400 mb-2">Performance Metrics</p>
                <ul className="text-sm text-[#A0A7B8] space-y-1">
                  <li>• Model inference: 45ms average</li>
                  <li>• Real-time factor: 0.12x</li>
                  <li>• API latency: 32ms</li>
                  <li>• Quality score: 9.7/10</li>
                </ul>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
