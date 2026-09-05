/**
 * app/about/page.tsx
 * ----------------------------------------------------------------------------
 * The owner profile, at /about. It answers the only question a serious buyer
 * has before spending $497 with an unfamiliar vendor: has this person done the
 * work, or did they read about it?
 *
 * IMAGES
 *
 * Three, each behind a flag at the top of the file. A missing <img> renders as
 * a broken-image icon, which reads worse than no picture — so a flag stays
 * false until the file is actually in /public/assets/.
 *
 *   daniel.jpg       portrait
 *   ugly8-mark.jpg   the cast infinity object. Light background, so it is
 *                    framed as a photographed object rather than dropped on
 *                    the dark page, where it would read as a white box.
 *   trifecta.jpg     parent brand mark. Placed last, small, without the
 *                    "power / unity / purpose" line — a buyer evaluating an
 *                    audit gains nothing from brand architecture, but it
 *                    belongs on a page about the person if it belongs anywhere.
 *
 * WHAT IS DELIBERATELY ABSENT
 *
 * No current employer named. No resident detail, unit numbers, or inspection
 * findings from the source correspondence — it contains tenant names, tenant
 * codes, and conditions tied to units. The credibility here does not depend on
 * any of it.
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

/* --- flip to true once each file exists in /public/assets/ --------------- */
const HAS_PORTRAIT = true;
const HAS_UGLY8_MARK = true;
const HAS_TRIFECTA = true;

const TOOLS = [
  {
    name: 'Vacancy calculator',
    href: CALCULATOR,
    line: 'Rent-ready is a date. Vacant is a duration. If your reports track only one, the days between move-out and rent-ready never get counted as anything but market softness.',
  },
  {
    name: 'Ledger screening',
    href: INGEST,
    line: 'A repeat visit is either a new fault or the same one returning. Your work-order history knows which. The summary report does not.',
  },
  {
    name: 'Operations audit',
    href: AUDIT,
    line: 'A vendor holding most of your spend is not a verdict. It is a reason to check pricing and response times against somebody else.',
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
      <section className="mx-auto px-5 sm:px-8" style={{ maxWidth: 900, padding: '52px 20px 0' }}>
        <span className="inline-flex items-center" style={eyebrowTab}>
          PropOps8 // Who runs this
        </span>

        <div
          className="flex flex-col sm:flex-row sm:items-start"
          style={{ gap: 26, marginTop: 22 }}
        >
          {HAS_PORTRAIT && (
            <div
              className="overflow-hidden shrink-0"
              style={{
                width: 168,
                borderRadius: 14,
                border: `1px solid ${hexA('#ffffff', 0.12)}`,
                alignSelf: 'flex-start',
              }}
            >
              <img
                src="/assets/daniel.jpg"
                alt="Daniel Ebuehi"
                width={336}
                height={420}
                style={{ width: '100%', height: 'auto', display: 'block' }}
              />
            </div>
          )}

          <div style={{ flex: '1 1 auto', minWidth: 0 }}>
            <h1
              style={{
                fontFamily: DISPLAY,
                fontWeight: 900,
                fontSize: 'clamp(1.85rem, 5vw, 2.7rem)',
                lineHeight: 1.05,
                letterSpacing: '-0.03em',
                color: PALETTE.bright,
                margin: 0,
              }}
            >
              Daniel Ebuehi
            </h1>

            <p
              style={{
                fontFamily: MONO,
                fontSize: 11,
                letterSpacing: '0.12em',
                textTransform: 'uppercase',
                color: PALETTE.cyan,
                margin: '12px 0 0',
                lineHeight: 1.8,
              }}
            >
              California DRE #02224369
              <br />
              FAA Part 107 #4229607 &middot; M.Arch, UPenn
            </p>

            <p
              style={{
                fontSize: 15.5,
                lineHeight: 1.65,
                color: hexA('#ffffff', 0.66),
                margin: '16px 0 0',
              }}
            >
              I manage a 114-unit permanent supportive housing property in downtown Los Angeles.
              Before that, a 58-unit SRO in Skid Row. Before that, fifteen years designing
              buildings.
            </p>
          </div>
        </div>
      </section>

      {/* ================================================ THE STORY ======== */}
      <section className="mx-auto px-5 sm:px-8" style={{ maxWidth: 900, padding: '30px 20px 8px' }}>
        <div
          className="p-5 sm:p-7"
          style={{ ...panelStyle, borderLeft: `2px solid ${PALETTE.cyan}`, borderRadius: 12 }}
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

          <p style={{ fontSize: 16, lineHeight: 1.7, color: hexA('#ffffff', 0.7), margin: '18px 0 0' }}>
            The rest were boarded up. Not mid-turn &mdash; sealed. Nobody was walking them, and a
            vacant unit nobody walks gets broken into, which turns a two-day clean into a full
            turn. Twelve units of contract rent sat behind plywood while the vacancy report called
            it a leasing problem.
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
      <section className="mx-auto px-5 sm:px-8" style={{ maxWidth: 900, padding: '38px 20px' }}>
        <span style={utilityLabel}>The baseline</span>

        <p style={{ fontSize: 16, lineHeight: 1.7, color: hexA('#ffffff', 0.7), margin: '16px 0 0', maxWidth: '62ch' }}>
          Eight years in Southern California property operations, most of it in subsidised and
          permanent supportive housing. Right now that means compliance inspections from four
          separate agencies, abatement tracking, work orders through a maintenance team shared
          across buildings, and vacant-unit turns held to housing-authority standards.
        </p>

        <p style={{ fontSize: 16, lineHeight: 1.7, color: hexA('#ffffff', 0.7), margin: '14px 0 0', maxWidth: '62ch' }}>
          Before that, the SRO on Skid Row &mdash; a building over a century old &mdash; plus
          rotating coverage of roughly 460 more units across seven buildings on the same street.
        </p>

        <p style={{ fontSize: 16, lineHeight: 1.7, color: hexA('#ffffff', 0.7), margin: '14px 0 0', maxWidth: '62ch' }}>
          Affordable housing does not become affordable because the rent is restricted. Every
          dollar lost to rework, vacancy and avoidable repair is a dollar that cannot preserve or
          create a unit. That is the whole reason this exists.
        </p>
      </section>

      {/* ================================================== THE UGLY8 ====== */}
      <section style={{ background: PALETTE.shell, borderTop: `1px solid ${hexA('#ffffff', 0.05)}` }}>
        <div className="mx-auto px-5 sm:px-8" style={{ maxWidth: 900, padding: '52px 20px' }}>
          <div
            className="flex flex-col sm:flex-row sm:items-center"
            style={{ gap: 28, marginBottom: 32 }}
          >
            {HAS_UGLY8_MARK && (
              <div
                className="shrink-0 overflow-hidden"
                style={{
                  width: 152,
                  borderRadius: 12,
                  border: `1px solid ${hexA('#ffffff', 0.14)}`,
                  padding: 6,
                  background: hexA('#ffffff', 0.04),
                }}
              >
                <img
                  src="/assets/ugly8-mark.jpg"
                  alt="The Ugly8 mark — a cast infinity form"
                  width={304}
                  height={304}
                  loading="lazy"
                  style={{ width: '100%', height: 'auto', display: 'block', borderRadius: 7 }}
                />
              </div>
            )}

            <div style={{ flex: '1 1 auto', minWidth: 0 }}>
              <span style={utilityLabel}>Why the reading is different</span>
              <h2
                style={{
                  fontFamily: DISPLAY,
                  fontWeight: 800,
                  fontSize: 'clamp(1.4rem, 3.2vw, 1.95rem)',
                  letterSpacing: '-0.025em',
                  lineHeight: 1.15,
                  color: PALETTE.bright,
                  margin: '12px 0 12px',
                }}
              >
                A building, an operation and an asset are three different documents
              </h2>
              <p style={{ fontSize: 15.5, lineHeight: 1.65, color: hexA('#ffffff', 0.66), margin: 0 }}>
                M.Arch and a Certificate in Ecological Architecture from the University of
                Pennsylvania School of Design, fifteen years designing and drafting before
                operations, a real estate licence and a remote pilot certificate. Most people
                looking at these properties read one of the three. The leaks happen where the
                readings disagree.
              </p>
            </div>
          </div>

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
                <p style={{ fontSize: 14, lineHeight: 1.6, color: hexA('#ffffff', 0.64), margin: '10px 0 0' }}>
                  {t.line}
                </p>
              </a>
            ))}
          </div>
        </div>
      </section>

      {/* ================================================== STANDARD ======= */}
      <section className="mx-auto px-5 sm:px-8" style={{ maxWidth: 900, padding: '52px 20px 0' }}>
        <div className="p-5 sm:p-6" style={cardStyle}>
          <div style={utilityLabel}>The standard</div>
          <p style={{ fontSize: 15.5, lineHeight: 1.7, color: hexA('#ffffff', 0.7), margin: '14px 0 0' }}>
            No theoretical savings claims, no invented customer examples, no round numbers I
            can&rsquo;t show the arithmetic for. A report states the pattern found in your data and
            the method used to measure it, and says so plainly where the data can&rsquo;t support a
            conclusion.
          </p>
          <p style={{ fontSize: 15.5, lineHeight: 1.7, color: hexA('#ffffff', 0.7), margin: '12px 0 0' }}>
            I don&rsquo;t inspect your property, interview your staff, or check your export against
            source documents. Findings are observations about operational data &mdash; not
            allegations about your vendors or your team. It is also not brokerage, legal or
            accounting advice.
          </p>
        </div>
      </section>

      {/* ==================================================== CTAS ========= */}
      <section className="mx-auto px-5 sm:px-8" style={{ maxWidth: 900, padding: '34px 20px 0' }}>
        <div className="flex flex-wrap gap-3">
          <a href={CALCULATOR} className="chaos-cta inline-flex items-center gap-3" style={ctaStyle()}>
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
            marginTop: 20,
          }}
        >
          Questions before you buy? daniel@propops8.com &mdash; I answer these myself.
        </p>
      </section>

      {/* =================================================== PARENT ======== */}
      {HAS_TRIFECTA && (
        <section className="mx-auto px-5 sm:px-8" style={{ maxWidth: 900, padding: '56px 20px 72px' }}>
          <div
            className="flex items-center"
            style={{
              gap: 20,
              paddingTop: 26,
              borderTop: `1px solid ${hexA('#ffffff', 0.07)}`,
            }}
          >
            <img
              src="/assets/trifecta.jpg"
              alt="Trifecta"
              width={168}
              height={168}
              loading="lazy"
              style={{
                width: 84,
                height: 'auto',
                display: 'block',
                borderRadius: 10,
                flexShrink: 0,
                opacity: 0.85,
              }}
            />
            <p
              style={{
                fontFamily: MONO,
                fontSize: 11,
                lineHeight: 1.9,
                letterSpacing: '0.05em',
                color: hexA('#ffffff', 0.45),
                margin: 0,
              }}
            >
              PropOps8 is one of three connected efforts &mdash; finding the property, financing
              it, and operating it. The operations half is the one that sells to people who
              already own buildings.
            </p>
          </div>
        </section>
      )}
    </main>
  );
}
