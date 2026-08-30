'use client';

/**
 * components/LedgerCheck.tsx
 * Deterministic ledger screening — runs entirely in the browser.
 *
 * REPLACES the react-dropzone → n8n webhook / Supabase Storage draft.
 *
 * A work-order or vendor export from a live portfolio carries unit
 * numbers, resident names, vendor invoice detail, and sometimes
 * payment history. Accepting that on a public marketing page means
 * you are holding other people's personal data: you then owe a
 * privacy notice, a retention schedule, encryption at rest, access
 * control, and a breach-notification path. None of that is worth
 * carrying for a free top-of-funnel tool.
 *
 * So the file never leaves the browser. Papa Parse runs locally, the
 * screening runs locally, and "nothing uploads" becomes the strongest
 * line on the page rather than a compliance liability.
 *
 * Paid Snapshot is where files legitimately change hands — under a
 * signed scope, a named retention window, and deletion on delivery.
 *
 * Install: npm i papaparse && npm i -D @types/papaparse
 * (react-dropzone is not needed; native DnD is ~15 lines.)
 */

import Papa from 'papaparse';
import { useCallback, useRef, useState } from 'react';

/* ── header aliasing: PMS exports never agree on column names ── */
const ALIASES: Record<string, string[]> = {
  workOrderId: ['woid', 'wo', 'workorderid', 'workorder', 'workordernumber', 'wonumber', 'ticketid', 'ticket', 'id'],
  unit:        ['unit', 'unitid', 'unitnumber', 'unitno', 'apt', 'apartment', 'space'],
  vendor:      ['vendor', 'vendorname', 'contractor', 'supplier', 'payee', 'company'],
  cost:        ['cost', 'amount', 'total', 'totalcost', 'invoiceamount', 'invoicetotal', 'charge', 'spend'],
  opened:      ['opened', 'opendate', 'dateopened', 'created', 'createdat', 'datecreated', 'requestdate'],
  closed:      ['closed', 'closedate', 'dateclosed', 'completed', 'completedat', 'datecompleted'],
  issue:       ['issue', 'issuetype', 'description', 'category', 'problem', 'summary', 'requesttype', 'notes'],
};

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '');

const toNumber = (v: unknown) => {
  if (typeof v === 'number') return v;
  const n = parseFloat(String(v ?? '').replace(/[^0-9.\-]/g, ''));
  return Number.isFinite(n) ? n : NaN;
};

type Tone = 'ok' | 'warn' | 'flag' | 'idle';
type Badge = { tone: Tone; label: string; n?: string };

type Result = {
  fileName: string;
  rows: number;
  matched: string[];
  missing: string[];
  badges: Badge[];
  concentration: { vendor: string; share: number; total: number } | null;
  repeatUnits: number;
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
  const map: Record<string, string> = {};
  for (const [field, aliases] of Object.entries(ALIASES)) {
    const hit = headers.find((h) => aliases.includes(norm(h)));
    if (hit) map[field] = hit;
  }

  const matched = Object.keys(map);
  const missing = Object.keys(ALIASES).filter((f) => !map[f]);
  const badges: Badge[] = [
    { tone: 'ok', label: 'Valid CSV' },
    { tone: matched.length >= 4 ? 'ok' : 'warn', label: 'Headers matched', n: `${matched.length}/${Object.keys(ALIASES).length}` },
  ];

  /* blank costs */
  let blankCost = 0;
  let total = 0;
  const byVendor = new Map<string, number>();
  if (map.cost) {
    for (const r of rows) {
      const n = toNumber(r[map.cost]);
      if (!Number.isFinite(n)) { blankCost++; continue; }
      total += n;
      if (map.vendor) {
        const v = String(r[map.vendor] ?? '').trim() || '(unnamed)';
        byVendor.set(v, (byVendor.get(v) ?? 0) + n);
      }
    }
    badges.push({
      tone: blankCost === 0 ? 'ok' : 'warn',
      label: blankCost === 0 ? 'Cost column parsed' : 'Blank or unparsed cost',
      n: blankCost ? String(blankCost) : '100%',
    });
  } else {
    badges.push({ tone: 'idle', label: 'No cost column found' });
  }

  /* vendor concentration */
  let concentration: Result['concentration'] = null;
  if (byVendor.size > 0 && total > 0) {
    const [vendor, amount] = [...byVendor.entries()].sort((a, b) => b[1] - a[1])[0];
    const share = (amount / total) * 100;
    concentration = { vendor, share, total };
    badges.push({
      tone: share >= 60 ? 'flag' : share >= 40 ? 'warn' : 'ok',
      label: 'Top vendor share',
      n: `${share.toFixed(0)}%`,
    });
  }

  /* repeat work orders per unit — descriptive count, not a verdict */
  let repeatUnits = 0;
  if (map.unit) {
    const byUnit = new Map<string, number>();
    for (const r of rows) {
      const u = String(r[map.unit] ?? '').trim();
      if (u) byUnit.set(u, (byUnit.get(u) ?? 0) + 1);
    }
    repeatUnits = [...byUnit.values()].filter((c) => c >= 3).length;
    badges.push({
      tone: repeatUnits > 0 ? 'warn' : 'ok',
      label: 'Units with 3+ work orders',
      n: String(repeatUnits),
    });
  }

  /* exact duplicate rows */
  const seen = new Set<string>();
  let dupes = 0;
  for (const r of rows) {
    const key = JSON.stringify(r);
    if (seen.has(key)) dupes++;
    else seen.add(key);
  }
  badges.push({
    tone: dupes === 0 ? 'ok' : 'warn',
    label: dupes === 0 ? 'No duplicate rows' : 'Duplicate rows',
    n: dupes ? String(dupes) : undefined,
  });

  /* date range */
  if (map.opened) {
    const ds = rows
      .map((r) => new Date(String(r[map.opened])))
      .filter((d) => !isNaN(d.getTime()))
      .sort((a, b) => a.getTime() - b.getTime());
    if (ds.length) {
      const days = Math.round((ds[ds.length - 1].getTime() - ds[0].getTime()) / 86400000);
      badges.push({ tone: 'ok', label: 'Date range', n: `${days}d` });
    }
  }

  badges.push({ tone: 'idle', label: 'Interpretation not run' });

  return { fileName, rows: rows.length, matched, missing, badges, concentration, repeatUnits };
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
      setError('That file type cannot be read here. Export your work orders or vendor ledger as CSV and try again.');
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
        W.O.R.K. — Was Our Repair Kept?
      </p>
      <h1 className="mb-3 mt-2 text-[clamp(22px,4.4vw,32px)] font-extrabold uppercase leading-none tracking-[-0.03em]">
        A painted window
        <span className="block font-light text-slate-400">photographs like a window.</span>
      </h1>
      <p className="mb-6 max-w-[54ch] text-slate-400">
        Drop a work-order or vendor export. Deterministic screening runs first and tells you what the
        file actually contains — before anything interprets it.
      </p>

      {/* drop zone — native DnD, no dependency */}
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
          Work orders · vendor ledger · turn log
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

          {result.concentration && (
            <p className="mt-5 border-t border-slate-800 pt-4 font-mono text-[11px] leading-relaxed text-slate-500">
              Top vendor by parsed spend: <span className="text-slate-300">{result.concentration.vendor}</span> at{' '}
              {result.concentration.share.toFixed(1)}% of ${Math.round(result.concentration.total).toLocaleString()}.
              Concentration is not proof of overbilling. One vendor being expensive and one vendor being
              the only one who answers look identical here. It is a reason to check pricing, SLAs, and
              dependency — nothing more.
            </p>
          )}

          {result.missing.length > 0 && (
            <p className="mt-3 font-mono text-[11px] leading-relaxed text-slate-600">
              Not found in this export: {result.missing.join(', ')}. Those checks were skipped rather
              than estimated.
            </p>
          )}

          <div className="mt-6 text-center">
            <a
              href={ctaHref}
              className="inline-block rounded-[3px] bg-[#22d3ee] px-6 py-4 font-mono text-xs font-semibold uppercase tracking-[0.13em] text-[#06202a]
                         transition hover:-translate-y-px hover:shadow-[0_8px_26px_rgba(34,211,238,.34)]
                         focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#22d3ee]"
            >
              See the operations audit →
            </a>
          </div>
        </div>
      )}

      <div className="mt-6 flex items-start gap-3 rounded-r-[3px] border-l-[3px] border-cyan-400 bg-cyan-400/5 px-4 py-3.5">
        <span className="whitespace-nowrap pt-0.5 font-mono text-[10px] tracking-[0.15em] text-cyan-400">LOCAL</span>
        <p className="text-[13px] leading-relaxed text-slate-400">
          Your file is read in this browser tab and never transmitted. Nothing is uploaded, stored, or
          logged. Close the tab and it is gone. Every badge above was set by a rule against your rows —
          none of it is a finding, and none of it assigns fault.
        </p>
      </div>
    </div>
  );
}
