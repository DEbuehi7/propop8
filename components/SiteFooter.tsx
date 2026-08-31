/**
 * components/SiteFooter.tsx
 * ----------------------------------------------------------------------------
 * Rendered from app/layout.tsx, so it lands on every route.
 *
 * THE LICENCE DISCLOSURE IS WHY THIS FILE MATTERS MORE THAN IT LOOKS.
 *
 * California requires a licensee to display their licence number and their
 * responsible broker's on material that could be read as soliciting real
 * estate business. An operations audit sold by a licensed salesperson to
 * property owners sits close enough to that line that the disclosure costs a
 * footer line and its absence is a regulator problem — one that surfaces at
 * the worst possible moment, usually after you have customers.
 *
 * The advisory disclaimer sits beside it for a different reason: institutional
 * and affordable-housing buyers have compliance people who look for exactly
 * this sentence before approving a purchase from an unfamiliar vendor. Its
 * presence is a small trust signal; its absence is a question they have to
 * ask you.
 *
 * Server Component: no hooks, no client bundle.
 */

import Link from 'next/link';
import { PALETTE, MONO, DISPLAY, hexA, utilityLabel } from '@/lib/chaosTokens';

const NAV = [
  { href: '/', label: 'Home' },
  { href: '/tools/vacancy-calculator', label: 'Vacancy calculator' },
  { href: '/ingest', label: 'Ledger screening' },
  { href: '/audit', label: 'Operations audit' },
];

const LEGAL = [
  { href: '/legal/privacy', label: 'Privacy' },
  { href: '/legal/terms', label: 'Terms' },
  { href: '/legal/refunds', label: 'Refunds' },
];

const STACK = ['n8n', 'supabase', 'postgres', 'propops8_core'];

const linkStyle: React.CSSProperties = {
  fontFamily: MONO,
  fontSize: 12,
  letterSpacing: '0.08em',
  color: hexA('#ffffff', 0.66),
  textDecoration: 'none',
};

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
        <div
          className="flex flex-col sm:flex-row sm:items-start justify-between"
          style={{ gap: 28 }}
        >
          <div style={{ maxWidth: '34ch' }}>
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
              }}
            >
              Operational intelligence for multifamily portfolios. Find out where the money is
              going before the year-end financials tell you.
            </p>
          </div>

          <nav aria-label="Footer">
            <div style={{ ...utilityLabel, fontSize: 10, marginBottom: 12 }}>Navigate</div>
            <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
              {NAV.map((l) => (
                <li key={l.href} style={{ marginBottom: 9 }}>
                  <Link href={l.href} className="chaos-focus" style={linkStyle}>
                    {l.label}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>

          <nav aria-label="Legal">
            <div style={{ ...utilityLabel, fontSize: 10, marginBottom: 12 }}>Legal</div>
            <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
              {LEGAL.map((l) => (
                <li key={l.href} style={{ marginBottom: 9 }}>
                  <Link href={l.href} className="chaos-focus" style={linkStyle}>
                    {l.label}
                  </Link>
                </li>
              ))}
              <li style={{ marginBottom: 9 }}>
                <a href="mailto:daniel@propops8.com" className="chaos-focus" style={linkStyle}>
                  Contact
                </a>
              </li>
            </ul>
          </nav>
        </div>

        {/* ------------------------------------------- licence disclosure */}
        <div
          style={{
            marginTop: 28,
            paddingTop: 20,
            borderTop: `1px solid ${hexA('#ffffff', 0.06)}`,
          }}
        >
          <p
            style={{
              fontFamily: MONO,
              fontSize: 10.5,
              lineHeight: 1.9,
              letterSpacing: '0.04em',
              color: hexA('#ffffff', 0.42),
              margin: 0,
              maxWidth: '92ch',
            }}
          >
            Daniel Osazee Ebuehi &middot; California DRE #02224369 &middot; under Ed Bonilla, DRE
            #00752861 &middot; Keller Williams South East Los Angeles, 8255 Firestone Blvd Ste
            100, Downey CA 90241.
            <br />
            PropOps8 provides operational data analysis. It is not real estate brokerage, property
            management, legal, tax, or investment advice, and no agency relationship is created by
            using this site. Figures shown by the free tools are estimates computed from figures
            you enter, not valuations or statements of loss.
          </p>
        </div>

        <div
          className="flex flex-col sm:flex-row sm:items-center justify-between"
          style={{
            gap: 12,
            marginTop: 20,
            paddingTop: 18,
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
            &copy; {new Date().getFullYear()} Smiling Bubbles Inc.
          </span>
        </div>
      </div>
    </footer>
  );
}
