'use client';

/**
 * components/brand/LivingEight.tsx
 * ----------------------------------------------------------------------------
 * The "8" of the PropOps8 wordmark, drawn as two loops, and the status beside
 * it. Both read the visitor's latest calculator result (lib/brand/markStore.ts)
 * and render it; neither decides anything (canon GOV-01).
 *
 *   idle       solid outline in the wordmark's white
 *   cost       pink, and the lower bowl fills: money is pooling somewhere
 *   healthy    mint, clean outline
 *   uncertain  grey dotted outline: the numbers can't support a result
 *
 * Motion is one moment, and only when the state changes: the loops redraw in
 * the new colour, the bowl fills for a leak, the status fades in. Nothing
 * loops or cycles. With reduced motion asked for, the new state simply
 * appears (canon VIS-02).
 */

import { useId } from 'react';
import { DISPLAY, MONO, PALETTE, hexA } from '@/lib/chaosTokens';
import { IDLE, MARK_LOOK, markSentence, markWords, type MarkLook } from '@/lib/brand/markState';
import { useMarkRecord } from '@/lib/brand/markStore';

/** Shared CSS for the 8 and its status. Rendered once, by SiteHeader. */
export const LIVING_EIGHT_CSS = `
  .living8 { display: inline-block; height: 0.76em; width: 0.517em; margin-left: 0.06em; overflow: visible; }
  .living8 .loop { fill: none; stroke-width: 18; stroke-linecap: round; }
  .living8 .moved .loop.solid { stroke-dasharray: 1 1; }
  .living8 .loop.dotted { stroke-width: 11; stroke-dasharray: 0.0001 0.166667; }
  .living8 .pool { transform-box: fill-box; transform-origin: 50% 100%; }
  .living8 .moved .loop.solid { animation: living8-draw 640ms cubic-bezier(.6,0,.2,1) both; }
  .living8 .moved .loop.solid.lower { animation-delay: 120ms; }
  .living8 .moved .loop.dotted { animation: living8-fade 420ms ease-out both; }
  .living8 .moved .pool { animation: living8-fill 520ms cubic-bezier(.3,0,.2,1) 420ms both; }
  .living8-chip { animation: living8-chip 260ms ease-out both; }
  @keyframes living8-draw { from { stroke-dashoffset: 1; } to { stroke-dashoffset: 0; } }
  @keyframes living8-fade { from { opacity: 0; } to { opacity: 1; } }
  @keyframes living8-fill { from { transform: scaleY(0); } to { transform: scaleY(1); } }
  @keyframes living8-chip { from { opacity: 0; transform: translateY(-2px); } to { opacity: 1; transform: none; } }
  @media (prefers-reduced-motion: reduce) {
    .living8 *, .living8-chip { animation: none !important; }
  }
`;

/*
 * Geometry on a 68 x 100 grid: a narrower upper loop over a wider lower one,
 * merged at the waist. Stroke 18 matches the stems of the wordmark's Inter
 * Black; the dotted state thins to 11 so its six dots a loop stay apart.
 */
const UPPER = { cx: 34, cy: 24, rx: 16, ry: 15 };
const LOWER = { cx: 34, cy: 66, rx: 25, ry: 25 };

export function LivingEight({ plain = false }: { plain?: boolean }) {
  const record = useMarkRecord();
  const mark = plain ? IDLE : record.mark;
  const look = MARK_LOOK[mark.kind];
  const clip = useId();
  const stroke = look.stroke === 'dashed' ? 'dotted' : 'solid';
  return (
    <>
      {/* The wordmark still reads "PropOps8" to a screen reader. */}
      <span className="sr-only">8</span>
      <svg className="living8" viewBox="0 0 68 100" aria-hidden="true" focusable="false" data-mark={mark.kind}>
        {/* Keyed by state: a change remounts the group, which replays the one transition. */}
        <g key={mark.kind} className={mark.kind === 'idle' ? undefined : 'moved'}>
          {look.fillLower && (
            <>
              <clipPath id={clip}>
                <ellipse {...LOWER} />
              </clipPath>
              {/* The clip sits on the group, so the rect rises inside a still bowl. */}
              <g clipPath={`url(#${clip})`}>
                <rect
                  className="pool"
                  x={LOWER.cx - LOWER.rx}
                  y={LOWER.cy - LOWER.ry}
                  width={LOWER.rx * 2}
                  height={LOWER.ry * 2}
                  fill={look.color}
                />
              </g>
            </>
          )}
          <ellipse className={`loop ${stroke}`} {...UPPER} stroke={look.color} pathLength={1} />
          <ellipse className={`loop ${stroke} lower`} {...LOWER} stroke={look.color} pathLength={1} />
        </g>
      </svg>
    </>
  );
}

function StatusIcon({ icon, color }: { icon: MarkLook['icon']; color: string }) {
  if (!icon) return null;
  return (
    <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true" focusable="false" style={{ flexShrink: 0 }}>
      {icon === 'drop' && <path d="M6 1.2C6 1.2 2.4 5.4 2.4 7.9a3.6 3.6 0 0 0 7.2 0C9.6 5.4 6 1.2 6 1.2Z" fill={color} />}
      {icon === 'check' && (
        <polyline points="2.4,6.4 5,9 9.6,3.4" fill="none" stroke={color} strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round" />
      )}
      {icon === 'dots' && [3, 6, 9].map((x) => <circle key={x} cx={x} cy={6.2} r={1.15} fill={color} />)}
    </svg>
  );
}

/**
 * The words beside the 8: "Leak found $1,890", "Healthy 3%", "Not enough data".
 * A polite live region, so a screen reader hears the change once it settles.
 * Kept in the page when idle (empty), because a live region added at the same
 * moment as its text is often not announced.
 */
export function MarkStatus({ className }: { className?: string }) {
  const { mark } = useMarkRecord();
  const look = MARK_LOOK[mark.kind];
  const { label, figure } = markWords(mark);
  const sentence = markSentence(mark);
  return (
    <span role="status" aria-live="polite" className={className}>
      {mark.kind !== 'idle' && (
        <span
          key={mark.kind}
          className="living8-chip"
          title={sentence}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 6,
            padding: '3px 8px 3px 7px',
            border: `1px solid ${hexA(look.color, 0.4)}`,
            background: hexA(look.color, 0.08),
            borderRadius: 4,
            fontFamily: MONO,
            fontSize: 11,
            lineHeight: 1.3,
            whiteSpace: 'nowrap',
          }}
        >
          <StatusIcon icon={look.icon} color={look.color} />
          <span aria-hidden="true" style={{ color: look.color }}>{label}</span>
          {figure && (
            <span aria-hidden="true" style={{ color: PALETTE.bright, fontFamily: DISPLAY, fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>
              {figure}
            </span>
          )}
          <span className="sr-only">{sentence}</span>
        </span>
      )}
    </span>
  );
}
