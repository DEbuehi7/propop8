'use client';

/**
 * VacancyBlackHole — free diagnostic calculator
 * ----------------------------------------------------------------------------
 * Top of the PropOps8 funnel. Deploy at /tools/vacancy-calculator and point
 * every LinkedIn post and outbound message at it.
 *
 * WHAT CHANGED FROM THE DRAFT VERSION
 *
 * 1. Skin. The draft was amber-on-zinc, which matches nothing else you've
 *    built. Now on chaosTokens, so it is visibly the same product as the
 *    eight cards.
 *
 * 2. The headline number. The draft led with total exposure. This leads with
 *    the make-ready portion, because that is the only part you can sell a fix
 *    for — and it labels it "recoverable", which the mockup card did not.
 *    Total exposure is still shown, one tier down, so nothing is hidden.
 *
 * 3. Date maths. `new Date('2026-06-01')` parses as UTC midnight while other
 *    Date calls are local, which is a class of bug that surfaces as an
 *    off-by-one day for anyone west of Greenwich — i.e. every one of your
 *    Southern California prospects. Day counts now go through UTC day numbers.
 *
 * 4. Validation. The draft clamped negative spans to zero with Math.max, so a
 *    rent-ready date before the move-out date silently reported 0 days. Now it
 *    says what's wrong and suppresses the figures rather than showing a
 *    confident wrong answer to a prospect.
 *
 * 5. Prefill + share. Reads rent and dates from the query string, and can copy
 *    a prefilled link back out. That is the outreach play in your plan: send a
 *    prospect a URL that already contains their unit's numbers, so the first
 *    thing they see is their own leak, not an empty form.
 *
 * 6. CTA routing. Params now carry into the intake step rather than jumping
 *    straight to the audit page, matching the pipeline you mapped.
 *
 * No dependencies beyond React. All maths is synchronous and local; nothing is
 * sent anywhere.
 */

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  PALETTE,
  MONO,
  DISPLAY,
  hexA,
  money,
  daysBetween,
  dayNumber,
  shellStyle,
  bodyStyle,
  panelStyle,
  cardStyle,
  utilityLabel,
  eyebrowTab,
  headingStyle,
  figureStyle,
  ctaStyle,
  sharedCss,
} from '@/lib/chaosTokens';

/* -------------------------------------------------------------------------- */
/*  Types                                                                      */
/* -------------------------------------------------------------------------- */

export interface VacancyBlackHoleProps {
  defaultRent?: number;
  defaultMoveOut?: string;
  defaultReadyDate?: string;
  defaultLeaseDate?: string;
  /** Divisor for the daily rate. 30 is the PM convention; 30.44 is calendar-exact. */
  daysPerMonth?: number;
  /** Lead capture route. Query params are appended. */
  intakeHref?: string;
  ctaLabel?: string;
  /** Set false if you host this somewhere the query string shouldn't be trusted. */
  readUrlParams?: boolean;
  currency?: string;
}

interface Metrics {
  operationalDays: number;
  leasingDays: number;
  totalDays: number;
  dailyRent: number;
  operationalExposure: number;
  leasingExposure: number;
  totalExposure: number;
  operationalPercent: number;
  leasingPercent: number;
}

/* -------------------------------------------------------------------------- */
/*  Field                                                                      */
/* -------------------------------------------------------------------------- */

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <label style={{ display: 'block' }}>
      <span style={{ ...utilityLabel, fontSize: 10.5, display: 'block', marginBottom: 7 }}>
        {label}
      </span>
      {children}
      {hint && (
        <span
          style={{
            display: 'block',
            marginTop: 6,
            fontFamily: MONO,
            fontSize: 10,
            letterSpacing: '0.08em',
            color: hexA(PALETTE.pink, 0.9),
          }}
        >
          {hint}
        </span>
      )}
    </label>
  );
}

const inputStyle: React.CSSProperties = {
  width: '100%',
  background: hexA('#060b16', 0.85),
  border: `1px solid ${hexA('#ffffff', 0.12)}`,
  borderRadius: 8,
  padding: '11px 13px',
  color: PALETTE.bright,
  fontFamily: MONO,
  fontSize: 14,
  letterSpacing: '0.03em',
  colorScheme: 'dark',
};

/* -------------------------------------------------------------------------- */
/*  Component                                                                  */
/* -------------------------------------------------------------------------- */

export default function VacancyBlackHole({
  defaultRent = 2100,
  defaultMoveOut = '2026-06-01',
  defaultReadyDate = '2026-06-28',
  defaultLeaseDate = '2026-07-02',
  daysPerMonth = 30,
  intakeHref = '/audit',
  ctaLabel = 'Find my make-ready bottleneck',
  readUrlParams = true,
  currency = '$',
}: VacancyBlackHoleProps) {
  // Rent is held as a string so an empty field stays empty instead of snapping
  // to 0 while someone is mid-edit.
  const [rentInput, setRentInput] = useState<string>(String(defaultRent));
  const [moveOutDate, setMoveOutDate] = useState<string>(defaultMoveOut);
  const [readyDate, setReadyDate] = useState<string>(defaultReadyDate);
  const [leaseDate, setLeaseDate] = useState<string>(defaultLeaseDate);
  const [copied, setCopied] = useState(false);

  // Prefill from the query string after mount — no hydration mismatch, and it
  // works without pulling in next/navigation or a Suspense boundary.
  useEffect(() => {
    if (!readUrlParams || typeof window === 'undefined') return;
    const q = new URLSearchParams(window.location.search);
    const rent = q.get('rent');
    const out = q.get('moveOut');
    const ready = q.get('ready');
    const lease = q.get('lease');
    if (rent && Number.isFinite(Number(rent))) setRentInput(rent);
    if (out && dayNumber(out) !== null) setMoveOutDate(out);
    if (ready && dayNumber(ready) !== null) setReadyDate(ready);
    if (lease && dayNumber(lease) !== null) setLeaseDate(lease);
  }, [readUrlParams]);

  const monthlyRent = useMemo(() => {
    const n = Number(rentInput);
    return Number.isFinite(n) && n > 0 ? n : 0;
  }, [rentInput]);

  const errors = useMemo(() => {
    const e: Record<string, string> = {};
    if (monthlyRent <= 0) e.rent = 'Enter a monthly rent above zero.';
    const opSpan = daysBetween(moveOutDate, readyDate);
    const leaseSpan = daysBetween(readyDate, leaseDate);
    if (opSpan === null) e.ready = 'Check this date.';
    else if (opSpan < 0) e.ready = 'Rent-ready date falls before move-out.';
    if (leaseSpan === null) e.lease = 'Check this date.';
    else if (leaseSpan < 0) e.lease = 'Lease-signed date falls before rent-ready.';
    return e;
  }, [monthlyRent, moveOutDate, readyDate, leaseDate]);

  const valid = Object.keys(errors).length === 0;

  const metrics: Metrics | null = useMemo(() => {
    if (!valid) return null;
    const operationalDays = daysBetween(moveOutDate, readyDate) ?? 0;
    const leasingDays = daysBetween(readyDate, leaseDate) ?? 0;
    const totalDays = operationalDays + leasingDays;
    const dailyRent = monthlyRent / daysPerMonth;
    const operationalExposure = Math.round(operationalDays * dailyRent);
    const totalExposure = Math.round(totalDays * dailyRent);
    return {
      operationalDays,
      leasingDays,
      totalDays,
      dailyRent: Math.round(dailyRent),
      operationalExposure,
      leasingExposure: totalExposure - operationalExposure,
      totalExposure,
      operationalPercent: totalDays > 0 ? (operationalDays / totalDays) * 100 : 0,
      leasingPercent: totalDays > 0 ? (leasingDays / totalDays) * 100 : 0,
    };
  }, [valid, monthlyRent, moveOutDate, readyDate, leaseDate, daysPerMonth]);

  const shareUrl = useMemo(() => {
    const q = new URLSearchParams({
      rent: String(monthlyRent),
      moveOut: moveOutDate,
      ready: readyDate,
      lease: leaseDate,
    });
    if (typeof window === 'undefined') return `?${q.toString()}`;
    return `${window.location.origin}${window.location.pathname}?${q.toString()}`;
  }, [monthlyRent, moveOutDate, readyDate, leaseDate]);

  const copyLink = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  }, [shareUrl]);

  const ctaHref = metrics
    ? `${intakeHref}?type=vacancy&days=${metrics.operationalDays}&exposure=${metrics.operationalExposure}&total=${metrics.totalExposure}`
    : intakeHref;

  return (
    <div className="w-full mx-auto overflow-hidden" style={shellStyle}>
      <style>{sharedCss}</style>

      <div className="p-5 sm:p-7" style={bodyStyle}>
        <div className="inline-flex items-center" style={eyebrowTab}>
          PropOps8 // Vacancy recovery audit
        </div>

        <h2 className="uppercase" style={{ ...headingStyle, margin: '18px 0 8px' }}>
          The vacancy black hole
        </h2>
        <p
          style={{
            fontFamily: DISPLAY,
            fontSize: 15,
            lineHeight: 1.5,
            color: hexA('#ffffff', 0.62),
            margin: '0 0 20px',
            maxWidth: '40rem',
          }}
        >
          How many rent-paying days disappeared before the unit was actually ready to show?
        </p>

        {/* --------------------------------------------------------- inputs */}
        <div className="p-5 sm:p-6" style={panelStyle}>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Field label="Monthly rent" hint={errors.rent}>
              <input
                className="chaos-input"
                type="number"
                inputMode="decimal"
                min={0}
                step={25}
                value={rentInput}
                onChange={(e) => setRentInput(e.target.value)}
                style={inputStyle}
                aria-invalid={Boolean(errors.rent)}
              />
            </Field>

            <Field label="Move-out date">
              <input
                className="chaos-input"
                type="date"
                value={moveOutDate}
                onChange={(e) => setMoveOutDate(e.target.value)}
                style={inputStyle}
              />
            </Field>

            <Field label="Rent-ready date" hint={errors.ready}>
              <input
                className="chaos-input"
                type="date"
                value={readyDate}
                onChange={(e) => setReadyDate(e.target.value)}
                style={inputStyle}
                aria-invalid={Boolean(errors.ready)}
              />
            </Field>

            <Field label="Lease signed date" hint={errors.lease}>
              <input
                className="chaos-input"
                type="date"
                value={leaseDate}
                onChange={(e) => setLeaseDate(e.target.value)}
                style={inputStyle}
                aria-invalid={Boolean(errors.lease)}
              />
            </Field>
          </div>
        </div>

        {/* -------------------------------------------------------- results */}
        <div className="p-5 sm:p-6" style={{ ...cardStyle, marginTop: 16 }}>
          {!metrics ? (
            <p
              style={{
                fontFamily: MONO,
                fontSize: 12.5,
                letterSpacing: '0.08em',
                color: hexA(PALETTE.pink, 0.9),
                margin: 0,
              }}
            >
              Fix the highlighted fields to see the calculation.
            </p>
          ) : (
            <>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                <div>
                  <div style={utilityLabel}>Recoverable exposure &mdash; make-ready delay</div>
                  <div style={{ ...figureStyle(PALETTE.pink), marginTop: 10 }}>
                    {money(metrics.operationalExposure, currency)}
                  </div>
                  <div
                    style={{
                      ...utilityLabel,
                      fontSize: 10.5,
                      letterSpacing: '0.13em',
                      marginTop: 10,
                      color: hexA('#ffffff', 0.45),
                    }}
                  >
                    {metrics.operationalDays} days &times; {money(metrics.dailyRent, currency)}/day
                  </div>
                </div>

                <div>
                  <div style={utilityLabel}>Total vacancy</div>
                  <div style={{ ...figureStyle(PALETTE.bright), marginTop: 10 }}>
                    {metrics.totalDays} days
                  </div>
                  <div
                    style={{
                      ...utilityLabel,
                      fontSize: 10.5,
                      letterSpacing: '0.13em',
                      marginTop: 10,
                      color: hexA('#ffffff', 0.45),
                    }}
                  >
                    {money(metrics.totalExposure, currency)} gross rent lost
                  </div>
                </div>
              </div>

              {/* split bar — operational vs leasing, torn apart */}
              <div style={{ marginTop: 26 }}>
                <div
                  className="flex items-center justify-between"
                  style={{ marginBottom: 10, gap: 12, flexWrap: 'wrap' }}
                >
                  <span
                    style={{
                      fontFamily: MONO,
                      fontSize: 11,
                      letterSpacing: '0.12em',
                      textTransform: 'uppercase',
                      color: PALETTE.pink,
                    }}
                  >
                    {metrics.operationalDays} days &middot; Make-ready
                  </span>
                  <span
                    style={{
                      fontFamily: MONO,
                      fontSize: 11,
                      letterSpacing: '0.12em',
                      textTransform: 'uppercase',
                      color: PALETTE.cyan,
                    }}
                  >
                    {metrics.leasingDays} days &middot; Leasing
                  </span>
                </div>

                <div className="flex" style={{ gap: 6, height: 34 }}>
                  <div
                    className="chaos-anim"
                    style={{
                      width: `${metrics.operationalPercent}%`,
                      minWidth: metrics.operationalDays > 0 ? 6 : 0,
                      borderRadius: 6,
                      background: `linear-gradient(180deg, #ff4d80 0%, ${PALETTE.pink} 60%, #e01050 100%)`,
                      boxShadow: `0 0 18px ${hexA(PALETTE.pink, 0.6)}`,
                      transition: 'width 500ms cubic-bezier(.2,.8,.2,1)',
                    }}
                  />
                  <div
                    className="chaos-anim"
                    style={{
                      width: `${metrics.leasingPercent}%`,
                      minWidth: metrics.leasingDays > 0 ? 6 : 0,
                      borderRadius: 6,
                      background: `linear-gradient(180deg, #5ef0ff 0%, ${PALETTE.cyan} 60%, #0fb6d4 100%)`,
                      boxShadow: `0 0 18px ${hexA(PALETTE.cyan, 0.6)}`,
                      transition: 'width 500ms cubic-bezier(.2,.8,.2,1)',
                    }}
                  />
                </div>

                <div
                  style={{
                    ...utilityLabel,
                    fontSize: 10,
                    letterSpacing: '0.13em',
                    marginTop: 12,
                    color: hexA('#ffffff', 0.42),
                  }}
                >
                  {Math.round(metrics.operationalPercent)}% of the vacancy was operations, not
                  demand
                </div>
              </div>
            </>
          )}
        </div>

        {/* ---------------------------------------------------------- quote */}
        <p
          style={{
            fontFamily: DISPLAY,
            fontSize: 'clamp(1rem, 2vw, 1.2rem)',
            lineHeight: 1.45,
            color: '#dbe5f5',
            margin: '20px 0 0',
            paddingLeft: 16,
            borderLeft: `2px solid ${PALETTE.pink}`,
          }}
        >
          The unit wasn&rsquo;t waiting for a tenant. It was waiting for operations.
        </p>

        {/* ------------------------------------------------------------ CTA */}
        <div
          className="flex flex-col sm:flex-row sm:items-center gap-3"
          style={{ marginTop: 22 }}
        >
          <a
            href={ctaHref}
            className="chaos-cta inline-flex items-center justify-between gap-3 flex-1"
            style={ctaStyle()}
            aria-disabled={!metrics}
          >
            <span>{ctaLabel}</span>
            <span aria-hidden="true" style={{ fontSize: 15 }}>
              &rarr;
            </span>
          </a>

          <button
            type="button"
            onClick={copyLink}
            className="chaos-focus"
            style={{
              fontFamily: MONO,
              fontSize: 11,
              letterSpacing: '0.12em',
              textTransform: 'uppercase',
              color: copied ? PALETTE.mint : hexA('#ffffff', 0.7),
              background: 'transparent',
              border: `1px solid ${hexA('#ffffff', 0.16)}`,
              borderRadius: 9,
              padding: '13px 18px',
              cursor: 'pointer',
              whiteSpace: 'nowrap',
            }}
          >
            {copied ? 'Link copied' : 'Copy prefilled link'}
          </button>
        </div>

        <p
          style={{
            ...utilityLabel,
            fontSize: 10,
            letterSpacing: '0.12em',
            marginTop: 14,
            color: hexA('#ffffff', 0.38),
            lineHeight: 1.6,
          }}
        >
          Deterministic calculation. Daily rate = monthly rent &divide; {daysPerMonth}. Runs
          entirely in your browser &mdash; nothing is submitted or stored.
        </p>
      </div>
    </div>
  );
}
