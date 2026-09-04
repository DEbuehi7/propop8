/**
 * app/about/page.tsx
 * ----------------------------------------------------------------------------
 * The owner profile. It answers the only question a serious buyer has before
 * spending $497 with an unfamiliar vendor: has this person done the work, or
 * did they read about it?
 *
 * WHAT THIS PAGE IS NOT
 *
 * It is not a replacement for app/page.tsx, and it is emphatically not a
 * replacement for app/upload/[token]/page.tsx — that route is the upload
 * surface a paying customer opens after a $497 charge. Putting a founder bio
 * there would break the only thing on this site that has to work.
 *
 * WHAT IS DELIBERATELY LEFT OUT
 *
 * No current employer is named. He manages a property for a management company
 * while selling operational analysis to other operators; naming them here
 * drags an employer into a side business without their knowledge.
 *
 * Nothing from the source correspondence. It contains resident names, tenant
 * codes, unit numbers tied to disabilities, and deaths in units. The
 * credibility of this page does not depend on any of it.
 *
 * NUMBERS
 *
 * Every figure here is one he can produce arithmetic for. The SRO recovery is
 * stated as what he did rather than as a peak headline, because a buyer who
 * asks "was that sustained?" deserves an answer that was already in the claim.
 */

import type { Metadata } from 'next';
import {
  PALETTE,
  MONO,
  DISPLAY,
  hexA,
  cardStyle,
  panelStyle,
  utilityLabel,
  eyebrowTab,
  ctaStyle,
  ghostCtaStyle,
  sharedCss,
} from '@/lib/chaosTokens';
import { CALCULATOR, AUDIT, INGEST } from '@/lib/products';

export const metadata: Metadata = {
  title: 'Who runs this — PropOps8',
  description:
    'PropOps8 is run by a working property manager. Skid Row SRO turnarounds, permanent supportive housing, and fifteen years designing buildings before that.',
  openGraph: {
    title: 'Who runs PropOps8',
    description:
      'A working property manager, not a software company. Three of seventeen vacant units rentable, brought to fifteen.',
    images: [{ url: '/og/audit.png', width: 1200, height: 630 }],
  },
};

/* -------------------------------------------------------------------------- */
/*  Set to true once /public/assets/daniel.jpg exists.                         */
/*  A missing <img> renders as a broken-image icon, which reads worse than no  */
/*  photograph at all — so this stays false until the file is actually there.  */
/* -------------------------------------------------------------------------- */
const HAS_PORTRAIT = false;

const TOOLS = [
  {
    name: 'Vacancy calculator',
    href: CALCULATOR,
    line: 'Rent-ready is a date. Vacant is a duration. If your reports only track one, the days between move-out and rent-ready never get counted as anything but market softness.',
  },
  {
    name: 'Ledger screening',
    href: INGEST,
    line: 'A repeat visit is either a new fault or the same one returning. Your work-order history knows which; the summary report does not.',
  },
  {
    name: 'Operations audit',
    href: AUDIT,
    line: 'A vendor holding most of your spend is not a verdict. It is a reason to check pricing and response times against someone else.',
  },
];

export default function AboutPage() {
  return (
    <main
      style={{
        background: PALETTE.void,
        color: PALETTE.body,
        fontFamily: DISPLAY,
        overflowX: 'hidden',
      }}
    >
      <style>{sharedCss}</style>

      {/* ==================================================== INTRO ======== */}
      <section className="mx-auto px-5 sm:px-8" style={{ maxWidth: 860, padding: '52px 20px 0' }}>
        <span className="inline-flex items-center" style={eyebrowTab}>
          PropOps8 // Who runs this
        </span>

        <h1
          style={{
            fontFamily: DISPLAY,
            fontWeight: 900,
            fontSize: 'clamp(1.9rem, 5.2vw, 2.9rem)',
            lineHeight: 1.05,
            letterSpacing: '-0.03em',
            color: PALETTE.bright,
            margin: '20px 0 0',
            maxWidth: '20ch',
          }}
        >
          Daniel Ebuehi
        </h1>

        <p
          style={{
            fontFamily: MONO,
            fontSize: 11.5,
            letterSpacing: '0.13em',
            textTransform: 'uppercase',
            color: PALETTE.cyan,
            margin: '12px 0 0',
          }}
        >
          California DRE #02224369 &middot; FAA Part 107 #4229607 &middot; M.Arch, UPenn
        </p>

        {HAS_PORTRAIT && (
          <div
            className="overflow-hidden"
            style={{
              marginTop: 26,
              borderRadius: 14,
              border: `1px solid ${hexA('#ffffff', 0.1)}`,
              maxWidth: 260,
            }}
          >
            <img
              src="/assets/daniel.jpg"
              alt="Daniel Ebuehi"
              width={520}
              height={520}
              loading="lazy"
              style={{ width: '100%', height: 'auto', display: 'block' }}
            />
          </div>
        )}
      </section>

      {/* ================================================ THE STORY ======== */}
      <section className="mx-auto px-5 sm:px-8" style={{ maxWidth: 860, padding: '30px 20px 8px' }}>
        <div
          className="p-5 sm:p-7"
          style={{
            ...panelStyle,
            borderLeft: `2px solid ${PALETTE.cyan}`,
            borderRadius: 12,
          }}
        >
          <p
            style={{
              fontSize: 'clamp(1.05rem, 2.2vw, 1.28rem)',
              lineHeight: 1.55,
              color: PALETTE.bright,
              margin: 0,
              fontWeight: 500,
            }}
          >
            I took over a 58-unit SRO in Skid Row where three of about seventeen vacant units were
            rentable. I brought that to fifteen.
          </p>

          <p
            style={{
              fontSize: 16,
              lineHeight: 1.7,
              color: hexA('#ffffff', 0.7),
              margin: '18px 0 0',
            }}
          >
            The rest were boarded up. Not mid-turn &mdash; sealed. There was nobody walking them,
            and a vacant unit nobody walks gets broken into, which turns a two-day clean into a
            full turn. Twelve units of contract rent sat behind plywood while the vacancy report
            called it a leasing problem.
          </p>

          <p
            style={{
              fontSize: 16.5,
              lineHeight: 1.6,
              color: PALETTE.bright,
              margin: '18px 0 0',
              fontWeight: 500,
            }}
          >
            I work on the expensive problems that don&rsquo;t show up on a spreadsheet until the
            money is already gone.
          </p>
        </div>
      </section>

      {/* ================================================== BASELINE ======= */}
      <section className="mx-auto px-5 sm:px-8" style={{ maxWidth: 860, padding: '38px 20px' }}>
        <span style={utilityLabel}>The baseline</span>

        <p
          style={{
            fontSize: 16,
            lineHeight: 1.7,
            color: hexA('#ffffff', 0.7),
            margin: '16px 0 0',
            maxWidth: '62ch',
          }}
        >
          Eight years in Southern California property operations, most of it in subsidised and
          permanent supportive housing. Right now that means a 114-unit permanent supportive
          housing property in downtown Los Angeles: compliance inspections from four separate
          agencies, abatement tracking, work orders through a maintenance team shared across
          buildings, and vacant-unit turns held to housing-authority standards.
        </p>

        <p
          style={{
            fontSize: 16,
            lineHeight: 1.7,
            color: hexA('#ffffff', 0.7),
            margin: '14px 0 0',
            maxWidth: '62ch',
          }}
        >
          Before that, the SRO on Skid Row &mdash; a building over a century old &mdash; plus
          rotating coverage of roughly 460 more units across seven buildings on the same street.
        </p>

        <p
          style={{
            fontSize: 16,
            lineHeight: 1.7,
            color: hexA('#ffffff', 0.7),
            margin: '14px 0 0',
            maxWidth: '62ch',
          }}
        >
          Affordable housing does not become affordable because the rent is restricted. Every
          dollar lost to rework, vacancy and avoidable repair is a dollar that cannot preserve or
          create a unit. That is the whole reason this exists.
        </p>
      </section>

      {/* ================================================== THREE WAYS ===== */}
      <section
        style={{ background: PALETTE.shell, borderTop: `1px solid ${hexA('#ffffff', 0.05)}` }}
      >
        <div className="mx-auto px-5 sm:px-8" style={{ maxWidth: 860, padding: '52px 20px' }}>
          <span style={utilityLabel}>Why the reading is different</span>

          <h2
            style={{
              fontFamily: DISPLAY,
              fontWeight: 800,
              fontSize: 'clamp(1.45rem, 3.4vw, 2rem)',
              letterSpacing: '-0.025em',
              lineHeight: 1.15,
              color: PALETTE.bright,
              margin: '14px 0 14px',
              maxWidth: '24ch',
            }}
          >
            A building, an operation, and an asset are three different documents
          </h2>

          <p
            style={{
              fontSize: 16,
              lineHeight: 1.7,
              color: hexA('#ffffff', 0.66),
              margin: '0 0 30px',
              maxWidth: '62ch',
            }}
          >
            I hold an M.Arch and a Certificate in Ecological Architecture from the University of
            Pennsylvania School of Design, spent fifteen years designing and drafting before
            operations, and hold a real estate licence and a remote pilot certificate. Most people
            looking at these properties read one of the three. The leaks happen where the readings
            disagree.
          </p>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {TOOLS.map((t) => (
              <a
                key={t.name}
                href={t.href}
                className="chaos-tile chaos-focus block p-5"
                style={{ ...cardStyle, textDecoration: 'none' }}
              >
                <div
                  style={{
                    fontFamily: MONO,
                    fontSize: 11,
                    letterSpacing: '0.13em',
                    textTransform: 'uppercase',
                    color: PALETTE.cyan,
                  }}
                >
                  {t.name}
                </div>
                <p
                  style={{
                    fontSize: 14,
                    lineHeight: 1.6,
                    color: hexA('#ffffff', 0.64),
                    margin: '10px 0 0',
                  }}
                >
                  {t.line}
                </p>
              </a>
            ))}
          </div>
        </div>
      </section>

      {/* ================================================== STANDARD ======= */}
      <section className="mx-auto px-5 sm:px-8" style={{ maxWidth: 860, padding: '52px 20px' }}>
        <div className="p-5 sm:p-6" style={cardStyle}>
          <div style={utilityLabel}>The standard</div>
          <p
            style={{
              fontSize: 15.5,
              lineHeight: 1.7,
              color: hexA('#ffffff', 0.7),
              margin: '14px 0 0',
            }}
          >
            No theoretical savings claims, no invented customer examples, no round numbers I
            can&rsquo;t show the arithmetic for. A report states the pattern found in your data and
            the method used to measure it, and says so plainly where the data can&rsquo;t support a
            conclusion.
          </p>
          <p
            style={{
              fontSize: 15.5,
              lineHeight: 1.7,
              color: hexA('#ffffff', 0.7),
              margin: '12px 0 0',
            }}
          >
            I don&rsquo;t inspect your property, interview your staff, or check your export against
            source documents. Findings are observations about operational data &mdash; not
            allegations about your vendors or your team. It is also not brokerage, legal, or
            accounting advice.
          </p>
        </div>
      </section>

      {/* ==================================================== CTAS ========= */}
      <section className="mx-auto px-5 sm:px-8" style={{ maxWidth: 860, padding: '0 20px 72px' }}>
        <div className="flex flex-wrap gap-3">
          <a
            href={CALCULATOR}
            className="chaos-cta inline-flex items-center gap-3"
            style={ctaStyle()}
          >
            Run the free diagnostic
            <span aria-hidden="true" style={{ fontSize: 15 }}>
              &rarr;
            </span>
          </a>
          <a href={AUDIT} className="chaos-ghost inline-flex items-center" style={ghostCtaStyle()}>
            Start an audit
          </a>
        </div>

        <p
          style={{
            fontFamily: MONO,
            fontSize: 11.5,
            lineHeight: 1.8,
            letterSpacing: '0.04em',
            color: hexA('#ffffff', 0.5),
            marginTop: 22,
          }}
        >
          Questions before you buy? daniel@propops8.com &mdash; I answer these myself.
        </p>
      </section>
    </main>
  );
}
