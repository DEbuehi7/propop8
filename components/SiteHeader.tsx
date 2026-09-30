'use client';

/**
 * components/SiteHeader.tsx
 * ----------------------------------------------------------------------------
 * Sticky nav, rendered from app/layout.tsx so it appears on every route.
 *
 * Client component because it reads usePathname to mark the active link. That
 * is the whole reason — a visitor three pages deep needs to know where they
 * are, not just where they can go.
 *
 * No hamburger. Four items in compact mono fit inside 375px with room to
 * spare, and a menu that has to be opened to be read is worse navigation than
 * one that is simply visible.
 */

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { PALETTE, MONO, DISPLAY, hexA } from '@/lib/chaosTokens';

const LINKS = [
  { href: '/tools/vacancy-calculator', label: 'Calculator' },
  { href: '/ingest', label: 'Ingest' },
  { href: '/audit', label: 'Audit' },
  { href: '/infographics', label: 'Info' },
];

export default function SiteHeader() {
  const pathname = usePathname() ?? '/';

  return (
    <>
      {/* Colors sampled directly from the approved logo files (Cyan/Magenta
          exports), not the site's PALETTE tokens -- the brand mark uses its
          own slightly different cyan/magenta, intentionally kept separate
          from chaosTokens.ts here rather than overwriting those tokens. */}
      <style>{`
        @keyframes propops8-eight-pulse {
          0%, 100% { color: #03edff; }
          50% { color: #f11aff; }
        }
        .propops8-eight-pulse {
          animation: propops8-eight-pulse 4s ease-in-out infinite;
        }
        @media (prefers-reduced-motion: reduce) {
          .propops8-eight-pulse { animation: none; color: #03edff; }
        }
      `}</style>

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
        <nav
          className="mx-auto flex items-center justify-between gap-3 px-4 sm:px-8"
          style={{ maxWidth: 1120, height: 56 }}
          aria-label="Primary"
        >
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
            PropOps<span className="propops8-eight-pulse">8</span>
          </Link>

          <div className="flex items-center" style={{ gap: 'clamp(10px, 3vw, 22px)' }}>
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
