/**
 * app/audit/thank-you/page.tsx
 * ----------------------------------------------------------------------------
 * Stripe's success_url target. Until this file exists, every completed payment
 * lands on a 404 — the buyer's last impression of a $497 purchase.
 *
 * Deliberately does NOT verify the session server-side. success_url is not a
 * trustworthy signal of payment (a curious visitor can type the URL), so this
 * page confirms nothing it cannot prove. The webhook is the source of truth for
 * "paid", and the upload email is the real confirmation. This page says what
 * happens next, and nothing more.
 *
 * It also does not claim the audit has started. Nothing has been analysed —
 * the files haven't arrived yet.
 *
 * robots: noindex stays — this is a post-purchase confirmation page, not
 * something a stranger should land on from a search result. The openGraph
 * block below is for the rare case this link gets shared directly (a buyer
 * forwarding it to a colleague), not for search or ad discovery.
 */

import type { Metadata } from 'next';
import {
  PALETTE,
  MONO,
  DISPLAY,
  hexA,
  shellStyle,
  bodyStyle,
  cardStyle,
  utilityLabel,
  eyebrowTab,
  headingStyle,
  ghostCtaStyle,
  sharedCss,
} from '@/lib/chaosTokens';

export const metadata: Metadata = {
  title: 'Audit booked — PropOps8',
  robots: { index: false, follow: false },
  openGraph: {
    title: 'Audit booked — PropOps8',
    description: 'Your operations audit is booked. Here\u2019s what happens next.',
    images: [{ url: '/og/audit.png', width: 1200, height: 630 }],
  },
};

const STEPS = [
  {
    n: '01',
    title: 'Check your inbox',
    body: 'A secure upload link is on its way, usually within a minute. It stays open for 14 days and is private to you.',
  },
  {
    n: '02',
    title: 'Send whatever you can export',
    body: 'Work orders, vacancy/turn data, vendor invoices. CSV or XLSX, straight out of your PMS. Normalising it is my job.',
  },
  {
    n: '03',
    title: 'Findings in 48 hours',
    body: 'The clock starts when your files land, not now. You get a prioritised report and a link to book the 30-minute review.',
  },
];

export default function ThankYouPage() {
  return (
    <main
      style={{
        minHeight: '100vh',
        background: PALETTE.void,
        padding: '48px 16px',
        fontFamily: DISPLAY,
      }}
    >
      <style>{sharedCss}</style>

      <div className="w-full mx-auto overflow-hidden" style={{ ...shellStyle, maxWidth: 640 }}>
        <div className="p-5 sm:p-7" style={bodyStyle}>
          <div className="inline-flex items-center" style={eyebrowTab}>
            PropOps8 // Operations audit
          </div>

          <h1 className="uppercase" style={{ ...headingStyle, margin: '18px 0 12px' }}>
            Payment received
          </h1>

          <p
            style={{
              fontSize: 15.5,
              lineHeight: 1.6,
              color: hexA('#ffffff', 0.68),
              margin: '0 0 26px',
            }}
          >
            Your operations audit is booked. Stripe has emailed your receipt separately.
          </p>

          <ol style={{ listStyle: 'none', margin: 0, padding: 0 }}>
            {STEPS.map((s) => (
              <li key={s.n} className="p-5" style={{ ...cardStyle, marginBottom: 12 }}>
                <div className="flex items-baseline gap-3">
                  <span
                    style={{
                      fontFamily: MONO,
                      fontSize: 12,
                      letterSpacing: '0.12em',
                      color: PALETTE.cyan,
                      flexShrink: 0,
                    }}
                  >
                    {s.n}
                  </span>
                  <div>
                    <div
                      style={{
                        fontFamily: DISPLAY,
                        fontWeight: 700,
                        fontSize: 16,
                        color: PALETTE.bright,
                      }}
                    >
                      {s.title}
                    </div>
                    <p
                      style={{
                        fontSize: 14.5,
                        lineHeight: 1.6,
                        color: hexA('#ffffff', 0.62),
                        margin: '8px 0 0',
                      }}
                    >
                      {s.body}
                    </p>
                  </div>
                </div>
              </li>
            ))}
          </ol>

          <div className="p-5" style={{ ...cardStyle, marginTop: 16 }}>
            <div style={utilityLabel}>Before you upload</div>
            <p
              style={{
                fontFamily: MONO,
                fontSize: 11,
                lineHeight: 1.85,
                letterSpacing: '0.03em',
                color: hexA('#ffffff', 0.6),
                margin: '12px 0 0',
              }}
            >
              Send de-identified operational data only. Strip resident names, Social Security
              numbers, financial account details and any medical information. Unit identifiers,
              dates, categories, vendors and costs are all the analysis uses.
            </p>
          </div>

          <p
            style={{
              fontFamily: MONO,
              fontSize: 11.5,
              lineHeight: 1.8,
              letterSpacing: '0.04em',
              color: hexA('#ffffff', 0.55),
              margin: '22px 0 0',
            }}
          >
            No email after a few minutes? Check spam, then write to daniel@propops8.com and
            I&rsquo;ll reissue the link the same day.
          </p>

          <div style={{ marginTop: 24 }}>
            <a href="/" className="chaos-ghost inline-flex items-center" style={ghostCtaStyle()}>
              Back to PropOps8
            </a>
          </div>
        </div>
      </div>
    </main>
  );
}
