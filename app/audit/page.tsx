'use client';

/**
 * app/audit/page.tsx  —  Tally version
 * ----------------------------------------------------------------------------
 * Replaces the custom React form. The form itself is Tally's; everything around
 * it is yours, so the page still reads as PropOps8 rather than as a bare
 * third-party embed on a slate background.
 *
 * The one piece of real work here: carrying the calculator's numbers into the
 * form. A prospect who ran the diagnostic arrives at
 *   /audit?days=27&exposure=1890&totalDays=31&total=2170
 * and those go into Tally hidden fields, so the submission that reaches your
 * webhook already knows what they saw. Without this the two halves of the
 * funnel don't talk and you lose the single strongest qualifying signal you
 * have.
 *
 * Set TALLY_FORM_ID below (or NEXT_PUBLIC_TALLY_FORM_ID in the environment).
 */

import React, { useEffect, useMemo, useState } from 'react';
import {
  PALETTE,
  MONO,
  DISPLAY,
  hexA,
  money,
  shellStyle,
  bodyStyle,
  panelStyle,
  cardStyle,
  utilityLabel,
  eyebrowTab,
  headingStyle,
  sharedCss,
} from '@/lib/chaosTokens';

const TALLY_FORM_ID = process.env.NEXT_PUBLIC_TALLY_FORM_ID ?? 'YOUR_TALLY_FORM_ID';

const DELIVERABLES = [
  'Operational vs. leasing vacancy split, per unit',
  'Make-ready bottleneck analysis against your own median',
  'Repeat-callback detection — same unit, same system',
  'Vendor concentration and spend benchmark',
  'Cost anomalies flagged for human review',
  'Prioritised findings report',
  '30-minute review call',
];

interface Snapshot {
  days?: number;
  exposure?: number;
  totalDays?: number;
  total?: number;
}

export default function AuditPage() {
  const [snapshot, setSnapshot] = useState<Snapshot>({});
  const [ready, setReady] = useState(false);

  // Read after mount — no useSearchParams, so no Suspense boundary and no
  // build failure, and the page stays statically renderable.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const q = new URLSearchParams(window.location.search);
    const n = (k: string) => {
      const v = Number(q.get(k));
      return Number.isFinite(v) && v > 0 ? Math.round(v) : undefined;
    };
    setSnapshot({
      days: n('days'),
      exposure: n('exposure'),
      totalDays: n('totalDays'),
      total: n('total'),
    });
    setReady(true);
  }, []);

  /**
   * Tally hidden fields are populated by query string. The parameter name must
   * match the hidden field name in the form exactly — see TALLY-SETUP.md §2.
   */
  const embedSrc = useMemo(() => {
    const p = new URLSearchParams({
      alignLeft: '1',
      hideTitle: '1',
      transparentBackground: '1',
      dynamicHeight: '1',
    });
    if (snapshot.days !== undefined) p.set('days', String(snapshot.days));
    if (snapshot.exposure !== undefined) p.set('exposure', String(snapshot.exposure));
    if (snapshot.totalDays !== undefined) p.set('total_days', String(snapshot.totalDays));
    if (snapshot.total !== undefined) p.set('total_exposure', String(snapshot.total));
    return `https://tally.so/embed/${TALLY_FORM_ID}?${p.toString()}`;
  }, [snapshot]);

  const hasSnapshot = snapshot.days !== undefined || snapshot.exposure !== undefined;

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

      <div className="w-full mx-auto overflow-hidden" style={{ ...shellStyle, maxWidth: 760 }}>
        <div className="p-5 sm:p-7" style={bodyStyle}>
          <div className="inline-flex items-center" style={eyebrowTab}>
            PropOps8 // Operations audit
          </div>

          <h1 className="uppercase" style={{ ...headingStyle, margin: '18px 0 10px' }}>
            Find out where your property is losing money
          </h1>
          <p
            style={{
              fontSize: 15.5,
              lineHeight: 1.55,
              color: hexA('#ffffff', 0.66),
              margin: '0 0 22px',
            }}
          >
            Send your existing work-order and turn exports. You get back a prioritised breakdown
            of where make-ready time, repeat maintenance and vendor spend are draining NOI — and
            which problems deserve attention first.
          </p>

          {/* ------------------------------------------- imported snapshot */}
          {hasSnapshot && (
            <div
              className="p-4 sm:p-5"
              style={{
                ...panelStyle,
                borderColor: hexA(PALETTE.pink, 0.3),
                background: `linear-gradient(180deg, ${hexA(PALETTE.pink, 0.08)} 0%, ${PALETTE.panel} 70%)`,
                marginBottom: 18,
              }}
            >
              <div style={{ ...utilityLabel, fontSize: 10 }}>Your diagnostic, carried over</div>
              <div className="flex flex-wrap items-baseline" style={{ gap: 18, marginTop: 12 }}>
                {snapshot.days !== undefined && (
                  <span style={{ fontFamily: MONO, fontSize: 13, color: hexA('#ffffff', 0.8) }}>
                    Operational delay:{' '}
                    <strong style={{ color: PALETTE.pink }}>{snapshot.days} days</strong>
                  </span>
                )}
                {snapshot.exposure !== undefined && (
                  <span style={{ fontFamily: MONO, fontSize: 13, color: hexA('#ffffff', 0.8) }}>
                    Recoverable exposure:{' '}
                    <strong style={{ color: PALETTE.pink }}>{money(snapshot.exposure)}</strong>
                  </span>
                )}
              </div>
              <div
                style={{
                  ...utilityLabel,
                  fontSize: 10,
                  letterSpacing: '0.12em',
                  marginTop: 12,
                  color: hexA('#ffffff', 0.4),
                }}
              >
                That was one unit. The audit runs it across the portfolio — and these figures
                travel with your submission.
              </div>
            </div>
          )}

          {/* -------------------------------------------------- the form */}
          <div className="overflow-hidden" style={{ ...panelStyle, padding: '8px 8px 4px' }}>
            {ready ? (
              <iframe
                src={embedSrc}
                title="PropOps8 operations audit intake"
                width="100%"
                height="720"
                loading="lazy"
                style={{ border: 0, display: 'block', width: '100%', minHeight: 720 }}
              />
            ) : (
              <div
                style={{
                  minHeight: 720,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  ...utilityLabel,
                }}
              >
                Loading form&hellip;
              </div>
            )}
          </div>

          <p
            style={{
              ...utilityLabel,
              fontSize: 10,
              letterSpacing: '0.12em',
              textAlign: 'center',
              marginTop: 16,
              color: hexA('#ffffff', 0.45),
              lineHeight: 1.7,
            }}
          >
            $497 &middot; 48-hour turnaround &middot; De-identified data accepted &middot; No
            software subscription required
          </p>

          {/* --------------------------------------------- what you receive */}
          <div className="p-5 sm:p-6" style={{ ...cardStyle, marginTop: 16 }}>
            <div style={utilityLabel}>What you&rsquo;ll receive</div>
            <ul style={{ listStyle: 'none', margin: '16px 0 0', padding: 0 }}>
              {DELIVERABLES.map((d) => (
                <li
                  key={d}
                  className="flex items-start gap-3"
                  style={{
                    fontFamily: DISPLAY,
                    fontSize: 14.5,
                    lineHeight: 1.5,
                    color: '#dbe5f5',
                    marginBottom: 11,
                  }}
                >
                  <span aria-hidden="true" style={{ color: PALETTE.mint, flexShrink: 0, marginTop: 1 }}>
                    &#10003;
                  </span>
                  {d}
                </li>
              ))}
            </ul>
          </div>

          {/* ------------------------------------------------------ privacy */}
          <div className="p-5" style={{ ...cardStyle, marginTop: 16 }}>
            <div style={utilityLabel}>Data handling</div>
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
              Upload de-identified operational data only. Do not include resident names, Social
              Security numbers, financial account information, medical information, or other
              sensitive personal information. Unit identifiers, dates, categories, vendors and
              costs are all the analysis needs.
              <br />
              <br />
              Files go to private storage reachable only by a link issued to you, and source
              files are deleted at the end of the stated retention window. Payment is processed
              by Tally&rsquo;s payment provider; card details never touch this site.
            </p>
          </div>
        </div>
      </div>
    </main>
  );
}
