'use client';

/**
 * components/LedgerCheck.tsx
 * Deterministic ledger screening — runs entirely in the browser.
 *
 * The file never leaves the browser. Papa Parse runs locally, the screening
 * runs locally, and "nothing uploads" is a fact about the code rather than a
 * promise. Paid review is where files legitimately change hands, under a
 * named retention window.
 *
 * ------------------------------------------------------------------------
 * REWRITTEN — the free screener and the paid engine disagreed about the same
 * file, in the worst possible direction. On the synthetic test ledger:
 *
 *   this tool said   "Top vendor share 25%"    (green, healthy)
 *   the engine said  "Apex 66.6% of Turnover"  (a review trigger)
 *
 * Both were arithmetically right and the label was the problem. 25.1% was
 * Apex measured against the ENTIRE $917,217 ledger — twelve unrelated trades
 * in one denominator. Concentration across all categories is not a
 * meaningful quantity: a vendor holding a quarter of a ledger spanning
 * plumbing, landscaping and turnover tells you nothing, and dividing by
 * everything drags any real concentration down into the green band. A
 * prospect screened their file, saw healthy, and the paid engine then found
 * seven triggers in it. Concentration is now computed PER CATEGORY, matching
 * lib/auditEngine.ts, and the worst category is reported.
 *
 * The two also disagreed about what the file contained. This tool reported
 * "Not found: workOrderId, unit, opened, closed" on a file whose status and
 * opened_date columns the engine read happily — because its alias list
 * matched `opendate` and `dateopened` but not `openeddate`, had no entry for
 * `status`, and none for `date` either. It was screening for work-order
 * columns against a ledger. It now imports HEADER_ALIASES from the engine, so
 * the two cannot drift again.
 *
 * Copy changed for the same reason: the product asks for a ledger, the engine
 * reads a ledger, so this no longer says "work-order export" or implies it can
 * tell whether a repair held. Per the release gate — no work-order language
 * unless the source file is actually a work-order export.
 */

import Papa from 'papaparse';
import { useCallback, useRef, useState } from 'react';
import { HEADER_ALIASES, normHeader, toAmount, parseLedgerDate } from '@/lib/auditEngine';

const norm = normHeader;

/** The engine's alias table, normalised so "Opened Date", "opened_date" and
 *  "openeddate" all resolve to the same field. */
const ALIAS_LOOKUP: Record<string, string> = Object.fromEntries(
  Object.entries(HEADER_ALIASES).map(([header, field]) => [norm(header), field as string])
);

const REQUIRED = ['date', 'vendor', 'category', 'amount'] as const;

const FIELD_LABELS: Record<string, string> = {
  date: 'date',
  vendor: 'vendor',
  category: 'category',
  amount: 'amount',
  status: 'status',
  openedDate: 'opened date',
  closedDate: 'closed date',
  unit: 'unit',
  description: 'description',
  workOrderId: 'work order id',
};

/** Same reader as the engine, so the screener and the paid review cannot disagree about a cell. */
const toNumber = toAmount;

type Tone = 'ok' | 'warn' | 'flag' | 'idle';
type Badge = { tone: Tone; label: string; n?: string };

type Concentration = { category: string; vendor: string; share: number; total: number };

type Result = {
  fileName: string;
  rows: number;
  missingRequired: string[];
  optionalPresent: string[];
  optionalMissing: string[];
  badges: Badge[];
  concentration: Concentration | null;
  agingAvailable: boolean;
};

const TONE_CLASS: Record<Tone, string> = {
  ok:   'text-emerald-400 border-emerald-400/35 bg-emerald-400/[0.07]',
  warn: 'text-amber-500 border-amber-500/35 bg-amber-500/[0.07]',
  flag: 'text-rose-500 border-rose-500/35 bg-rose-500/[0.07]',
  idle: 'text-slate-500 border-slate-700 bg-transparent',
};

const DOT_CLASS: Record<Tone, string> = {
  ok: 'bg-emerald-400', warn: 'bg-amber-500', flag: 'bg-rose-500', idle: 'bg-slate-600',
};

function screen(fileName: string, rows: Record<string, unknown>[], headers: string[]): Result {
  // header -> canonical field
  const map: Record<string, string> = {};
  for (const h of headers) {
    const field = ALIAS_LOOKUP[norm(h)];
    if (field && !map[field]) map[field] = h;
  }

  const missingRequired = REQUIRED.filter((f) => !map[f]);
  const optionalFields = Object.values(HEADER_ALIASES)
    .map((f) => f as string)
    .filter((f, i, a) => a.indexOf(f) === i && !REQUIRED.includes(f as typeof REQUIRED[number]) && f !== 'sourceRow');
  const optionalPresent = optionalFields.filter((f) => map[f]);
  const optionalMissing = optionalFields.filter((f) => !map[f]);

  const badges: Badge[] = [{ tone: 'ok', label: 'Valid CSV' }];

  badges.push({
    tone: missingRequired.length === 0 ? 'ok' : 'flag',
    label: missingRequired.length === 0 ? 'Required columns' : 'Missing required columns',
    n: `${REQUIRED.length - missingRequired.length}/${REQUIRED.length}`,
  });

  /* ---- amounts, credits, per-category concentration ---------------- */
  let blankCost = 0;
  let credits = 0;
  let creditTotal = 0;
  const byCategory = new Map<string, Map<string, number>>();

  if (map.amount) {
    for (const r of rows) {
      const n = toNumber(r[map.amount]);
      if (!Number.isFinite(n)) { blankCost++; continue; }
      if (n < 0) { credits++; creditTotal += n; }

      if (map.vendor && map.category) {
        const cat = String(r[map.category] ?? '').trim() || '(uncategorised)';
        const ven = String(r[map.vendor] ?? '').trim() || '(unnamed)';
        if (!byCategory.has(cat)) byCategory.set(cat, new Map());
        byCategory.get(cat)!.set(ven, (byCategory.get(cat)!.get(ven) ?? 0) + n);
      }
    }
    badges.push({
      tone: blankCost === 0 ? 'ok' : 'warn',
      label: blankCost === 0 ? 'Amount column parsed' : 'Blank or unparsed amounts',
      n: blankCost ? String(blankCost) : '100%',
    });
  } else {
    badges.push({ tone: 'idle', label: 'No amount column found' });
  }

  if (credits > 0) {
    badges.push({
      tone: 'warn',
      label: 'Credits / reversals',
      n: `${credits} · $${Math.round(Math.abs(creditTotal)).toLocaleString()}`,
    });
  }

  /* Worst per-category concentration. Same 60% threshold and the same
     "more than one vendor" guard the engine uses, so the free screening
     and the paid review never contradict each other on the same file. */
  let concentration: Concentration | null = null;
  for (const [category, vendors] of byCategory) {
    const total = [...vendors.values()].reduce((a, b) => a + b, 0);
    if (total <= 0 || vendors.size < 2) continue;
    const [vendor, amount] = [...vendors.entries()].sort((a, b) => b[1] - a[1])[0];
    const share = (amount / total) * 100;
    if (!concentration || share > concentration.share) {
      concentration = { category, vendor, share, total };
    }
  }

  if (concentration) {
    badges.push({
      tone: concentration.share >= 60 ? 'flag' : concentration.share >= 40 ? 'warn' : 'ok',
      label: `Top vendor share, ${concentration.category}`,
      n: `${concentration.share.toFixed(0)}%`,
    });
  } else if (map.vendor && map.category) {
    badges.push({ tone: 'idle', label: 'No category has two or more vendors' });
  }

  /* ---- exact duplicate rows --------------------------------------- */
  const seen = new Set<string>();
  let dupes = 0;
  for (const r of rows) {
    const key = JSON.stringify(r);
    if (seen.has(key)) dupes++;
    else seen.add(key);
  }
  badges.push({
    tone: dupes === 0 ? 'ok' : 'warn',
    label: dupes === 0 ? 'No duplicate rows' : 'Duplicate row candidates',
    n: dupes ? String(dupes) : undefined,
  });

  /* ---- date range ------------------------------------------------- */
  if (map.date) {
    const ds = rows
      .map((r) => parseLedgerDate(String(r[map.date])))
      .filter((d): d is number => d !== null)
      .sort((a, b) => a - b);
    if (ds.length) {
      const days = Math.round((ds[ds.length - 1] - ds[0]) / 86400000);
      const months = Math.round(days / 30);
      badges.push({
        tone: months >= 3 ? 'ok' : 'warn',
        label: 'Date range',
        n: months >= 2 ? `${months} months` : `${days}d`,
      });
    }
  }

  /* ---- aging availability ----------------------------------------- */
  const agingAvailable = Boolean(map.status && map.openedDate);
  badges.push({
    tone: agingAvailable ? 'ok' : 'idle',
    label: agingAvailable ? 'Aging analysis available' : 'Aging needs status + opened date',
  });

  badges.push({ tone: 'idle', label: 'Interpretation not run' });

  return {
    fileName,
    rows: rows.length,
    missingRequired: missingRequired.map((f) => FIELD_LABELS[f] ?? f),
    optionalPresent: optionalPresent.map((f) => FIELD_LABELS[f] ?? f),
    optionalMissing: optionalMissing.map((f) => FIELD_LABELS[f] ?? f),
    badges,
    concentration,
    agingAvailable,
  };
}

export default function LedgerCheck({ ctaHref }: { ctaHref: string }) {
  const [drag, setDrag] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<Result | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const handle = useCallback((file?: File) => {
    if (!file) return;
    if (!/\.(csv|tsv|txt)$/i.test(file.name)) {
      setError('That file type cannot be read here. Export your maintenance or vendor ledger as CSV and try again.');
      return;
    }
    setError(null);
    setBusy(true);
    Papa.parse<Record<string, unknown>>(file, {
      header: true,
      skipEmptyLines: true,
      complete: (out) => {
        setBusy(false);
        const rows = out.data ?? [];
        if (!rows.length) {
          setError('No data rows were found. Check that the first line of the file is the header row.');
          return;
        }
        setResult(screen(file.name, rows, out.meta.fields ?? []));
      },
      error: () => {
        setBusy(false);
        setError('The file could not be read. It may be open in another program, or not valid CSV.');
      },
    });
  }, []);

  return (
    <div className="rounded-[5px] border border-slate-800 bg-slate-950/85 p-6 backdrop-blur-md md:p-8">
      <p className="font-mono text-[11px] uppercase tracking-[0.22em] text-cyan-400">
        Ledger screening
      </p>
      <h1 className="mb-3 mt-2 text-[clamp(22px,4.4vw,32px)] font-extrabold uppercase leading-none tracking-[-0.03em]">
        A ledger says what happened.
        <span className="block font-light text-slate-400">It never says why.</span>
      </h1>
      <p className="mb-6 max-w-[54ch] text-slate-400">
        Drop a maintenance or vendor ledger export. Deterministic screening tells you what the
        file actually contains, and which checks it can support — before anything interprets it.
      </p>

      <div
        role="button"
        tabIndex={0}
        aria-label="Choose or drop a CSV file to screen"
        onClick={() => fileRef.current?.click()}
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); fileRef.current?.click(); } }}
        onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
        onDragLeave={() => setDrag(false)}
        onDrop={(e) => { e.preventDefault(); setDrag(false); handle(e.dataTransfer.files?.[0]); }}
        className={`cursor-pointer rounded-[4px] border-2 border-dashed px-6 py-10 text-center transition
                    focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400
                    ${drag ? 'border-cyan-400 bg-cyan-950/30' : 'border-slate-700 bg-slate-900/60 hover:border-cyan-500'}`}
      >
        <input
          ref={fileRef}
          type="file"
          accept=".csv,.tsv,.txt,text/csv"
          className="sr-only"
          onChange={(e) => handle(e.target.files?.[0])}
        />
        <p className="font-mono text-sm font-semibold uppercase tracking-[0.12em] text-cyan-400">
          {busy ? 'Screening…' : 'Drop a CSV, or choose a file'}
        </p>
        <p className="mt-2 font-mono text-[11px] text-slate-500">
          date · vendor · category · amount &nbsp;·&nbsp; status and opened date optional
        </p>
      </div>

      {error && (
        <div className="mt-4 rounded-r-[3px] border-l-[3px] border-rose-500 bg-rose-500/[0.07] px-4 py-3">
          <p className="text-[13px] text-slate-300">{error}</p>
        </div>
      )}

      {result && (
        <div className="mt-6">
          <div className="mb-4 flex flex-wrap items-baseline justify-between gap-3 border-b border-slate-800 pb-3">
            <span className="break-all font-mono text-xs text-slate-200">{result.fileName}</span>
            <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-slate-500">
              {result.rows.toLocaleString()} rows screened
            </span>
          </div>

          <div className="flex flex-wrap gap-2.5">
            {result.badges.map((b) => (
              <span
                key={b.label}
                className={`inline-flex items-center gap-2 whitespace-nowrap rounded-full border px-3 py-2
                            font-mono text-[10.5px] uppercase tracking-[0.09em] ${TONE_CLASS[b.tone]}`}
              >
                <i className={`h-1.5 w-1.5 shrink-0 rounded-full ${DOT_CLASS[b.tone]}`} />
                {b.label}
                {b.n && <span className="tabular-nums opacity-70">{b.n}</span>}
              </span>
            ))}
          </div>

          {result.missingRequired.length > 0 && (
            <p className="mt-5 border-t border-slate-800 pt-4 font-mono text-[11px] leading-relaxed text-rose-400">
              Missing required columns: {result.missingRequired.join(', ')}. Without these the
              ledger cannot be screened at all — check whether your export names them differently.
            </p>
          )}

          {result.concentration && (
            <p className="mt-5 border-t border-slate-800 pt-4 font-mono text-[11px] leading-relaxed text-slate-500">
              Highest concentration: <span className="text-slate-300">{result.concentration.vendor}</span> at{' '}
              {result.concentration.share.toFixed(1)}% of{' '}
              <span className="text-slate-300">{result.concentration.category}</span> spend
              (${Math.round(result.concentration.total).toLocaleString()} in that category).
              Measured within the category, not across the whole ledger — a share of everything
              you spend is not a meaningful number. Concentration is not proof of overbilling.
              One vendor being expensive and one vendor being the only one who answers look
              identical here. It is a reason to check pricing, SLAs and dependency, nothing more.
            </p>
          )}

          {result.optionalMissing.length > 0 && (
            <p className="mt-3 font-mono text-[11px] leading-relaxed text-slate-600">
              Optional columns not found: {result.optionalMissing.join(', ')}.
              {!result.agingAvailable && ' Aging needs both status and opened date.'}
              {' '}Those checks are skipped rather than estimated.
            </p>
          )}

          <div className="mt-6 text-center">
            <a
              href={ctaHref}
              className="inline-block rounded-[3px] bg-[#22d3ee] px-6 py-4 font-mono text-xs font-semibold uppercase tracking-[0.13em] text-[#06202a]
                         transition hover:-translate-y-px hover:shadow-[0_8px_26px_rgba(34,211,238,.34)]
                         focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#22d3ee]"
            >
              See the full ledger review →
            </a>
          </div>
        </div>
      )}

      <div className="mt-6 flex items-start gap-3 rounded-r-[3px] border-l-[3px] border-cyan-400 bg-cyan-400/5 px-4 py-3.5">
        <span className="whitespace-nowrap pt-0.5 font-mono text-[10px] tracking-[0.15em] text-cyan-400">LOCAL</span>
        <p className="text-[13px] leading-relaxed text-slate-400">
          Your file is read in this browser tab and never transmitted. Nothing is uploaded, stored
          or logged. Close the tab and it is gone. Every badge above was set by a rule against your
          rows — none of it is a finding, and none of it assigns fault.
        </p>
      </div>
    </div>
  );
}
