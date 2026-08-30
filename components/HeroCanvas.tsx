'use client';

/**
 * components/HeroCanvas.tsx
 *
 * One wrapper, two modes — because your three assets are not the
 * same kind of object and cannot take the same treatment.
 *
 *   mode="poster"  The asset already contains its own headline,
 *                  figures, and CTA button. It gets framed at its
 *                  native aspect ratio and is NEVER cropped, and
 *                  nothing is layered on top of it. UI sits beside
 *                  it. Use for: house-on-car, room-and-vortex.
 *
 *   mode="plate"   The asset is pure environment with no text.
 *                  Safe as a true background: object-cover, gradient
 *                  scaffolding, UI layered on z-20 as per the
 *                  original blueprint. Use for: lounge/demolition.
 *
 * Why this split matters: two of the three posters contain a painted
 * "GET VENDOR PERFORMANCE SCORECARD" button. Overlaying a real CTA
 * gives the visitor two buttons, one of which is an image and does
 * nothing — sighted users click the bigger painted one first, and
 * screen readers never see it at all.
 */

import { type ReactNode } from 'react';

type Common = {
  tag: string;
  children: ReactNode;
  footer?: string;
};

type PosterProps = Common & {
  mode: 'poster';
  src: string;
  alt: string;
  /** Native aspect ratio of the asset, e.g. '4/5' or '1/1'. Locking
   *  this is what keeps any pin coordinates on the same pixels at
   *  every viewport width. */
  ratio: string;
  caption?: string;
  pins?: Array<{ x: string; y: string; tone: 'red' | 'amber' | 'cyan'; label: string }>;
};

type PlateProps = Common & {
  mode: 'plate';
  src: string;
  alt: string;
};

type Props = PosterProps | PlateProps;

const TONES = {
  red: { ring: 'border-rose-500/50', dot: 'bg-rose-500' },
  amber: { ring: 'border-amber-500/50', dot: 'bg-amber-500' },
  cyan: { ring: 'border-cyan-400/50', dot: 'bg-cyan-400' },
} as const;

function Chrome({ tag, footer }: { tag: string; footer?: string }) {
  return { tag, footer };
}

export default function HeroCanvas(props: Props) {
  const { tag, children, footer = 'PropOps8 · Demonstration · Method shown on page' } = props;

  /* ─────────────────────────── PLATE ───────────────────────────
     The blueprint's three-layer stack, used only where it is safe:
     an asset with no baked-in text to compete with.
     ─────────────────────────────────────────────────────────── */
  if (props.mode === 'plate') {
    return (
      <section className="relative min-h-screen w-full overflow-hidden bg-slate-950 text-slate-100">
        {/* z-0 — graphic canvas */}
        <div className="absolute inset-0 z-0">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={props.src}
            alt={props.alt}
            className="h-full w-full object-cover object-center"
          />
        </div>

        {/* z-10 — contrast scaffolding.
            Heavier at the bottom where body copy sits, transparent
            through the middle so the artwork keeps its depth. */}
        <div
          aria-hidden
          className="absolute inset-0 z-10 bg-gradient-to-t from-slate-950 via-slate-950/75 to-slate-950/35"
        />

        {/* z-20 — real DOM UI */}
        <div className="relative z-20 mx-auto flex min-h-screen max-w-[1200px] flex-col justify-between px-5 py-6 md:px-8 md:py-10">
          <header className="flex items-center justify-between gap-4 border-b border-slate-800/80 pb-4">
            <span className="font-mono text-[11px] uppercase tracking-[0.22em] text-cyan-400">{tag}</span>
            <span className="font-mono text-[11px] uppercase tracking-[0.18em] text-slate-500">
              Prop<b className="font-semibold text-[#FF2D6F]">Ops8</b>
            </span>
          </header>

          <main className="my-auto w-full py-10">{children}</main>

          <footer className="border-t border-slate-800/80 pt-4 font-mono text-[10px] uppercase tracking-[0.19em] text-slate-600">
            {footer}
          </footer>
        </div>
      </section>
    );
  }

  /* ────────────────────────── POSTER ───────────────────────────
     Framed, uncropped, nothing overlaid on the art itself.
     UI sits alongside. On mobile: copy, then tool, then art —
     so the tool is reachable without scrolling past a full poster.
     ─────────────────────────────────────────────────────────── */
  const { src, alt, ratio, caption, pins = [] } = props;

  return (
    <section className="relative min-h-screen w-full overflow-hidden bg-slate-950 text-slate-100">
      <div
        aria-hidden
        className="pointer-events-none fixed inset-0 z-0
                   bg-[linear-gradient(rgba(34,224,232,.026)_1px,transparent_1px),linear-gradient(90deg,rgba(34,224,232,.026)_1px,transparent_1px)]
                   bg-[size:64px_64px]"
      />
      <div
        aria-hidden
        className="pointer-events-none fixed inset-0 z-10
                   bg-[radial-gradient(900px_520px_at_78%_22%,rgba(255,45,111,.10),transparent_68%)]"
      />

      <div className="relative z-20 mx-auto flex min-h-screen max-w-[1200px] flex-col px-5 py-6 md:px-8 md:py-10">
        <header className="flex items-center justify-between gap-4 border-b border-slate-800/80 pb-4">
          <span className="font-mono text-[11px] uppercase tracking-[0.22em] text-cyan-400">{tag}</span>
          <span className="font-mono text-[11px] uppercase tracking-[0.18em] text-slate-500">
            Prop<b className="font-semibold text-[#FF2D6F]">Ops8</b>
          </span>
        </header>

        <div className="my-auto grid w-full gap-9 py-10 lg:grid-cols-[1fr_minmax(0,520px)] lg:items-center lg:gap-12">
          {/* UI beside the art — never on it */}
          <div className="order-1">{children}</div>

          <figure className="order-2 m-0">
            <div
              style={{ aspectRatio: ratio }}
              className="relative w-full overflow-hidden rounded-[5px] border border-slate-800 bg-slate-900"
            >
              {/* object-contain: the painted headline and figures stay whole */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={src}
                alt={alt}
                className="absolute inset-0 h-full w-full object-contain"
              />

              {pins.map((p) => {
                const t = TONES[p.tone];
                return (
                  <span
                    key={p.label}
                    style={{ left: p.x, top: p.y }}
                    className={`absolute z-10 inline-flex -translate-x-1/2 -translate-y-1/2 items-center gap-2
                                whitespace-nowrap rounded-full border ${t.ring} bg-slate-950/90 px-3 py-1.5
                                font-mono text-[9px] uppercase tracking-[0.09em] text-slate-100
                                backdrop-blur-sm sm:text-[10.5px]`}
                  >
                    <span className={`relative h-1.5 w-1.5 shrink-0 rounded-full ${t.dot}`}>
                      <span className={`absolute -inset-1 rounded-full ${t.dot} opacity-40 motion-safe:animate-ping`} />
                    </span>
                    {p.label}
                  </span>
                );
              })}
            </div>

            {caption && (
              <figcaption className="mt-3 flex flex-wrap justify-between gap-3 font-mono text-[10px] uppercase tracking-[0.15em] text-slate-600">
                <span>{caption}</span>
                <span className="text-amber-500">Demonstration</span>
              </figcaption>
            )}
          </figure>
        </div>

        <footer className="border-t border-slate-800/80 pt-4 font-mono text-[10px] uppercase tracking-[0.19em] text-slate-600">
          {footer}
        </footer>
      </div>
    </section>
  );
}

/* ─────────────────────────────────────────────────────────────
   USAGE

   app/audit/page.tsx — poster, has a painted CTA, so the page's
   own CTA is the only clickable one and it sits in the children.

     <HeroCanvas
       mode="poster"
       tag="Operations Chaos Index"
       src="/assets/money-pit-stack.webp"
       alt="Vendor spend concentration: 71% with one vendor, $130,782 versus $53,418 across all others, $184,200 annual spend."
       ratio="4/5"
       caption="Vendor concentration · synthetic portfolio"
       pins={[{ x: '22%', y: '27%', tone: 'red', label: '71% concentration' }]}
     >
       <ChaosIndexCopy />
     </HeroCanvas>

   app/calculator/page.tsx — plate, no baked text, safe to layer on.

     <HeroCanvas
       mode="plate"
       tag="Vacancy Timeline Diagnostic"
       src="/assets/lounge-demolition.webp"
       alt="Neon-lit lounge set into a broken concrete wall."
     >
       <VacancyCalculator />
     </HeroCanvas>
   ───────────────────────────────────────────────────────────── */
