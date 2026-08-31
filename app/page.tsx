/**
 * app/page.tsx
 * ----------------------------------------------------------------------------
 * The landing page. Server Component — no hooks, no state. Every interactive
 * thing here is a link.
 *
 * FOUR CORRECTIONS IN THIS VERSION
 *
 * 1. The ladder reads from lib/products.ts instead of a local array. It said
 *    "$39 — Maintenance Leak Workbook", a product that does not exist under
 *    that name; the real one is "$49 — Property Operations Automation Kit".
 *    A price on the page that differs from the price at checkout is the kind
 *    of thing a careful buyer treats as a warning sign.
 *
 * 2. The $39 and $99 buttons both pointed at the calculator. Someone clicking
 *    "See the workbook" landed on a vacancy calculator. They now go to the
 *    actual Gumroad listings.
 *
 * 3. Widget images load from /widgets/sm/ — 600px versions of cards that were
 *    shipping at 1200px to render at ~260px wide. Roughly a 4x reduction on
 *    the heaviest part of the page, which matters because most LinkedIn
 *    traffic is on phones.
 *
 * 4. The footer is gone. SiteFooter renders from app/layout.tsx now, so
 *    keeping this one produced two stacked footers on the home page.
 *
 * IMAGES ARE PLAIN <img>, NOT next/image. Deliberate: next/image on Netlify
 * needs the plugin configured for image optimisation, and a broken image on
 * deploy is worse than an unoptimised one. Explicit width/height everywhere so
 * nothing shifts as it loads; lazy below the fold; fetchPriority high on the
 * hero, which is the LCP element.
 */

import type { Metadata } from 'next';
import {
  PALETTE,
  MONO,
  DISPLAY,
  hexA,
  cardStyle,
  utilityLabel,
  eyebrowTab,
  ctaStyle,
  ghostCtaStyle,
  sharedCss,
} from '@/lib/chaosTokens';
import { PROPOPS8_LADDER, CALCULATOR, AUDIT } from '@/lib/products';

export const metadata: Metadata = {
  title: 'PropOps8 — find out where your property is losing money',
  description:
    'Most vacancy reports show one number. PropOps8 separates the days your unit spent waiting for operations from the days it spent waiting for a tenant.',
  openGraph: {
    title: 'Find out where your property is losing money',
    description:
      'Operational vacancy vs. leasing vacancy, repeat callbacks, vendor concentration. Free diagnostic, no signup.',
    url: 'https://propops8.com',
    images: [{ url: '/og/calculator.png', width: 1200, height: 630 }],
  },
  twitter: {
    title: 'Find out where your property is losing money',
    description: 'Free operational vacancy diagnostic. Runs in your browser.',
    images: ['/og/calculator.png'],
  },
};

/* -------------------------------------------------------------------------- */
/*  Content                                                                    */
/* -------------------------------------------------------------------------- */

/** Slugs match /public/widgets/sm/*.png. Lines are the widgets' own copy. */
const DIAGNOSTICS = [
  {
    slug: 'vacancy-black-hole',
    name: 'Vacancy Black Hole',
    line: "The unit wasn't waiting for a tenant. It was waiting for operations.",
  },
  {
    slug: 'callback-nightmare',
    name: 'Callback Nightmare',
    line: "The work order was closed. The problem wasn't.",
  },
  {
    slug: 'vendor-money-pit',
    name: 'Vendor Money Pit',
    line: 'One vendor holds 71% of spend, and nobody has benchmarked them.',
  },
  {
    slug: 'deadline-graveyard',
    name: 'Deadline Graveyard',
    line: 'Nothing looked like an emergency until everything became one.',
  },
  {
    slug: 'automation-graveyard',
    name: 'Automation Graveyard',
    line: "The automation didn't crash. It stopped doing the thing you thought it did.",
  },
  {
    slug: 'asset-health-nightmare',
    name: 'Asset Health Nightmare',
    line: 'A property rarely becomes expensive overnight.',
  },
  {
    slug: 'utility-energy-bleed',
    name: 'Utility Energy Bleed',
    line: 'The utility bill arrived. Nobody investigated the variance.',
  },
  {
    slug: 'operations-chaos-index',
    name: 'Operations Chaos Index',
    line: "Your problem isn't one bad work order. It's the accumulation.",
  },
];

const SEGMENTS = [
  {
    title: 'Institutional & endowment portfolios',
    body: 'Turn-time and callback data rolled into the NOI conversation your asset managers are already having, with the arithmetic shown so analysts can check it.',
  },
  {
    title: 'SRO operators',
    body: 'Older buildings, tight margins, long turns. The audit separates the days lost to scope and procurement from the days lost to demand.',
  },
  {
    title: 'Affordable housing organisations',
    body: 'Compliance-driven operations. Findings framed around inspection readiness and documented response time, not NOI upside.',
  },
];

/* -------------------------------------------------------------------------- */
/*  Page                                                                       */
/* -------------------------------------------------------------------------- */

export default function LandingPage() {
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

      {/* ==================================================== HERO ========= */}
      <section
        className="relative"
        style={{ minHeight: 'min(84vh, 720px)', display: 'flex', alignItems: 'center' }}
      >
        <img
          src="/assets/lounge-demolition.webp"
          alt=""
          aria-hidden="true"
          width={2560}
          height={1280}
          fetchPriority="high"
          style={{
            position: 'absolute',
            inset: 0,
            width: '100%',
            height: '100%',
            objectFit: 'cover',
            objectPosition: 'center',
          }}
        />
        <div
          aria-hidden="true"
          style={{
            position: 'absolute',
            inset: 0,
            background: `linear-gradient(180deg, ${hexA(PALETTE.void, 0.72)} 0%, ${hexA(PALETTE.void, 0.82)} 45%, ${PALETTE.void} 100%)`,
          }}
        />

        <div
          className="relative w-full mx-auto px-5 sm:px-8"
          style={{ maxWidth: 1120, paddingTop: 64, paddingBottom: 64 }}
        >
          <span className="inline-flex items-center" style={eyebrowTab}>
            PropOps8 // Operations intelligence
          </span>

          <h1
            style={{
              fontFamily: DISPLAY,
              fontWeight: 900,
              fontSize: 'clamp(2.1rem, 6.4vw, 4rem)',
              lineHeight: 1.03,
              letterSpacing: '-0.03em',
              color: PALETTE.bright,
              margin: '22px 0 0',
              maxWidth: '18ch',
            }}
          >
            Find out where your property is losing money
          </h1>

          <p
            style={{
              fontSize: 'clamp(1.02rem, 2.2vw, 1.3rem)',
              lineHeight: 1.55,
              color: hexA('#ffffff', 0.72),
              margin: '22px 0 0',
              maxWidth: '46ch',
            }}
          >
            Most reports show one number: the unit was empty 31 days. They don&rsquo;t tell you
            that 27 of those days were operations, and only 4 were demand.
          </p>

          <div className="flex flex-wrap gap-3" style={{ marginTop: 30 }}>
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
              See the $497 audit
            </a>
          </div>

          <p style={{ ...utilityLabel, fontSize: 10, letterSpacing: '0.14em', marginTop: 20 }}>
            No signup &middot; Runs in your browser &middot; Nothing transmits
          </p>
        </div>
      </section>

      {/* ============================================== DIAGNOSTICS ======== */}
      <section className="mx-auto px-5 sm:px-8" style={{ maxWidth: 1120, padding: '64px 20px' }}>
        <span style={utilityLabel}>The Ugly8</span>
        <h2
          style={{
            fontFamily: DISPLAY,
            fontWeight: 800,
            fontSize: 'clamp(1.6rem, 4vw, 2.4rem)',
            letterSpacing: '-0.025em',
            lineHeight: 1.1,
            color: PALETTE.bright,
            margin: '14px 0 10px',
            maxWidth: '22ch',
          }}
        >
          Eight ways a portfolio leaks money quietly
        </h2>
        <p
          style={{
            fontSize: 16,
            lineHeight: 1.6,
            color: hexA('#ffffff', 0.6),
            margin: '0 0 34px',
            maxWidth: '58ch',
          }}
        >
          None of these show up as a line item. They show up as NOI that keeps underperforming a
          portfolio that looks fine on paper.
        </p>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {DIAGNOSTICS.map((d) => (
            <a
              key={d.slug}
              href={CALCULATOR}
              className="chaos-tile chaos-focus block overflow-hidden"
              style={{ ...cardStyle, textDecoration: 'none' }}
            >
              <img
                src={`/widgets/sm/${d.slug}.png`}
                alt={`${d.name} diagnostic card`}
                width={600}
                height={600}
                loading="lazy"
                style={{ width: '100%', height: 'auto', display: 'block' }}
              />
              <div style={{ padding: '16px 16px 18px' }}>
                <div
                  style={{
                    fontFamily: MONO,
                    fontSize: 11.5,
                    letterSpacing: '0.13em',
                    textTransform: 'uppercase',
                    color: PALETTE.cyan,
                  }}
                >
                  {d.name}
                </div>
                <p
                  style={{
                    fontSize: 13.5,
                    lineHeight: 1.5,
                    color: hexA('#ffffff', 0.66),
                    margin: '9px 0 0',
                  }}
                >
                  {d.line}
                </p>
              </div>
            </a>
          ))}
        </div>
      </section>

      {/* ============================================ THE ARGUMENT ========= */}
      <section
        style={{ background: PALETTE.shell, borderTop: `1px solid ${hexA('#ffffff', 0.05)}` }}
      >
        <div
          className="mx-auto px-5 sm:px-8 grid grid-cols-1 lg:grid-cols-2 gap-10 items-center"
          style={{ maxWidth: 1120, padding: '72px 20px' }}
        >
          <div className="overflow-hidden" style={{ borderRadius: 16 }}>
            <img
              src="/assets/money-pit-room.webp"
              alt="Illustration: a unit sitting empty while operations stall"
              width={1200}
              height={1200}
              loading="lazy"
              style={{ width: '100%', height: 'auto', display: 'block' }}
            />
          </div>

          <div>
            <span style={utilityLabel}>The distinction nobody reports</span>
            <h2
              style={{
                fontFamily: DISPLAY,
                fontWeight: 800,
                fontSize: 'clamp(1.5rem, 3.6vw, 2.2rem)',
                letterSpacing: '-0.025em',
                lineHeight: 1.15,
                color: PALETTE.bright,
                margin: '14px 0 18px',
              }}
            >
              Operational vacancy is not leasing vacancy
            </h2>
            <p
              style={{ fontSize: 16.5, lineHeight: 1.65, color: hexA('#ffffff', 0.72), margin: 0 }}
            >
              When a unit sits empty, your software logs one number and treats the whole span as a
              leasing problem. But most of that time usually passes before the unit is even
              showable &mdash; waiting on inspection, scope, procurement, a contractor, a final
              clean.
            </p>

            <div className="grid grid-cols-2 gap-4" style={{ margin: '26px 0', maxWidth: 420 }}>
              <div style={{ ...cardStyle, padding: '18px 18px 20px' }}>
                <div style={{ ...utilityLabel, fontSize: 10 }}>Make-ready</div>
                <div
                  style={{
                    fontFamily: DISPLAY,
                    fontWeight: 900,
                    fontSize: 34,
                    lineHeight: 1,
                    letterSpacing: '-0.03em',
                    color: PALETTE.pink,
                    marginTop: 10,
                  }}
                >
                  27 days
                </div>
              </div>
              <div style={{ ...cardStyle, padding: '18px 18px 20px' }}>
                <div style={{ ...utilityLabel, fontSize: 10 }}>Leasing</div>
                <div
                  style={{
                    fontFamily: DISPLAY,
                    fontWeight: 900,
                    fontSize: 34,
                    lineHeight: 1,
                    letterSpacing: '-0.03em',
                    color: PALETTE.cyan,
                    marginTop: 10,
                  }}
                >
                  4 days
                </div>
              </div>
            </div>

            <p
              style={{
                fontSize: 15,
                lineHeight: 1.6,
                color: hexA('#ffffff', 0.55),
                margin: '0 0 24px',
              }}
            >
              At $2,100/month, those 27 operational days are $1,890 you could have recovered. The
              other four were the market. Sample figures &mdash; put your own dates in the
              calculator.
            </p>

            <a
              href={CALCULATOR}
              className="chaos-cta inline-flex items-center gap-3"
              style={ctaStyle()}
            >
              Split your last turn
              <span aria-hidden="true" style={{ fontSize: 15 }}>
                &rarr;
              </span>
            </a>
          </div>
        </div>
      </section>

      {/* ================================================ SEGMENTS ========= */}
      <section className="mx-auto px-5 sm:px-8" style={{ maxWidth: 1120, padding: '68px 20px' }}>
        <span style={utilityLabel}>Who this is for</span>
        <h2
          style={{
            fontFamily: DISPLAY,
            fontWeight: 800,
            fontSize: 'clamp(1.5rem, 3.6vw, 2.2rem)',
            letterSpacing: '-0.025em',
            lineHeight: 1.15,
            color: PALETTE.bright,
            margin: '14px 0 34px',
          }}
        >
          Same diagnosis. Different consequence.
        </h2>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {SEGMENTS.map((s) => (
            <div key={s.title} style={{ ...cardStyle, padding: '24px 22px 26px' }}>
              <div
                style={{
                  width: 30,
                  height: 3,
                  borderRadius: 999,
                  background: PALETTE.cyan,
                  boxShadow: `0 0 12px ${hexA(PALETTE.cyan, 0.7)}`,
                  marginBottom: 18,
                }}
              />
              <h3
                style={{
                  fontFamily: DISPLAY,
                  fontWeight: 700,
                  fontSize: 17,
                  lineHeight: 1.3,
                  color: PALETTE.bright,
                  margin: '0 0 10px',
                }}
              >
                {s.title}
              </h3>
              <p
                style={{ fontSize: 14.5, lineHeight: 1.6, color: hexA('#ffffff', 0.62), margin: 0 }}
              >
                {s.body}
              </p>
            </div>
          ))}
        </div>
      </section>

      {/* ================================================== LADDER ========= */}
      <section
        style={{ background: PALETTE.shell, borderTop: `1px solid ${hexA('#ffffff', 0.05)}` }}
      >
        <div className="mx-auto px-5 sm:px-8" style={{ maxWidth: 1120, padding: '68px 20px' }}>
          <span style={utilityLabel}>Start anywhere</span>
          <h2
            style={{
              fontFamily: DISPLAY,
              fontWeight: 800,
              fontSize: 'clamp(1.5rem, 3.6vw, 2.2rem)',
              letterSpacing: '-0.025em',
              lineHeight: 1.15,
              color: PALETTE.bright,
              margin: '14px 0 34px',
            }}
          >
            Do it yourself, or send me the export
          </h2>

          {/* Prices, names and links all come from lib/products.ts, which is
              the same file the rest of the site reads. One place to change. */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {PROPOPS8_LADDER.map((t) => {
              const external = t.href.startsWith('http');
              return (
                <div
                  key={t.name}
                  className="flex flex-col"
                  style={{
                    ...cardStyle,
                    padding: '24px 22px 26px',
                    border: t.featured
                      ? `1px solid ${hexA(PALETTE.cyan, 0.45)}`
                      : `1px solid ${hexA('#ffffff', 0.05)}`,
                    boxShadow: t.featured ? `0 0 32px ${hexA(PALETTE.cyan, 0.14)}` : 'none',
                  }}
                >
                  <div
                    style={{
                      fontFamily: DISPLAY,
                      fontWeight: 900,
                      fontSize: 30,
                      lineHeight: 1,
                      letterSpacing: '-0.03em',
                      color: t.featured ? PALETTE.cyan : PALETTE.bright,
                    }}
                  >
                    {t.price}
                  </div>
                  <div
                    style={{
                      fontFamily: MONO,
                      fontSize: 11,
                      letterSpacing: '0.13em',
                      textTransform: 'uppercase',
                      color: hexA('#ffffff', 0.6),
                      margin: '12px 0',
                      lineHeight: 1.5,
                    }}
                  >
                    {t.name}
                  </div>
                  <p
                    style={{
                      fontSize: 14,
                      lineHeight: 1.6,
                      color: hexA('#ffffff', 0.62),
                      margin: '0 0 20px',
                      flex: '1 1 auto',
                    }}
                  >
                    {t.body}
                  </p>
                  <a
                    href={t.href}
                    {...(external ? { target: '_blank', rel: 'noopener noreferrer' } : {})}
                    className={
                      t.featured
                        ? 'chaos-cta inline-flex items-center justify-center'
                        : 'chaos-ghost inline-flex items-center justify-center'
                    }
                    style={t.featured ? ctaStyle() : ghostCtaStyle()}
                  >
                    {t.cta}
                  </a>
                </div>
              );
            })}
          </div>

          <p style={{ ...utilityLabel, fontSize: 10, letterSpacing: '0.14em', marginTop: 24 }}>
            48-hour turnaround &middot; De-identified data accepted &middot; No software
            subscription required
          </p>
        </div>
      </section>

      {/* =================================================== CLOSE ========= */}
      <section className="relative overflow-hidden">
        <img
          src="/assets/money-pit-stack.webp"
          alt=""
          aria-hidden="true"
          width={1200}
          height={1500}
          loading="lazy"
          style={{
            position: 'absolute',
            inset: 0,
            width: '100%',
            height: '100%',
            objectFit: 'cover',
            objectPosition: 'center 30%',
          }}
        />
        <div
          aria-hidden="true"
          style={{
            position: 'absolute',
            inset: 0,
            background: `linear-gradient(180deg, ${PALETTE.void} 0%, ${hexA(PALETTE.void, 0.78)} 40%, ${PALETTE.void} 100%)`,
          }}
        />
        <div
          className="relative mx-auto px-5 sm:px-8 text-center"
          style={{ maxWidth: 720, padding: '96px 20px' }}
        >
          <p
            style={{
              fontFamily: DISPLAY,
              fontSize: 'clamp(1.3rem, 3.4vw, 1.9rem)',
              fontWeight: 600,
              lineHeight: 1.4,
              color: PALETTE.bright,
              margin: '0 0 28px',
            }}
          >
            A property rarely becomes expensive overnight. The warning signs arrive one work order
            at a time.
          </p>
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
        </div>
      </section>

      {/* No footer here — SiteFooter renders from app/layout.tsx on every route. */}
    </main>
  );
}
