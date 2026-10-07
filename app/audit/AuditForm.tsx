'use client';

/**
 * app/audit/AuditForm.tsx
 * ----------------------------------------------------------------------------
 * Split out of what used to be app/audit/page.tsx. Client Components ('use
 * client') cannot export `metadata` in the App Router — Next.js fails the
 * build if you try. page.tsx imports this and adds the metadata export that
 * has to live in a Server Component.
 *
 * CLAIMS AUDIT (this revision) — every promise on this page is now traceable
 * to a check that actually exists in lib/auditEngine.ts. What was removed and
 * why:
 *
 *   "Operational vs. leasing vacancy split, per unit"
 *      The engine has no vacancy analysis at all, and `unit` in LedgerRow is
 *      an identifier, not a count — there is no denominator for anything
 *      "per unit" unless the unit count is supplied separately.
 *
 *   "Make-ready bottleneck analysis against your own median"
 *      No make-ready check exists. No median is computed anywhere.
 *
 *   "Repeat-callback detection — same unit, same system"
 *      Identifying a repeated *system* requires work-order descriptions.
 *      The engine reads `description` as an optional passthrough field and
 *      never analyses it.
 *
 *   "Vendor concentration and spend benchmark"
 *      Concentration is real (checkVendorConcentration). "Benchmark" is not —
 *      buildSpendTable's baseline is min(amount) × count, which its own
 *      comment calls "intentionally naive," not an external or historical
 *      benchmark.
 *
 *   "Cost anomalies flagged for human review"
 *      There is no anomaly check beyond the three named ones. Kept only the
 *      part that is true: a human reviews every finding.
 *
 * What remains maps 1:1 to checkVendorConcentration, checkDuplicateBilling,
 * checkAging, and buildSpendTable. If you add a real check later, add the
 * claim then — not before.
 */

import React, { useEffect, useMemo, useState } from 'react';
import { parseHandoff } from '@/lib/calculatorHandoff';
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
  'Vendor concentration by category, with the spend behind it shown',
  'Duplicate charges — same vendor, same amount, days apart',
  'Aging — how much of your open work has passed 30 days, and where it clusters',
  'Category spend totals for the period, ranked',
  'Every finding reviewed by hand before it reaches you',
  'Prioritised findings report',
  '30-minute review call',
];

/** What each check needs. Shown on the page because a buyer who sends a file
 *  missing these columns should know beforehand which checks will be skipped,
 *  not discover it in the report. */
const WHAT_TO_SEND = [
  ['vendor, category, amount', 'concentration and duplicate charges'],
  ['status, opened date', 'aging analysis'],
  ['unit count (just tell me the number)', 'anything expressed per unit'],
];

interface Snapshot {
  calculatorSlug?: string;
  calculatorHeadline?: string;
  days?: number;
  exposure?: number;
  totalDays?: number;
  total?: number;
}

export default function AuditForm() {
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
    const handoff = parseHandoff(q);
    setSnapshot({
      calculatorSlug: handoff.slug ?? undefined,
      calculatorHeadline: handoff.headline ?? undefined,
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
    if (snapshot.calculatorSlug) p.set('calculator_slug', snapshot.calculatorSlug);
    if (snapshot.calculatorHeadline) p.set('calculator_headline', snapshot.calculatorHeadline);
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
            Send your existing work-order or vendor export. You get back where vendor spend is
            concentrated, which charges look duplicated, and how much of your open work has
            quietly aged past thirty days &mdash; with the arithmetic shown for every figure,
            and the checks your file couldn&rsquo;t support named rather than estimated.
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
              {/* Previously read "The audit runs it across the portfolio." It does not —
                  the calculator models vacancy from figures you typed; the audit reads a
                  work-order export and asks different questions entirely. */}
              <div
                style={{
                  ...utilityLabel,
                  fontSize: 10,
                  letterSpacing: '0.12em',
                  marginTop: 12,
                  color: hexA('#ffffff', 0.4),
                }}
              >
                Those were figures you entered, and they travel with your submission as
                context. The audit reads your work-order export &mdash; a different set of
                questions than the calculator asks.
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

          {/* ------------------------------------------------ what to send */}
          <div className="p-5 sm:p-6" style={{ ...cardStyle, marginTop: 16 }}>
            <div style={utilityLabel}>What your export needs</div>
            <p
              style={{
                fontSize: 14,
                lineHeight: 1.6,
                color: hexA('#ffffff', 0.66),
                margin: '14px 0 0',
              }}
            >
              Whatever your system exports is fine &mdash; column names get normalised on my
              end. Which checks run depends on what the file contains:
            </p>
            <ul style={{ listStyle: 'none', margin: '14px 0 0', padding: 0 }}>
              {WHAT_TO_SEND.map(([cols, gives]) => (
                <li
                  key={cols}
                  style={{
                    fontFamily: MONO,
                    fontSize: 11.5,
                    lineHeight: 1.7,
                    letterSpacing: '0.02em',
                    color: hexA('#ffffff', 0.6),
                    marginBottom: 8,
                  }}
                >
                  <span style={{ color: PALETTE.cyan }}>{cols}</span>
                  <span style={{ color: hexA('#ffffff', 0.35) }}> &rarr; </span>
                  {gives}
                </li>
              ))}
            </ul>
            <p
              style={{
                fontFamily: MONO,
                fontSize: 11,
                lineHeight: 1.8,
                letterSpacing: '0.03em',
                color: hexA('#ffffff', 0.5),
                margin: '14px 0 0',
              }}
            >
              A missing column doesn&rsquo;t stop the audit &mdash; that check is skipped and
              named in the report rather than estimated. Twelve months of history gives the
              duplicate and aging checks more to work with than a single month.
            </p>
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
