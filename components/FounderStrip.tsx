/**
 * components/FounderStrip.tsx
 * ----------------------------------------------------------------------------
 * A short founder block for the landing page. Portrait, one paragraph, one
 * link — the full profile lives at /about.
 *
 * WHY THIS ISN'T THE WHOLE BIO
 *
 * The landing page already runs hero → eight diagnostics → the argument →
 * three audience segments → the price ladder → close. Dropping a full founder
 * profile into that pushes the price ladder below a fourth screen on a phone,
 * where most LinkedIn traffic will be.
 *
 * What a visitor needs on the landing page is proof that a person did this
 * work, not their whole history. One claim, checkable, with a link for the
 * people who want more.
 *
 * PLACEMENT: import it in app/page.tsx and render it between the argument
 * section and the audience segments — after the reader has seen the idea and
 * before they're asked to identify with a segment. That's the moment "who is
 * telling me this?" occurs.
 */

import {
  PALETTE,
  MONO,
  DISPLAY,
  hexA,
  panelStyle,
  utilityLabel,
} from '@/lib/chaosTokens';

/** Flip once /public/assets/daniel.jpg exists. */
const HAS_PORTRAIT = true;

export default function FounderStrip() {
  return (
    <section className="mx-auto px-5 sm:px-8" style={{ maxWidth: 1120, padding: '56px 20px' }}>
      <div
        className="flex flex-col sm:flex-row sm:items-center p-5 sm:p-7"
        style={{ ...panelStyle, borderRadius: 14, gap: 26 }}
      >
        {HAS_PORTRAIT && (
          <div
            className="shrink-0 overflow-hidden"
            style={{
              width: 132,
              borderRadius: 12,
              border: `1px solid ${hexA('#ffffff', 0.12)}`,
              alignSelf: 'flex-start',
            }}
          >
            <img
              src="/assets/daniel.jpg"
              alt="Daniel Ebuehi"
              width={264}
              height={330}
              loading="lazy"
              style={{ width: '100%', height: 'auto', display: 'block' }}
            />
          </div>
        )}

        <div style={{ flex: '1 1 auto', minWidth: 0 }}>
          <span style={utilityLabel}>Who runs this</span>

          <p
            style={{
              fontSize: 'clamp(1rem, 2.1vw, 1.18rem)',
              lineHeight: 1.6,
              color: PALETTE.bright,
              margin: '12px 0 0',
              fontWeight: 500,
            }}
          >
            I took over a 58-unit SRO in Skid Row where three of about seventeen vacant units were
            rentable. I brought that to fifteen.
          </p>

          <p
            style={{
              fontSize: 15,
              lineHeight: 1.65,
              color: hexA('#ffffff', 0.62),
              margin: '12px 0 0',
              maxWidth: '58ch',
            }}
          >
            The rest were boarded up &mdash; not mid-turn, sealed. Twelve units of contract rent
            behind plywood, while the vacancy report called it a leasing problem. I now manage a
            114-unit permanent supportive housing property downtown, and I built this out of the
            problems that kept recurring in both.
          </p>

          <a
            href="/about"
            className="chaos-focus inline-flex items-center"
            style={{
              fontFamily: MONO,
              fontSize: 11.5,
              letterSpacing: '0.11em',
              textTransform: 'uppercase',
              color: PALETTE.cyan,
              textDecoration: 'none',
              marginTop: 16,
              gap: 8,
            }}
          >
            Daniel Ebuehi &middot; DRE #02224369
            <span aria-hidden="true" style={{ fontFamily: DISPLAY }}>
              &rarr;
            </span>
          </a>
        </div>
      </div>
    </section>
  );
}
