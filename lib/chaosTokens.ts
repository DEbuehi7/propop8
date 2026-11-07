/**
 * lib/chaosTokens.ts
 * ----------------------------------------------------------------------------
 * Design system. Single source of truth for the whole PropOps8 line.
 *
 * NOTE ON THE SPLIT: this file no longer carries a 'use client' directive.
 * The React hooks moved to lib/chaosHooks.ts. That matters because Server
 * Components — app/page.tsx, app/audit/thank-you/page.tsx — need these tokens,
 * and importing a 'use client' module into a Server Component drags React and
 * both hooks into the client bundle for pages that render no interactivity at
 * all. Tokens are strings; they should cost nothing.
 *
 * If you have already wired VacancyBlackHole.tsx or UploadClient.tsx, change
 * their hook imports to:
 *     import { usePrefersReducedMotion, useCountUp } from '@/lib/chaosHooks';
 * Everything else they import stays here.
 *
 * Colour meaning is fixed and is not improvised per surface:
 *   pink  — breached, overdue, over baseline, the thing that costs money
 *   cyan  — needs attention, and the only colour used for actions
 *   mint  — settled, closed, healthy
 *
 * Because cyan is the action colour, never render a CTA in pink. Pink is the
 * alarm; if the alarm and the exit are the same colour, neither reads.
 */

/* -------------------------------------------------------------------------- */
/*  Palette                                                                    */
/* -------------------------------------------------------------------------- */

export const PALETTE = {
  void: '#070b14',
  shell: '#0b1220',
  panel: '#111a2b',
  card: '#161f33',
  track: '#232d42',
  hairline: 'rgba(34, 211, 238, 0.14)',
  label: '#7f8ea8',
  body: '#e6edf7',
  bright: '#f4f8ff',
  pink: '#ff2d6b',
  cyan: '#22d3ee',
  mint: '#4ade80',
} as const;

export const MONO =
  "ui-monospace, 'JetBrains Mono', 'IBM Plex Mono', SFMono-Regular, Menlo, monospace";

export const DISPLAY =
  "'Inter', ui-sans-serif, system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif";

/* -------------------------------------------------------------------------- */
/*  Colour helpers                                                             */
/* -------------------------------------------------------------------------- */

export function hexA(hex: string, alpha: number): string {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`;
}

export function glow(color: string, a = 0.55, b = 0.3): string {
  return `drop-shadow(0 0 7px ${hexA(color, a)}) drop-shadow(0 0 22px ${hexA(color, b)})`;
}

export function textGlow(color: string, a = 0.5): string {
  return `0 0 26px ${hexA(color, a)}`;
}

/* -------------------------------------------------------------------------- */
/*  Deterministic randomness — SSR-safe, same seed means same output           */
/* -------------------------------------------------------------------------- */

export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/* -------------------------------------------------------------------------- */
/*  Formatting                                                                 */
/* -------------------------------------------------------------------------- */

export function money(v: number, currency = '$'): string {
  return `${currency}${Math.round(v).toLocaleString()}`;
}

export function pct(v: number, digits = 1): string {
  return `${v >= 0 ? '+' : ''}${(v * 100).toFixed(digits)}%`;
}

/** Date-only day count. UTC arithmetic so DST never shifts a result. */
export function dayNumber(iso: string): number | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!m) return null;
  const [, y, mo, d] = m;
  const ms = Date.UTC(Number(y), Number(mo) - 1, Number(d));
  return Number.isNaN(ms) ? null : ms / 86400000;
}

export function daysBetween(fromIso: string, toIso: string): number | null {
  const a = dayNumber(fromIso);
  const b = dayNumber(toIso);
  if (a === null || b === null) return null;
  return b - a;
}

/* -------------------------------------------------------------------------- */
/*  Bands                                                                      */
/* -------------------------------------------------------------------------- */

export interface Band {
  min: number;
  label: string;
  color: string;
}

export function bandFor(value: number, bands: Band[]): Band {
  return bands.find((b) => value >= b.min) ?? bands[bands.length - 1];
}

/* -------------------------------------------------------------------------- */
/*  Shared surfaces                                                            */
/* -------------------------------------------------------------------------- */

export const shellStyle: React.CSSProperties = {
  maxWidth: 980,
  background: PALETTE.void,
  borderRadius: 18,
  border: `1px solid ${PALETTE.hairline}`,
  boxShadow: `0 30px 80px -30px ${hexA('#000000', 0.9)}`,
  color: PALETTE.body,
};

export const bodyStyle: React.CSSProperties = {
  background: `radial-gradient(120% 90% at 12% 0%, ${PALETTE.shell} 0%, ${PALETTE.void} 100%)`,
};

export const panelStyle: React.CSSProperties = {
  background: PALETTE.panel,
  borderRadius: 14,
  border: `1px solid ${hexA('#ffffff', 0.05)}`,
};

export const cardStyle: React.CSSProperties = {
  background: PALETTE.card,
  borderRadius: 14,
  border: `1px solid ${hexA('#ffffff', 0.05)}`,
};

export const utilityLabel: React.CSSProperties = {
  fontFamily: MONO,
  letterSpacing: '0.18em',
  color: PALETTE.label,
  fontSize: 11,
  textTransform: 'uppercase',
};

export const eyebrowTab: React.CSSProperties = {
  ...utilityLabel,
  color: PALETTE.cyan,
  padding: '7px 14px',
  borderRadius: 8,
  background: hexA(PALETTE.cyan, 0.06),
  border: `1px solid ${hexA(PALETTE.cyan, 0.22)}`,
};

export const headingStyle: React.CSSProperties = {
  fontFamily: DISPLAY,
  fontWeight: 900,
  fontSize: 'clamp(1.7rem, 4.4vw, 2.6rem)',
  letterSpacing: '-0.02em',
  lineHeight: 1.05,
  color: PALETTE.bright,
};

export function figureStyle(color: string = PALETTE.pink): React.CSSProperties {
  return {
    fontFamily: DISPLAY,
    fontWeight: 900,
    fontSize: 'clamp(2.2rem, 5.5vw, 3.2rem)',
    lineHeight: 1,
    letterSpacing: '-0.03em',
    color,
    textShadow: textGlow(color, color === PALETTE.bright ? 0.2 : 0.5),
  };
}

/** Actions are always cyan. See the note at the top of this file. */
export function ctaStyle(): React.CSSProperties {
  return {
    fontFamily: MONO,
    fontSize: 11.5,
    letterSpacing: '0.1em',
    lineHeight: 1.4,
    fontWeight: 600,
    textTransform: 'uppercase',
    textDecoration: 'none',
    color: '#06202a',
    background: PALETTE.cyan,
    borderRadius: 9,
    padding: '13px 18px',
    boxShadow: `0 0 18px ${hexA(PALETTE.cyan, 0.6)}, 0 0 45px ${hexA(PALETTE.cyan, 0.22)}`,
  };
}

/** Secondary action — outline. Never pink. */
export function ghostCtaStyle(): React.CSSProperties {
  return {
    fontFamily: MONO,
    fontSize: 11.5,
    letterSpacing: '0.1em',
    lineHeight: 1.4,
    fontWeight: 600,
    textTransform: 'uppercase',
    textDecoration: 'none',
    color: PALETTE.bright,
    background: 'transparent',
    borderRadius: 9,
    padding: '13px 18px',
    border: `1px solid ${hexA('#ffffff', 0.22)}`,
  };
}

/** Drop once per page. Covers hover, focus rings, and reduced motion. */
export const sharedCss = `
  .chaos-cta { transition: transform .18s ease, box-shadow .18s ease; }
  .chaos-cta:hover { transform: translateY(-1px); box-shadow: 0 0 26px ${hexA(PALETTE.cyan, 0.85)}, 0 0 60px ${hexA(PALETTE.cyan, 0.3)}; }
  .chaos-cta:focus-visible, .chaos-focus:focus-visible { outline: 2px solid ${PALETTE.cyan}; outline-offset: 3px; }
  .chaos-ghost { transition: border-color .18s ease, background .18s ease; }
  .chaos-ghost:hover { border-color: ${hexA(PALETTE.cyan, 0.5)}; background: ${hexA(PALETTE.cyan, 0.05)}; }
  .chaos-input { transition: border-color .16s ease, box-shadow .16s ease; }
  .chaos-input:focus { outline: none; border-color: ${PALETTE.cyan}; box-shadow: 0 0 0 3px ${hexA(PALETTE.cyan, 0.16)}; }
  .chaos-tile { transition: transform .2s ease, border-color .2s ease, box-shadow .2s ease; }
  .chaos-tile:hover { transform: translateY(-3px); border-color: ${hexA(PALETTE.cyan, 0.35)}; box-shadow: 0 18px 40px -22px #000; }
  @media (prefers-reduced-motion: reduce) {
    .chaos-anim, .chaos-cta, .chaos-ghost, .chaos-tile, .chaos-pulse { transition: none !important; animation: none !important; }
  }
`;
