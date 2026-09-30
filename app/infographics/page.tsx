/**
 * app/infographics/page.tsx
 * ----------------------------------------------------------------------------
 * Standalone gallery for the data-storytelling infographics -- kept off the
 * main landing page on purpose. The homepage has a deliberate pace (hero ->
 * diagnostics -> argument -> founder -> segments -> ladder -> close); five
 * dense, text-heavy infographics dropped into that flow would fight the
 * founder-strip/segment cards for attention rather than add to them. This
 * page is the answer to "how do we add them" -- a real destination for them,
 * linked FROM the homepage rather than embedded IN it.
 *
 * If you do want one on the homepage too, the honest version of that is a
 * single teaser card near the close section linking here -- not all five
 * inline. Say so and I'll add that one card.
 *
 * Images are plain <img>, matching the same reasoning already in
 * app/page.tsx: no next/image plugin configured on Netlify, and a broken
 * image on deploy is worse than an unoptimised one. All five are already
 * converted to WebP and resized (1.6-2.4MB PNGs -> 170-440KB WebP, verified
 * legible at that compression -- see the file list below).
 */
import type { Metadata } from 'next';
import { PALETTE, DISPLAY, MONO, hexA, utilityLabel, headingStyle, sharedCss } from '@/lib/chaosTokens';

export const metadata: Metadata = {
  title: 'Infographics — PropOps8',
  description: 'Data storytelling on the Ugly8 + PropOps8 operating model, portfolio performance, and NOI leakage.',
};

const INFOGRAPHICS = [
  {
    file: 'infographic-ugly8-propops8-flow.webp',
    width: 1400,
    height: 788,
    title: 'Ugly8 + PropOps8: signals, systems, outcomes',
    alt: 'Sankey diagram showing housing-ecosystem signals flowing through Ugly8 and PropOps8 into measurable outcomes',
  },
  {
    file: 'infographic-spatial-intelligence.webp',
    width: 1400,
    height: 788,
    title: 'From property chaos to spatial intelligence',
    alt: 'Sankey diagram showing five platform layers (Ugly8, PropOps8, HAS, AIM, SBI) converting sources into outcomes',
  },
  {
    file: 'infographic-building-performance.webp',
    width: 1400,
    height: 788,
    title: 'Building performance intelligence scorecard',
    alt: 'Six-panel scorecard covering occupancy, financials, compliance, turns, maintenance, and utilities',
  },
  {
    file: 'infographic-performance-index.webp',
    width: 1122,
    height: 1402,
    title: 'Ugly8 multifamily performance index',
    alt: 'Building-facade styled scorecard with a detect-triage-scope-prioritize-execute-verify workflow',
  },
  {
    file: 'infographic-noi-bleed.webp',
    width: 1122,
    height: 1402,
    title: 'Stop the NOI bleed — T.I.M.E. triage',
    alt: 'Turns, Inspections, Maintenance, Expense-leakage triage infographic with a detect-diagnose-prioritize-execute flow',
  },
];

export default function InfographicsPage() {
  return (
    <main style={{ background: PALETTE.void, color: PALETTE.body, fontFamily: DISPLAY }}>
      <style>{sharedCss}</style>

      <section className="mx-auto px-5 sm:px-8" style={{ maxWidth: 1120, padding: '64px 20px 24px' }}>
        <span style={utilityLabel}>Data storytelling</span>
        <h1 style={{ ...headingStyle, margin: '14px 0 10px' }}>
          The operating model, in one look each
        </h1>
        <p
          style={{
            fontSize: 16,
            lineHeight: 1.6,
            color: hexA('#ffffff', 0.6),
            margin: 0,
            maxWidth: '62ch',
          }}
        >
          Five ways of showing the same underlying claim — that field-level disorder is
          measurable, and that measuring it changes the outcome.
        </p>
      </section>

      <section className="mx-auto px-5 sm:px-8" style={{ maxWidth: 1120, padding: '20px 20px 96px' }}>
        <div className="flex flex-col" style={{ gap: 40 }}>
          {INFOGRAPHICS.map((g, i) => (
            <figure key={g.file} className="overflow-hidden" style={{ margin: 0, borderRadius: 16, background: '#fff' }}>
              <img
                src={`/infographics/${g.file}`}
                alt={g.alt}
                width={g.width}
                height={g.height}
                loading={i === 0 ? 'eager' : 'lazy'}
                style={{ width: '100%', height: 'auto', display: 'block' }}
              />
              <figcaption
                style={{
                  fontFamily: MONO,
                  fontSize: 11.5,
                  letterSpacing: '0.08em',
                  textTransform: 'uppercase',
                  color: '#1b243d',
                  background: '#fff',
                  padding: '14px 18px',
                  borderTop: '1px solid rgba(0,0,0,0.08)',
                }}
              >
                {g.title}
              </figcaption>
            </figure>
          ))}
        </div>
      </section>
    </main>
  );
}
