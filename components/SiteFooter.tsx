/**
 * components/SiteFooter.tsx
 * ----------------------------------------------------------------------------
 * Rendered from app/layout.tsx, so it lands on every route.
 *
 * A visitor who has scrolled to the bottom of a page has finished reading and
 * needs somewhere to go. Without this, the only exit from /audit or /ingest is
 * the browser back button — which people on phones use far less than you'd
 * expect. Every route is one tap from here.
 *
 * Server Component: no hooks, no interactivity, no client bundle.
 */

import Link from 'next/link';
import { PALETTE, MONO, DISPLAY, hexA, utilityLabel } from '@/lib/chaosTokens';

const LINKS = [
  { href: '/', label: 'Home' },
  { href: '/tools/vacancy-calculator', label: 'Vacancy calculator' },
  { href: '/ingest', label: 'Ledger screening' },
  { href: '/audit', label: 'Operations audit' },
];

const STACK = ['n8n', 'supabase', 'postgres', 'propops8_core'];

export default function SiteFooter() {
  return (
    <footer
      style={{
        borderTop: `1px solid ${hexA('#ffffff', 0.07)}`,
        background: PALETTE.void,
        marginTop: 'auto',
      }}
    >
      <div
        className="mx-auto px-4 sm:px-8"
        style={{ maxWidth: 1120, paddingTop: 32, paddingBottom: 32 }}
      >
        <div className="flex flex-col sm:flex-row sm:items-start justify-between" style={{ gap: 28 }}>
          <div>
            <Link
              href="/"
              style={{
                fontFamily: DISPLAY,
                fontWeight: 900,
                fontSize: 15,
                letterSpacing: '0.04em',
                color: PALETTE.bright,
                textDecoration: 'none',
              }}
            >
              PROPOPS<span style={{ color: PALETTE.cyan }}>8</span>
            </Link>
            <p
              style={{
                fontFamily: DISPLAY,
                fontSize: 13.5,
                lineHeight: 1.55,
                color: hexA('#ffffff', 0.5),
                margin: '10px 0 0',
                maxWidth: '32ch',
              }}
            >
              Operational intelligence for multifamily portfolios. Find out where the money is
              going before the year-end financials tell you.
            </p>
          </div>

          <nav aria-label="Footer">
            <div style={{ ...utilityLabel, fontSize: 10, marginBottom: 12 }}>Navigate</div>
            <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
              {LINKS.map((l) => (
                <li key={l.href} style={{ marginBottom: 9 }}>
                  <Link
                    href={l.href}
                    className="chaos-focus"
                    style={{
                      fontFamily: MONO,
                      fontSize: 12,
                      letterSpacing: '0.08em',
                      color: hexA('#ffffff', 0.66),
                      textDecoration: 'none',
                    }}
                  >
                    {l.label}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
        </div>

        <div
          className="flex flex-col sm:flex-row sm:items-center justify-between"
          style={{
            gap: 12,
            marginTop: 28,
            paddingTop: 20,
            borderTop: `1px solid ${hexA('#ffffff', 0.06)}`,
          }}
        >
          <div className="flex flex-wrap items-center" style={{ gap: 10 }}>
            {STACK.map((tag, i) => (
              <span key={tag} className="flex items-center" style={{ gap: 10 }}>
                {i > 0 && <span style={{ color: PALETTE.track }}>&middot;</span>}
                <span
                  style={{
                    fontFamily: MONO,
                    fontSize: 10.5,
                    letterSpacing: '0.14em',
                    color: i === 0 ? hexA('#ffffff', 0.7) : PALETTE.label,
                    textTransform: i === 0 ? 'none' : 'uppercase',
                  }}
                >
                  {tag}
                </span>
              </span>
            ))}
          </div>

          <span style={{ ...utilityLabel, fontSize: 10, letterSpacing: '0.13em' }}>
            PropOps8 &middot; Daniel Ebuehi
          </span>
        </div>
      </div>
    </footer>
  );
}
