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
 *
 * NOW: no screening logic lives here. validateLedgerText() in lib/auditEngine.ts
 * reads the file the way the paid audit does (columns -> types -> dates ->
 * row-level errors with row numbers), and this component only displays it.
 * The duplicate key and per-category concentration come from the same helpers
 * the engine's findings use, so a file cannot pass here and be flagged there
 * for a reason this screen never looked at.
 */

import { useCallback, useRef, useState } from 'react';
import {
  validateLedgerText,
  vendorTotalsByCategory,
  topVendorOf,
  type IssueCode,
  type RowIssue,
} from '@/lib/auditEngine';
import { sharePct } from '@/lib/calcMath';

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

const ISSUE_TEXT: Record<IssueCode, string> = {
  missing_date: 'no date',
  missing_vendor: 'no vendor',
  missing_category: 'no category',
  blank_amount: 'amount is blank',
  unreadable_amount: 'amount cannot be read',
  unreadable_date: 'date cannot be read (day-first dates are never guessed)',
};

type Tone = 'ok' | 'warn' | 'flag' | 'idle';
type Badge = { tone: Tone; label: string; n?: string };

type Concentration = { category: string; vendor: string; share: number; total: number };

type Result = {
  fileName: string;
  rows: number;
  keptRows: number;
  droppedRows: number;
  missingRequired: string[];
  optionalPresent: string[];
  optionalMissing: string[];
  badges: Badge[];
  concentration: Concentration | null;
  agingAvailable: boolean;
  issues: RowIssue[];
  issuesTotal: number;
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

function screen(fileName: string, text: string): Result {
  const v = validateLedgerText(text);
  const required = v.columns.missingRequired;
  const badges: Badge[] = [{ tone: 'ok', label: 'Valid CSV' }];

  /* 1. columns */
  badges.push({
    tone: required.length === 0 ? 'ok' : 'flag',
    label: required.length === 0 ? 'Required columns' : 'Missing required columns',
    n: `${4 - required.length}/4`,
  });

  /* 2. types: amounts */
  if (v.columns.found.amount) {
    const bad = v.amounts.blank + v.amounts.unreadable;
    badges.push({
      tone: bad === 0 ? 'ok' : 'warn',
      label: bad === 0 ? 'Amount column parsed' : 'Blank or unreadable amounts',
      n: bad ? String(bad) : '100%',
    });
  } else {
    badges.push({ tone: 'idle', label: 'No amount column found' });
  }
  if (v.amounts.credits > 0) {
    badges.push({
      tone: 'warn',
      label: 'Credits / reversals',
      n: `${v.amounts.credits} · $${Math.round(Math.abs(v.amounts.creditTotal)).toLocaleString()}`,
    });
  }

  /* 3. dates */
  if (v.dates.unreadable > 0) {
    badges.push({ tone: 'warn', label: 'Dates that cannot be read', n: String(v.dates.unreadable) });
  }
  if (v.dates.earliest !== null && v.dates.latest !== null) {
    const days = Math.round((v.dates.latest - v.dates.earliest) / 86400000);
    const months = Math.round(days / 30);
    badges.push({
      tone: months >= 3 ? 'ok' : 'warn',
      label: 'Date range',
      n: months >= 2 ? `${months} months` : `${days}d`,
    });
  }

  /* 4. row-level: what the paid audit would actually read */
  badges.push({
    tone: v.droppedRows === 0 ? 'ok' : 'warn',
    label: v.droppedRows === 0 ? 'Every row readable' : 'Rows the audit would skip',
    n: v.droppedRows ? `${v.droppedRows} of ${v.totalRows}` : undefined,
  });

  /* Worst per-category concentration, from the engine's own helpers. Same 60%
     threshold and the same "more than one vendor" guard as the engine. */
  let concentration: Concentration | null = null;
  for (const [category, vendors] of vendorTotalsByCategory(v.rows)) {
    const total = [...vendors.values()].reduce((a, b) => a + b, 0);
    if (total <= 0 || vendors.size < 2) continue;
    const [vendor, amount] = topVendorOf(vendors);
    const share = sharePct(amount, total) ?? 0;
    if (!concentration || share > concentration.share) concentration = { category, vendor, share, total };
  }
  if (concentration) {
    badges.push({
      tone: concentration.share >= 60 ? 'flag' : concentration.share >= 40 ? 'warn' : 'ok',
      label: `Top vendor share, ${concentration.category}`,
      n: `${concentration.share.toFixed(0)}%`,
    });
  } else if (v.columns.found.vendor && v.columns.found.category) {
    badges.push({ tone: 'idle', label: 'No category has two or more vendors' });
  }

  /* Exact duplicates by the engine's key: date + vendor + category + amount. */
  badges.push({
    tone: v.duplicates.groups === 0 ? 'ok' : 'warn',
    label: v.duplicates.groups === 0 ? 'No exact duplicates' : 'Exact duplicate candidates',
    n: v.duplicates.groups ? `${v.duplicates.groups} group(s)` : undefined,
  });

  const agingAvailable = Boolean(v.columns.found.status && v.columns.found.openedDate);
  badges.push({
    tone: agingAvailable ? 'ok' : 'idle',
    label: agingAvailable ? 'Aging analysis available' : 'Aging needs status + opened date',
  });
  badges.push({ tone: 'idle', label: 'Interpretation not run' });

  const label = (f: string) => FIELD_LABELS[f] ?? f;
  return {
    fileName,
    rows: v.totalRows,
    keptRows: v.rows.length,
    droppedRows: v.droppedRows,
    missingRequired: required.map(label),
    optionalPresent: v.columns.optionalPresent.map(label),
    optionalMissing: v.columns.optionalMissing.map(label),
    badges,
    concentration,
    agingAvailable,
    issues: v.issues,
    issuesTotal: Object.values(v.issueCounts).reduce((a, b) => a + b, 0),
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
    file
      .text()
      .then((text) => {
        const out = screen(file.name, text);
        if (out.rows === 0) {
          setError('No data rows were found. Check that the first line of the file is the header row.');
          return;
        }
        setResult(out);
      })
      .catch(() => {
        setError('The file could not be read. It may be open in another program, or not valid CSV.');
      })
      .finally(() => setBusy(false));
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

          {result.issues.length > 0 && (
            <div className="mt-5 border-t border-slate-800 pt-4">
              <p className="font-mono text-[11px] uppercase tracking-[0.14em] text-amber-500">
                Row-level problems ({result.issuesTotal.toLocaleString()})
              </p>
              <ul className="mt-2 space-y-1 font-mono text-[11px] leading-relaxed text-slate-400">
                {result.issues.slice(0, 10).map((i, k) => (
                  <li key={`${i.row}-${i.code}-${k}`}>
                    Row {i.row}: {ISSUE_TEXT[i.code]}
                    {i.value ? <span className="text-slate-500"> (&ldquo;{i.value}&rdquo;)</span> : null}
                    {i.dropped ? <span className="text-rose-400"> &middot; skipped by the audit</span> : null}
                  </li>
                ))}
              </ul>
              {result.issuesTotal > 10 && (
                <p className="mt-2 font-mono text-[11px] text-slate-600">
                  &hellip;and {(result.issuesTotal - 10).toLocaleString()} more. Row 1 is the header.
                </p>
              )}
            </div>
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
