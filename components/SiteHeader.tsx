'use client';

/**
 * components/SiteHeader.tsx
 * ----------------------------------------------------------------------------
 * Sticky nav, rendered from app/layout.tsx so it appears on every route.
 *
 * Client component because it reads usePathname to mark the active link, and
 * the living 8 to show the visitor's latest calculator result.
 *
 * No hamburger. Four items in compact mono fit inside 375px with room to
 * spare, and a menu that has to be opened to be read is worse navigation than
 * one that is simply visible. The result's status sits beside the wordmark
 * from 640px up, and drops to its own row below that, so the links never move.
 *
 * THE "8" first auto-cycled cyan/magenta on a 4s timer, then followed a
 * hand-set REVENUE_TREND flag with no feed behind it. It now shows only the
 * visitor's own calculator result (components/brand/LivingEight.tsx,
 * lib/brand/markState.ts): pink with its lower bowl filled for a leak, mint
 * for healthy, a dotted outline when the numbers can't support a result,
 * and the plain white 8 until then. Always with words beside it.
 */

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { PALETTE, MONO, DISPLAY, hexA } from '@/lib/chaosTokens';
import { LIVING_EIGHT_CSS, LivingEight, MarkStatus } from '@/components/brand/LivingEight';

const LINKS = [
  { href: '/tools/vacancy-calculator', label: 'Calculator' },
  { href: '/ingest', label: 'Ingest' },
  { href: '/audit', label: 'Audit' },
  { href: '/infographics', label: 'Info' },
];

const NAV_CSS = `
  .site-nav { display: flex; flex-wrap: wrap; align-items: center; column-gap: 12px; min-height: 56px; }
  .site-nav-brand { order: 1; height: 56px; display: flex; align-items: center; }
  .site-nav-links { order: 2; margin-left: auto; height: 56px; }
  .site-nav-status { order: 3; flex-basis: 100%; display: flex; }
  .site-nav-status .living8-chip { margin: -6px 0 10px; }
  @media (min-width: 640px) {
    .site-nav-status { order: 2; flex-basis: auto; }
    .site-nav-status .living8-chip { margin: 0; }
    .site-nav-links { order: 3; }
  }
`;

export default function SiteHeader() {
  const pathname = usePathname() ?? '/';
  // Admin pages keep the plain 8: a visitor's calculator result is not admin
  // data, and AdminNav is pinned at top: 56, where the status row would sit.
  const admin = pathname === '/admin' || pathname.startsWith('/admin/');

  return (
    <>
      <style>{NAV_CSS + LIVING_EIGHT_CSS}</style>

      {/* Keyboard users land here first. Invisible until focused. */}
      <a
        href="#main"
        style={{
          position: 'absolute',
          left: -9999,
          top: 0,
          zIndex: 100,
          background: PALETTE.cyan,
          color: '#06202a',
          padding: '10px 16px',
          borderRadius: 8,
          fontFamily: MONO,
          fontSize: 12,
        }}
        onFocus={(e) => {
          e.currentTarget.style.left = '12px';
          e.currentTarget.style.top = '12px';
        }}
        onBlur={(e) => {
          e.currentTarget.style.left = '-9999px';
        }}
      >
        Skip to content
      </a>

      <header
        style={{
          position: 'sticky',
          top: 0,
          zIndex: 50,
          background: hexA(PALETTE.void, 0.82),
          backdropFilter: 'blur(12px)',
          WebkitBackdropFilter: 'blur(12px)',
          borderBottom: `1px solid ${hexA('#ffffff', 0.07)}`,
        }}
      >
        <nav className="site-nav mx-auto px-4 sm:px-8" style={{ maxWidth: 1120 }} aria-label="Primary">
          <div className="site-nav-brand">
            <Link
              href="/"
              style={{
                fontFamily: DISPLAY,
                fontWeight: 900,
                fontSize: 15,
                letterSpacing: '0.04em',
                color: PALETTE.bright,
                textDecoration: 'none',
                whiteSpace: 'nowrap',
              }}
            >
              PropOps<LivingEight plain={admin} />
            </Link>
          </div>

          {!admin && <MarkStatus className="site-nav-status" />}

          <div className="site-nav-links flex items-center" style={{ gap: 'clamp(10px, 3vw, 22px)' }}>
            {LINKS.map((l) => {
              const active = pathname === l.href || pathname.startsWith(l.href + '/');
              return (
                <Link
                  key={l.href}
                  href={l.href}
                  aria-current={active ? 'page' : undefined}
                  className="chaos-focus"
                  style={{
                    fontFamily: MONO,
                    fontSize: 10.5,
                    letterSpacing: '0.14em',
                    textTransform: 'uppercase',
                    textDecoration: 'none',
                    whiteSpace: 'nowrap',
                    color: active ? PALETTE.cyan : hexA('#ffffff', 0.6),
                    paddingBottom: 3,
                    borderBottom: active
                      ? `1.5px solid ${PALETTE.cyan}`
                      : '1.5px solid transparent',
                    textShadow: active ? `0 0 14px ${hexA(PALETTE.cyan, 0.6)}` : 'none',
                    transition: 'color .16s ease',
                  }}
                >
                  {l.label}
                </Link>
              );
            })}
          </div>
        </nav>
      </header>
    </>
  );
}
