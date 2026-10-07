'use client';

import React from 'react';

interface Activity {
  time: string;
  text: string;
  color: string;
  label: string;
}

interface ActivityFeedProps {
  activities: Activity[];
}

const colorMap: Record<string, { bg: string; border: string; text: string }> = {
  orange: { bg: 'bg-orange-500/10', border: 'border-orange-500/30', text: 'text-orange-400' },
  cyan: { bg: 'bg-cyan-500/10', border: 'border-cyan-500/30', text: 'text-cyan-400' },
  coral: { bg: 'bg-red-500/10', border: 'border-red-500/30', text: 'text-red-400' },
  magenta: { bg: 'bg-magenta-500/10', border: 'border-magenta-500/30', text: 'text-magenta-400' },
  purple: { bg: 'bg-purple-500/10', border: 'border-purple-500/30', text: 'text-purple-400' },
  teal: { bg: 'bg-teal-500/10', border: 'border-teal-500/30', text: 'text-teal-400' },
};

export default function ActivityFeed({ activities }: ActivityFeedProps) {
  return (
    <div className="space-y-3">
      {activities.map((activity, index) => {
        const colorStyle = colorMap[activity.color] || colorMap.cyan;
        return (
          <div
            key={index}
            className={`${colorStyle.bg} border ${colorStyle.border} rounded-lg p-4 flex items-start gap-4`}
          >
            {/* Timeline dot and line */}
            <div className="flex flex-col items-center pt-1">
              <div className={`w-3 h-3 rounded-full ${colorStyle.text.replace('text-', 'bg-')}`} />
              {index < activities.length - 1 && (
                <div className="w-0.5 h-12 bg-gradient-to-b from-current to-transparent opacity-30 mt-2" />
              )}
            </div>

            {/* Content */}
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1">
                <span className={`text-xs font-semibold ${colorStyle.text} uppercase tracking-wider`}>
                  {activity.label}
                </span>
                <span className="text-xs text-[#A0A7B8]">{activity.time}</span>
              </div>
              <p className="text-sm text-[#E8EAEF]">{activity.text}</p>
            </div>
          </div>
        );
      })}
    </div>
  );
}
