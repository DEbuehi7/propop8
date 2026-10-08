'use client';

/**
 * app/upload/[token]/UploadClient.tsx
 * ----------------------------------------------------------------------------
 * The customer-facing upload surface. Three things here are load-bearing:
 *
 * 1. Direct-to-storage with progress. Files PUT straight to the signed
 *    Supabase URL, bypassing the 4.5 MB serverless body limit. XHR rather than
 *    fetch, because fetch has no upload progress event and a 40 MB export on
 *    office wifi needs a progress bar or people assume it hung and refresh.
 *
 * 2. A client-side PII screen. The audit page promises de-identified data;
 *    this is where that promise is actually enforceable. CSV headers are read
 *    in the browser — the file has not left the machine at this point — and
 *    columns that clearly carry identifiers block the upload outright. Softer
 *    matches warn and let the customer decide.
 *
 *    It only reads the header row, and only for CSV/TSV. XLSX would need a
 *    parser dependency, so those are covered by instruction text instead. That
 *    limit is stated on the page rather than papered over.
 *
 * 3. Failure that says what to do. Every error path names the problem and
 *    leaves an email address, because the person seeing it has already paid.
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  PALETTE,
  MONO,
  DISPLAY,
  hexA,
  shellStyle,
  bodyStyle,
  panelStyle,
  cardStyle,
  utilityLabel,
  eyebrowTab,
  headingStyle,
  ctaStyle,
  sharedCss,
} from '@/lib/chaosTokens';

/* -------------------------------------------------------------------------- */
/*  PII screening                                                              */
/* -------------------------------------------------------------------------- */

/** Header names that should never appear in an operational export. Hard stop. */
const BLOCK_PATTERNS: [RegExp, string][] = [
  [/\bssn\b|social.?sec/i, 'Social Security number'],
  [/\btax.?id\b|\bein\b|\bitin\b/i, 'tax identifier'],
  [/credit.?card|card.?num|\bcvv\b|\bpan\b/i, 'card number'],
  [/account.?num|routing.?num|\biban\b|bank.?acct/i, 'bank account detail'],
  [/\bdob\b|date.?of.?birth|birth.?date/i, 'date of birth'],
  [/driver.?s?.?licen[sc]e|\bpassport\b/i, 'government ID'],
  [/diagnos|medical|\bhipaa\b|disabilit/i, 'medical information'],
];

/** Plausible in some exports, but worth a look before sending. */
const WARN_PATTERNS: [RegExp, string][] = [
  [/resident.?name|tenant.?name|occupant/i, 'resident name'],
  [/first.?name|last.?name|full.?name/i, 'personal name'],
  [/\bemail\b|e.?mail/i, 'email address'],
  [/\bphone\b|mobile|telephone|\bcell\b/i, 'phone number'],
  [/emergency.?contact|\bnext.?of.?kin\b/i, 'emergency contact'],
  [/\bincome\b|credit.?score|\bfico\b/i, 'financial detail'],
];

/** Minimal header splitter — handles quoted fields containing separators. */
function splitHeader(line: string, sep: string): string[] {
  const out: string[] = [];
  let cur = '';
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (quoted && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else quoted = !quoted;
    } else if (ch === sep && !quoted) {
      out.push(cur);
      cur = '';
    } else cur += ch;
  }
  out.push(cur);
  return out.map((s) => s.trim().replace(/^"|"$/g, ''));
}

interface Screen {
  blocked: { column: string; reason: string }[];
  warned: { column: string; reason: string }[];
  checked: boolean;
}

async function screenFile(file: File): Promise<Screen> {
  const ext = file.name.split('.').pop()?.toLowerCase();
  if (ext !== 'csv' && ext !== 'tsv') {
    return { blocked: [], warned: [], checked: false };
  }

  // Read only the first slice — enough for a header row, never the data.
  const head = await file.slice(0, 64 * 1024).text();
  const firstLine = head.split(/\r?\n/).find((l) => l.trim().length > 0) ?? '';
  if (!firstLine) return { blocked: [], warned: [], checked: true };

  const sep = ext === 'tsv' ? '\t' : ',';
  const columns = splitHeader(firstLine, sep).filter(Boolean).slice(0, 200);

  const blocked: Screen['blocked'] = [];
  const warned: Screen['warned'] = [];

  for (const col of columns) {
    const hit = BLOCK_PATTERNS.find(([re]) => re.test(col));
    if (hit) {
      blocked.push({ column: col, reason: hit[1] });
      continue;
    }
    const soft = WARN_PATTERNS.find(([re]) => re.test(col));
    if (soft) warned.push({ column: col, reason: soft[1] });
  }

  return { blocked, warned, checked: true };
}

/* -------------------------------------------------------------------------- */
/*  Transfer                                                                   */
/* -------------------------------------------------------------------------- */

function putWithProgress(
  url: string,
  file: File,
  contentType: string,
  onProgress: (fraction: number) => void
): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('PUT', url, true);
    xhr.setRequestHeader('content-type', contentType);
    xhr.setRequestHeader('x-upsert', 'false');
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) onProgress(e.loaded / e.total);
    };
    xhr.onload = () =>
      xhr.status >= 200 && xhr.status < 300
        ? resolve()
        : reject(new Error(`Transfer failed (${xhr.status})`));
    xhr.onerror = () => reject(new Error('Connection dropped during transfer'));
    xhr.ontimeout = () => reject(new Error('Transfer timed out'));
    xhr.send(file);
  });
}

function kb(bytes: number) {
  if (bytes >= 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  return `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

/* -------------------------------------------------------------------------- */
/*  Types                                                                      */
/* -------------------------------------------------------------------------- */

interface StoredFile {
  original_name: string;
  size_bytes: number;
  created_at: string;
}

interface SessionState {
  firstName: string;
  company: string;
  submitted: boolean;
  expiresAt: string | null;
  files: StoredFile[];
  limits: { maxFileBytes: number; maxFiles: number; extensions: string[] };
}

interface Pending {
  id: string;
  file: File;
  progress: number;
  state: 'screening' | 'blocked' | 'confirm' | 'uploading' | 'done' | 'error';
  screen?: Screen;
  message?: string;
}

/* -------------------------------------------------------------------------- */
/*  Component                                                                  */
/* -------------------------------------------------------------------------- */

/* ------------------------------------------------------------ shells */
/* Module-level on purpose: components defined inside UploadClient get a new
   identity every render, which remounts the whole page (file input, focus,
   drag state) on every progress tick. */

function Wrapper({ children }: { children: React.ReactNode }) {
  return (
    <main
      style={{
        minHeight: '100vh',
        background: PALETTE.void,
        padding: '48px 16px',
        fontFamily: DISPLAY,
      }}
    >
      <style>{sharedCss}</style>
      <div className="w-full mx-auto overflow-hidden" style={{ ...shellStyle, maxWidth: 680 }}>
        <div className="p-5 sm:p-7" style={bodyStyle}>
          {children}
        </div>
      </div>
    </main>
  );
}

function Message({ title, body }: { title: string; body: string }) {
  return (
    <Wrapper>
      <div className="inline-flex items-center" style={eyebrowTab}>
        PropOps8 // Secure upload
      </div>
      <h1 className="uppercase" style={{ ...headingStyle, margin: '18px 0 12px' }}>
        {title}
      </h1>
      <p style={{ fontSize: 15.5, lineHeight: 1.6, color: hexA('#ffffff', 0.68), margin: 0 }}>
        {body}
      </p>
      <p
        style={{
          fontFamily: MONO,
          fontSize: 12,
          lineHeight: 1.7,
          color: hexA('#ffffff', 0.5),
          marginTop: 20,
        }}
      >
        Email daniel@propops8.com and I&rsquo;ll sort it out the same day.
      </p>
    </Wrapper>
  );
}

export default function UploadClient({ token }: { token: string }) {
  const [session, setSession] = useState<SessionState | null>(null);
  const [loadError, setLoadError] = useState<'invalid' | 'unpaid' | 'expired' | 'network' | null>(null);
  const [pending, setPending] = useState<Pending[]>([]);
  const [dragging, setDragging] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const api = `/api/upload/${encodeURIComponent(token)}`;

  const load = useCallback(async () => {
    try {
      const res = await fetch(api);
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setLoadError((data?.error as SessionState extends never ? never : 'invalid') ?? 'invalid');
        return;
      }
      setSession(await res.json());
    } catch {
      setLoadError('network');
    }
  }, [api]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch on mount; state is set after the awaited request, not synchronously
    load();
  }, [load]);

  const uploadOne = useCallback(
    async (entry: Pending) => {
      const update = (patch: Partial<Pending>) =>
        setPending((p) => p.map((x) => (x.id === entry.id ? { ...x, ...patch } : x)));

      try {
        update({ state: 'uploading', progress: 0, message: undefined });

        const signRes = await fetch(api, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            action: 'sign',
            filename: entry.file.name,
            size: entry.file.size,
          }),
        });
        const sign = await signRes.json().catch(() => ({}));
        if (!signRes.ok || !sign?.uploadUrl) {
          update({ state: 'error', message: sign?.error ?? 'Could not start the upload.' });
          return;
        }

        await putWithProgress(sign.uploadUrl, entry.file, sign.contentType, (f) =>
          update({ progress: f })
        );

        const doneRes = await fetch(api, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            action: 'complete',
            path: sign.path,
            filename: entry.file.name,
            size: entry.file.size,
          }),
        });
        const done = await doneRes.json().catch(() => ({}));
        if (!doneRes.ok) {
          update({ state: 'error', message: done?.error ?? 'The upload did not register.' });
          return;
        }

        update({ state: 'done', progress: 1 });
        if (Array.isArray(done.files)) {
          setSession((s) => (s ? { ...s, files: done.files } : s));
        }
      } catch (err) {
        update({ state: 'error', message: String((err as Error).message ?? err) });
      }
    },
    [api]
  );

  const addFiles = useCallback(
    async (files: FileList | File[]) => {
      setError(null);
      const list = Array.from(files);

      for (const file of list) {
        const id = `${file.name}-${file.size}-${Math.random().toString(36).slice(2, 8)}`;
        const entry: Pending = { id, file, progress: 0, state: 'screening' };
        setPending((p) => [...p, entry]);

        const screen = await screenFile(file);

        if (screen.blocked.length) {
          setPending((p) =>
            p.map((x) => (x.id === id ? { ...x, state: 'blocked', screen } : x))
          );
          continue;
        }
        if (screen.warned.length) {
          setPending((p) =>
            p.map((x) => (x.id === id ? { ...x, state: 'confirm', screen } : x))
          );
          continue;
        }

        await uploadOne({ ...entry, screen });
      }
    },
    [uploadOne]
  );

  const submit = useCallback(async () => {
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch(api, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'submit' }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data?.error ?? 'Could not submit.');
        setSubmitting(false);
        return;
      }
      setSession((s) => (s ? { ...s, submitted: true } : s));
    } catch {
      setError('Network error. Your files are safe — try submitting again.');
    }
    setSubmitting(false);
  }, [api]);

  const uploadedCount = session?.files.length ?? 0;
  const busy = useMemo(
    () => pending.some((p) => p.state === 'uploading' || p.state === 'screening'),
    [pending]
  );

  /* ------------------------------------------------------------ shells */

  if (loadError === 'invalid')
    return (
      <Message
        title="This link isn't valid"
        body="It may have been mistyped, or truncated by an email client. Try opening it directly from the email rather than copying it."
      />
    );
  if (loadError === 'expired')
    return (
      <Message
        title="This link has expired"
        body="Upload links stay open for 14 days. Yours has closed, but your audit is still paid for and I can issue a fresh link straight away."
      />
    );
  if (loadError === 'unpaid')
    return (
      <Message
        title="This upload isn't open yet"
        body="The link activates once payment settles. If you've just paid by bank transfer it can take a little longer to clear."
      />
    );
  if (loadError === 'network')
    return <Message title="Couldn't reach the server" body="Check your connection and reload the page." />;

  if (!session)
    return (
      <Wrapper>
        <p style={{ ...utilityLabel, margin: 0 }}>Loading&hellip;</p>
      </Wrapper>
    );

  /* ----------------------------------------------------------- submitted */

  if (session.submitted) {
    return (
      <Wrapper>
        <div className="inline-flex items-center" style={eyebrowTab}>
          PropOps8 // Secure upload
        </div>
        <h1 className="uppercase" style={{ ...headingStyle, margin: '18px 0 12px' }}>
          Received &mdash; the clock has started
        </h1>
        <p style={{ fontSize: 15.5, lineHeight: 1.6, color: hexA('#ffffff', 0.68), margin: 0 }}>
          {uploadedCount} file{uploadedCount === 1 ? ' is' : 's are'} in. You&rsquo;ll have your
          findings report within 48 hours, along with a link to book the review call.
        </p>
        <div className="p-5" style={{ ...cardStyle, marginTop: 20 }}>
          <div style={utilityLabel}>Submitted</div>
          <ul style={{ listStyle: 'none', margin: '14px 0 0', padding: 0 }}>
            {session.files.map((f) => (
              <li
                key={f.original_name}
                className="flex items-center justify-between gap-3"
                style={{ fontFamily: MONO, fontSize: 12.5, color: '#dbe5f5', marginBottom: 9 }}
              >
                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  <span style={{ color: PALETTE.mint, marginRight: 8 }}>&#10003;</span>
                  {f.original_name}
                </span>
                <span style={{ color: hexA('#ffffff', 0.45), flexShrink: 0 }}>
                  {kb(Number(f.size_bytes))}
                </span>
              </li>
            ))}
          </ul>
        </div>
        <p
          style={{
            fontFamily: MONO,
            fontSize: 11,
            lineHeight: 1.8,
            color: hexA('#ffffff', 0.45),
            marginTop: 18,
          }}
        >
          Need to send something else? Reply to the confirmation email and I&rsquo;ll reopen the
          link.
        </p>
      </Wrapper>
    );
  }

  /* --------------------------------------------------------------- main */

  return (
    <Wrapper>
      <div className="inline-flex items-center" style={eyebrowTab}>
        PropOps8 // Secure upload
      </div>

      <h1 className="uppercase" style={{ ...headingStyle, margin: '18px 0 10px' }}>
        Send your export
      </h1>
      <p
        style={{
          fontSize: 15.5,
          lineHeight: 1.55,
          color: hexA('#ffffff', 0.66),
          margin: '0 0 6px',
        }}
      >
        {session.firstName ? `${session.firstName} — ` : ''}whatever your PMS can export. Raw is
        fine; normalising it is my job.
      </p>
      <p
        style={{
          ...utilityLabel,
          fontSize: 10,
          letterSpacing: '0.12em',
          color: hexA('#ffffff', 0.4),
          margin: '0 0 20px',
        }}
      >
        {session.limits.extensions.join(' · ')} &middot; up to{' '}
        {Math.round(session.limits.maxFileBytes / 1024 / 1024)} MB each &middot;{' '}
        {session.limits.maxFiles} files max
      </p>

      {/* ------------------------------------------- de-identification note */}
      <div
        className="p-4 sm:p-5"
        style={{
          ...panelStyle,
          borderColor: hexA(PALETTE.pink, 0.32),
          background: `linear-gradient(180deg, ${hexA(PALETTE.pink, 0.07)} 0%, ${PALETTE.panel} 70%)`,
          marginBottom: 16,
        }}
      >
        <div style={{ ...utilityLabel, fontSize: 10, color: PALETTE.pink }}>
          Before you upload
        </div>
        <p
          style={{
            fontFamily: MONO,
            fontSize: 11.5,
            lineHeight: 1.8,
            letterSpacing: '0.02em',
            color: hexA('#ffffff', 0.72),
            margin: '11px 0 0',
          }}
        >
          Strip resident names, Social Security numbers, financial account details and any
          medical information. Unit identifiers, dates, categories, vendors and costs are all the
          analysis uses.
          <br />
          <br />
          CSV headers are checked in your browser before anything is sent. Spreadsheet files
          (.xls/.xlsx) aren&rsquo;t scanned &mdash; please check those yourself.
        </p>
      </div>

      {/* ------------------------------------------------------- drop zone */}
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          if (e.dataTransfer.files?.length) addFiles(e.dataTransfer.files);
        }}
        onClick={() => inputRef.current?.click()}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') inputRef.current?.click();
        }}
        className="chaos-focus"
        style={{
          ...panelStyle,
          borderStyle: 'dashed',
          borderWidth: 2,
          borderColor: dragging ? PALETTE.cyan : hexA('#ffffff', 0.16),
          background: dragging ? hexA(PALETTE.cyan, 0.06) : PALETTE.panel,
          padding: '38px 20px',
          textAlign: 'center',
          cursor: 'pointer',
          transition: 'border-color .16s ease, background .16s ease',
        }}
      >
        <div
          style={{
            fontFamily: DISPLAY,
            fontSize: 16,
            fontWeight: 600,
            color: PALETTE.bright,
          }}
        >
          Drop files here
        </div>
        <div
          style={{
            ...utilityLabel,
            fontSize: 10,
            letterSpacing: '0.14em',
            marginTop: 8,
            color: hexA('#ffffff', 0.45),
          }}
        >
          or click to browse
        </div>
        <input
          ref={inputRef}
          type="file"
          multiple
          accept=".csv,.tsv,.xls,.xlsx"
          onChange={(e) => {
            if (e.target.files?.length) addFiles(e.target.files);
            e.target.value = '';
          }}
          style={{ display: 'none' }}
        />
      </div>

      {/* --------------------------------------------------------- pending */}
      {pending.length > 0 && (
        <div className="p-5" style={{ ...cardStyle, marginTop: 16 }}>
          <div style={utilityLabel}>This session</div>
          <ul style={{ listStyle: 'none', margin: '14px 0 0', padding: 0 }}>
            {pending.map((p) => (
              <li key={p.id} style={{ marginBottom: 16 }}>
                <div
                  className="flex items-center justify-between gap-3"
                  style={{ fontFamily: MONO, fontSize: 12.5, color: '#dbe5f5' }}
                >
                  <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {p.file.name}
                  </span>
                  <span style={{ color: hexA('#ffffff', 0.45), flexShrink: 0 }}>
                    {kb(p.file.size)}
                  </span>
                </div>

                {p.state === 'uploading' && (
                  <div
                    style={{
                      height: 5,
                      borderRadius: 999,
                      background: PALETTE.track,
                      marginTop: 9,
                      overflow: 'hidden',
                    }}
                  >
                    <div
                      style={{
                        width: `${Math.round(p.progress * 100)}%`,
                        height: '100%',
                        borderRadius: 999,
                        background: PALETTE.cyan,
                        boxShadow: `0 0 12px ${hexA(PALETTE.cyan, 0.7)}`,
                        transition: 'width .2s linear',
                      }}
                    />
                  </div>
                )}

                {p.state === 'screening' && (
                  <div style={{ ...utilityLabel, fontSize: 10, marginTop: 8 }}>
                    Checking headers&hellip;
                  </div>
                )}

                {p.state === 'done' && (
                  <div
                    style={{
                      ...utilityLabel,
                      fontSize: 10,
                      marginTop: 8,
                      color: PALETTE.mint,
                    }}
                  >
                    &#10003; Uploaded
                  </div>
                )}

                {p.state === 'blocked' && p.screen && (
                  <div
                    style={{
                      marginTop: 10,
                      padding: '12px 14px',
                      borderRadius: 8,
                      border: `1px solid ${hexA(PALETTE.pink, 0.45)}`,
                      background: hexA(PALETTE.pink, 0.08),
                      fontFamily: MONO,
                      fontSize: 11,
                      lineHeight: 1.75,
                      color: hexA('#ffffff', 0.8),
                    }}
                  >
                    <strong style={{ color: PALETTE.pink }}>Not uploaded.</strong> This file has
                    columns that look like personal data:
                    <br />
                    {p.screen.blocked.map((b) => (
                      <span key={b.column} style={{ display: 'block', marginTop: 5 }}>
                        &bull; <strong>{b.column}</strong> &mdash; {b.reason}
                      </span>
                    ))}
                    <span style={{ display: 'block', marginTop: 9, color: hexA('#ffffff', 0.6) }}>
                      Delete those columns and drop the file again. Nothing was sent.
                    </span>
                  </div>
                )}

                {p.state === 'confirm' && p.screen && (
                  <div
                    style={{
                      marginTop: 10,
                      padding: '12px 14px',
                      borderRadius: 8,
                      border: `1px solid ${hexA(PALETTE.cyan, 0.4)}`,
                      background: hexA(PALETTE.cyan, 0.06),
                      fontFamily: MONO,
                      fontSize: 11,
                      lineHeight: 1.75,
                      color: hexA('#ffffff', 0.8),
                    }}
                  >
                    Worth a look before this goes:
                    {p.screen.warned.map((w) => (
                      <span key={w.column} style={{ display: 'block', marginTop: 5 }}>
                        &bull; <strong>{w.column}</strong> &mdash; possible {w.reason}
                      </span>
                    ))}
                    <div className="flex gap-2" style={{ marginTop: 12, flexWrap: 'wrap' }}>
                      <button
                        type="button"
                        className="chaos-focus"
                        onClick={() => uploadOne(p)}
                        style={{
                          fontFamily: MONO,
                          fontSize: 10.5,
                          letterSpacing: '0.1em',
                          textTransform: 'uppercase',
                          padding: '9px 14px',
                          borderRadius: 7,
                          border: 'none',
                          background: PALETTE.cyan,
                          color: '#06202a',
                          cursor: 'pointer',
                        }}
                      >
                        Upload anyway
                      </button>
                      <button
                        type="button"
                        className="chaos-focus"
                        onClick={() => setPending((list) => list.filter((x) => x.id !== p.id))}
                        style={{
                          fontFamily: MONO,
                          fontSize: 10.5,
                          letterSpacing: '0.1em',
                          textTransform: 'uppercase',
                          padding: '9px 14px',
                          borderRadius: 7,
                          border: `1px solid ${hexA('#ffffff', 0.18)}`,
                          background: 'transparent',
                          color: hexA('#ffffff', 0.7),
                          cursor: 'pointer',
                        }}
                      >
                        Remove
                      </button>
                    </div>
                  </div>
                )}

                {p.state === 'error' && (
                  <div
                    className="flex items-center justify-between gap-3"
                    style={{
                      marginTop: 8,
                      fontFamily: MONO,
                      fontSize: 11,
                      color: PALETTE.pink,
                    }}
                  >
                    <span>{p.message}</span>
                    <button
                      type="button"
                      className="chaos-focus"
                      onClick={() => uploadOne(p)}
                      style={{
                        fontFamily: MONO,
                        fontSize: 10.5,
                        letterSpacing: '0.1em',
                        textTransform: 'uppercase',
                        padding: '7px 12px',
                        borderRadius: 7,
                        border: `1px solid ${hexA('#ffffff', 0.18)}`,
                        background: 'transparent',
                        color: hexA('#ffffff', 0.75),
                        cursor: 'pointer',
                        flexShrink: 0,
                      }}
                    >
                      Retry
                    </button>
                  </div>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* ---------------------------------------------------------- submit */}
      {error && (
        <p
          role="alert"
          style={{ fontFamily: MONO, fontSize: 12, color: PALETTE.pink, marginTop: 16 }}
        >
          {error}
        </p>
      )}

      <div style={{ marginTop: 20 }}>
        <button
          type="button"
          disabled={uploadedCount === 0 || busy || submitting}
          onClick={submit}
          className="chaos-cta w-full inline-flex items-center justify-center gap-3"
          style={{
            ...ctaStyle(),
            border: 'none',
            padding: '16px 20px',
            fontSize: 12.5,
            cursor: uploadedCount === 0 || busy || submitting ? 'not-allowed' : 'pointer',
            opacity: uploadedCount === 0 || busy || submitting ? 0.45 : 1,
          }}
        >
          {submitting
            ? 'Submitting…'
            : busy
              ? 'Waiting for transfers…'
              : `Submit ${uploadedCount || ''} file${uploadedCount === 1 ? '' : 's'} and start my audit`}
        </button>
        <p
          style={{
            ...utilityLabel,
            fontSize: 10,
            letterSpacing: '0.12em',
            textAlign: 'center',
            marginTop: 14,
            color: hexA('#ffffff', 0.45),
            lineHeight: 1.7,
          }}
        >
          48-hour turnaround starts when you submit &middot; Source files deleted at the end of
          the retention window
        </p>
      </div>
    </Wrapper>
  );
}
