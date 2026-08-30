'use client';

/**
 * components/CostCalculator.tsx
 * C.O.S.T. — The Cost Of Silent Time
 *
 * REPLACES the earlier draft, which computed:
 *
 *     units × turnDays × 45        // 100 × 31 × 45 = $139,500
 *
 * That formula had two defects. It multiplied EVERY unit by the turn
 * length, which asserts the whole portfolio was vacant simultaneously
 * — there was no turnover rate in it at all. And $45/day was a magic
 * constant that silently assumed $1,369/month rent, so every operator
 * whose rents differ got a wrong answer with no way to see why.
 *
 * Corrected method, all of it visible on screen:
 *
 *     daily   = (monthly rent × 12) ÷ 365
 *     perTurn = daily × vacancy days
 *     turns   = units × annual turnover rate
 *     annual  = perTurn × turns
 *
 * Same 100-unit portfolio at $2,100 and 42% turnover returns $89,891,
 * not $139,500. The alternate 30-day-month method is shown too, so a
 * prospect who computes it differently sees the spread named rather
 * than catching you out on it.
 *
 * Runs entirely client-side. No network, no storage, no analytics.
 */

import { useMemo, useState } from 'react';

const money = (n: number) => `$${Math.round(n).toLocaleString('en-US')}`;

function Slider({
  id, label, hint, min, max, step = 1, value, display, accent = 'cyan', onChange,
}: {
  id: string; label: string; hint?: string;
  min: number; max: number; step?: number;
  value: number; display: string;
  accent?: 'cyan' | 'red';
  onChange: (v: number) => void;
}) {
  const thumb =
    accent === 'red'
      ? '[&::-webkit-slider-thumb]:border-rose-500 [&::-moz-range-thumb]:border-rose-500'
      : '[&::-webkit-slider-thumb]:border-cyan-400 [&::-moz-range-thumb]:border-cyan-400';

  return (
    <div className="mb-5 last:mb-0">
      <div className="mb-2 flex items-baseline justify-between gap-3">
        <label htmlFor={id} className="font-mono text-[11px] uppercase tracking-[0.09em] text-slate-400">
          {label}
        </label>
        <span className="font-mono text-base font-semibold tabular-nums text-slate-100">{display}</span>
      </div>
      <input
        id={id}
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className={[
          'block h-[22px] w-full cursor-pointer appearance-none bg-transparent focus-visible:outline-none',
          '[&::-webkit-slider-runnable-track]:h-[2px] [&::-webkit-slider-runnable-track]:rounded [&::-webkit-slider-runnable-track]:bg-slate-700',
          '[&::-moz-range-track]:h-[2px] [&::-moz-range-track]:rounded [&::-moz-range-track]:bg-slate-700',
          '[&::-webkit-slider-thumb]:-mt-[5.5px] [&::-webkit-slider-thumb]:h-[13px] [&::-webkit-slider-thumb]:w-[13px]',
          '[&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full',
          '[&::-webkit-slider-thumb]:border-2 [&::-webkit-slider-thumb]:bg-slate-950',
          '[&::-moz-range-thumb]:h-[13px] [&::-moz-range-thumb]:w-[13px] [&::-moz-range-thumb]:rounded-full',
          '[&::-moz-range-thumb]:border-2 [&::-moz-range-thumb]:bg-slate-950',
          thumb,
        ].join(' ')}
      />
      {hint && <p className="mt-1.5 font-mono text-[10px] tracking-wide text-slate-600">{hint}</p>}
    </div>
  );
}

export default function CostCalculator({ ctaHref }: { ctaHref: string }) {
  const [units, setUnits] = useState(120);
  const [rent, setRent] = useState(2100);
  const [total, setTotal] = useState(31);
  const [mrRaw, setMrRaw] = useState(27);
  const [turnover, setTurnover] = useState(42);

  const mr = Math.min(mrRaw, total);
  const leaseDays = total - mr;

  const c = useMemo(() => {
    const daily = (rent * 12) / 365;
    const perTurn = daily * total;
    const turns = units * (turnover / 100);
    return {
      daily,
      perTurn,
      turns,
      annual: perTurn * turns,
      ops: daily * mr * turns,
      lease: daily * leaseDays * turns,
      alt: (rent / 30) * total * turns,
    };
  }, [units, rent, total, mr, leaseDays, turnover]);

  const opsPct = total ? Math.round((mr / total) * 100) : 0;

  return (
    <div className="rounded-[5px] border border-cyan-500/25 bg-slate-950/85 p-6 backdrop-blur-md md:p-8">
      <div className="mb-6 flex flex-wrap items-baseline justify-between gap-4 border-b border-slate-800 pb-5">
        <div>
          <p className="font-mono text-[11px] uppercase tracking-[0.22em] text-cyan-400">
            C.O.S.T. — The Cost Of Silent Time
          </p>
          <h1 className="mt-2 text-[clamp(22px,4.4vw,32px)] font-extrabold uppercase leading-none tracking-[-0.03em]">
            Vacant is a duration.
            <span className="block font-light text-slate-400">Rent-ready is a date.</span>
          </h1>
        </div>
        <span className="rounded-[2px] border border-amber-500/40 bg-amber-500/[0.07] px-2.5 py-1.5 font-mono text-[10px] uppercase tracking-[0.16em] text-amber-500">
          Your inputs · not a verified result
        </span>
      </div>

      <div className="grid gap-8 lg:grid-cols-[300px_1fr] lg:gap-10">
        <div>
          <Slider id="units" label="Units in portfolio" min={10} max={500} step={5}
                  value={units} display={String(units)} onChange={setUnits} />
          <Slider id="rent" label="Average monthly rent" min={700} max={4500} step={25}
                  value={rent} display={money(rent)} onChange={setRent} />
          <Slider id="total" label="Average vacancy days" hint="Move-out to lease signed."
                  min={5} max={90} value={total} display={String(total)} onChange={setTotal} />
          <Slider id="mr" label="Of that, make-ready days" hint="The part leasing never owned."
                  min={0} max={total} value={mr} display={String(mr)} accent="red" onChange={setMrRaw} />
          <Slider id="turn" label="Annual turnover rate" hint="Sets how many turns the estimate covers."
                  min={5} max={80} value={turnover} display={`${turnover}%`} onChange={setTurnover} />
        </div>

        <div>
          <div className="mb-4 flex flex-wrap items-end justify-between gap-4">
            <div>
              <span className="block text-[clamp(38px,9vw,62px)] font-extrabold leading-none tracking-[-0.038em] tabular-nums text-[#FF2D6F]">
                {money(c.annual)}
              </span>
              <span className="mt-2 block font-mono text-[10px] uppercase tracking-[0.18em] text-slate-500">
                Annual gross rent forgone
              </span>
            </div>
            <div className="text-right">
              <span className="block text-[clamp(19px,4vw,25px)] font-bold tabular-nums tracking-[-0.02em]">
                {money(c.perTurn)}
              </span>
              <span className="mt-1.5 block font-mono text-[10px] uppercase tracking-[0.14em] text-slate-500">
                Per turn
              </span>
            </div>
          </div>

          {/* Day strip — one tick per vacancy day */}
          <div
            role="img"
            aria-label={`${total} vacancy days: ${mr} make-ready, ${leaseDays} leasing`}
            className="flex h-[68px] items-end gap-[2px] overflow-hidden rounded-[3px] border border-slate-800 bg-slate-900/80 px-3 pb-2.5 pt-3"
          >
            {Array.from({ length: total }).map((_, i) => (
              <span
                key={i}
                className={
                  i < mr
                    ? 'h-full min-w-[2px] flex-1 rounded-t-[1px] bg-rose-500'
                    : 'h-[56%] min-w-[2px] flex-1 rounded-t-[1px] bg-amber-500'
                }
              />
            ))}
          </div>
          <div className="mt-2 flex justify-between font-mono text-[10px] uppercase tracking-[0.1em] text-slate-600">
            <span>Move-out</span><span>Lease signed</span>
          </div>

          <div className="mt-5 grid gap-3 sm:grid-cols-2">
            <div className="rounded-[3px] border border-l-[3px] border-slate-800 border-l-rose-500 bg-slate-900/70 px-3.5 py-3">
              <span className="mb-2 block font-mono text-[10px] uppercase tracking-[0.14em] text-slate-400">Operations owned</span>
              <span className="block text-xl font-bold tabular-nums tracking-[-0.02em] text-rose-500">{money(c.ops)}</span>
              <span className="mt-1 block font-mono text-[11px] text-slate-500">{mr} days · {opsPct}%</span>
            </div>
            <div className="rounded-[3px] border border-l-[3px] border-slate-800 border-l-amber-500 bg-slate-900/70 px-3.5 py-3">
              <span className="mb-2 block font-mono text-[10px] uppercase tracking-[0.14em] text-slate-400">Leasing owned</span>
              <span className="block text-xl font-bold tabular-nums tracking-[-0.02em] text-amber-500">{money(c.lease)}</span>
              <span className="mt-1 block font-mono text-[11px] text-slate-500">{leaseDays} days · {100 - opsPct}%</span>
            </div>
          </div>

          <p className="mt-5 border-t border-slate-800 pt-4 font-mono text-[11px] leading-relaxed text-slate-500">
            ({money(rent)} × 12 ÷ 365) = ${c.daily.toFixed(2)}/day · × {total} vacancy days = {money(c.perTurn)}/turn
            · × {c.turns.toFixed(1)} turns/yr ({units} units × {turnover}%) = {money(c.annual)}.
            Using rent ÷ 30 instead gives {money(c.alt)} — a method spread, not a finding.
          </p>
        </div>
      </div>

      <div className="mt-6 flex items-start gap-3 rounded-r-[3px] border-l-[3px] border-cyan-400 bg-cyan-400/5 px-4 py-3.5">
        <span className="whitespace-nowrap pt-0.5 font-mono text-[10px] tracking-[0.15em] text-cyan-400">LOCAL</span>
        <p className="text-[13px] leading-relaxed text-slate-400">
          Computed in your browser. Nothing is sent to a server or stored. Gross rent forgone is not
          lost profit — it excludes concessions, turn cost, and any period the unit could not have been
          leased regardless. It identifies a timeline worth opening, and assigns no fault.
        </p>
      </div>

      <div className="mt-6 text-center">
        <p className="mx-auto mb-5 max-w-[40ch] text-[clamp(16px,3vw,21px)] font-bold leading-tight tracking-[-0.018em]">
          When was the unit actually rent-ready — and what happened between move-out and that date?
        </p>
        <a
          href={ctaHref}
          className="inline-block rounded-[3px] bg-[#22d3ee] px-6 py-4 font-mono text-xs font-semibold uppercase tracking-[0.13em] text-[#06202a]
                     transition hover:-translate-y-px hover:shadow-[0_8px_26px_rgba(34,211,238,.34)]
                     focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#22d3ee]"
        >
          Get the make-ready timeline kit →
        </a>
      </div>
    </div>
  );
}
