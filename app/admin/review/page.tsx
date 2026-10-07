"use client";

/**
 * app/admin/review/page.tsx
 * ----------------------------------------------------------------
 * Upload a CSV -> engine runs -> you review and correct every
 * finding -> approve -> download the PDF -> send it to the linked
 * intake. Everything after upload happens in the browser.
 *
 * REBUILT ALONGSIDE THE ENGINE. What changed and why:
 *
 * 1. The recovery-total field is gone. It computed a dollar sum from
 *    flagged findings and defaulted to the label "in identified
 *    annual recovery opportunity" -- a number that asserted
 *    recoverability and an annual period, neither of which the file
 *    establishes. It's now a count of included review triggers, which
 *    is just what it says it is. There is no override, because there
 *    is nothing to override: it's a count of the rows you kept.
 *
 * 2. The "Audit period" text field is gone. A typed period can
 *    contradict the file it describes. The window now comes from the
 *    engine and is shown read-only.
 *
 * 3. Claim type is editable per finding. Human review is where a
 *    CALCULATION gets downgraded to an INFERENCE, so the reviewer
 *    needs to be able to do it.
 *
 * 4. Approval is gated behind an explicit checklist. The doctrine
 *    says a human reviews before delivery; a disabled button is what
 *    turns that from an intention into a step.
 */
import { useState, useCallback, useEffect } from "react";
import { parseCsv, runEngine, ENGINE_VERSION, type Finding, type SpendRow, type ClaimType, type AuditWindow, type EngineResult } from "@/lib/auditEngine";
import { GATE } from "@/lib/reviewGate";
import type { AuditReport } from "@/lib/reportTypes";

const VOID = "#070b14", CARD = "#161f33", SHELL = "#0b1220", BRIGHT = "#f4f8ff";
const BODY = "#e6edf7", LABEL = "#7f8ea8", CYAN = "#22d3ee", PINK = "#ff2d6b", MINT = "#4ade80";
const AMBER = "#f5a524";

const CLAIM_TYPES: ClaimType[] = ["FACT", "CALCULATION", "INFERENCE", "PREDICTION"];
const CLAIM_COLOR: Record<ClaimType, string> = {
  FACT: MINT, CALCULATION: CYAN, INFERENCE: AMBER, PREDICTION: PINK,
};

type Stage = "upload" | "review" | "done";

interface PendingIntake {
  id: string;
  name: string;
  email: string;
  company: string;
}

export default function ReviewPage() {
  const [stage, setStage] = useState<Stage>("upload");
  const [error, setError] = useState<string | null>(null);
  const [dropInfo, setDropInfo] = useState<{ dropped: number; total: number } | null>(null);

  const [meta, setMeta] = useState({
    propertyName: "",
    clientName: "",
    reportDate: new Date().toISOString().slice(0, 10),
    summary: "",
  });
  // Exactly what the engine returned. Never edited: the reviewer's changes live
  // in `findings` and are saved separately, so the two can always be compared.
  const [engineOutput, setEngineOutput] = useState<EngineResult | null>(null);
  const [findings, setFindings] = useState<Finding[]>([]);
  const [spendTable, setSpendTable] = useState<SpendRow[]>([]);
  const [auditWindow, setAuditWindow] = useState<AuditWindow | null>(null);
  const [netLedger, setNetLedger] = useState(0);
  const [rowsReviewed, setRowsReviewed] = useState(0);
  const [generating, setGenerating] = useState(false);
  const [gateChecked, setGateChecked] = useState<boolean[]>(GATE.map(() => false));

  const [intakes, setIntakes] = useState<PendingIntake[]>([]);
  const [selectedIntakeId, setSelectedIntakeId] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [sendResult, setSendResult] = useState<"sent" | "failed" | null>(null);
  const [sendError, setSendError] = useState<string | null>(null);
  // The exact bytes that were downloaded and reviewed. These are what get
  // emailed -- the server no longer re-renders the PDF, so the customer
  // receives the document that was actually approved, not a copy of it.
  const [approvedPdf, setApprovedPdf] = useState<Blob | null>(null);

  useEffect(() => {
    fetch("/api/admin/pending-intakes")
      .then((r) => r.json())
      .then((d) => setIntakes(d.intakes ?? []))
      .catch(() => {});
  }, []);

  const handleFile = useCallback(async (file: File) => {
    setError(null);
    try {
      if (/\.(xlsx|xls|xlsm|numbers|ods)$/i.test(file.name)) {
        setError(
          "Spreadsheet files can't be read directly. Open it, use File > Save As > CSV, and upload the CSV.",
        );
        return;
      }
      const text = await file.text();
      const { rows, droppedRows, totalRows } = parseCsv(text);
      if (rows.length === 0) {
        setError(
          "No usable rows found. Every row needs date, vendor, category, and a numeric amount -- check column headers.",
        );
        return;
      }
      const result = runEngine(rows);
      setEngineOutput({ ...result, droppedRows, totalRows });
      setFindings(result.findings);
      setSpendTable(result.spendTable);
      setAuditWindow(result.window);
      setNetLedger(result.netLedger);
      setRowsReviewed(rows.length);
      setDropInfo({ dropped: droppedRows, total: totalRows });
      setGateChecked(GATE.map(() => false));
      setStage("review");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't parse that file.");
    }
  }, []);

  const triggerCount = findings.filter((f) => f.include).length;
  const gatePassed = gateChecked.every(Boolean);

  function updateFinding(id: string, patch: Partial<Finding>) {
    setFindings((prev) => prev.map((f) => (f.id === id ? { ...f, ...patch } : f)));
  }

  function buildReport(): AuditReport {
    return {
      propertyName: meta.propertyName || "Untitled Property",
      clientName: meta.clientName,
      reportDate: meta.reportDate,
      triggerCount,
      triggerLabel: triggerCount === 1 ? "REVIEW TRIGGER" : "REVIEW TRIGGERS",
      triggerNote: "not quantified savings",
      window: auditWindow,
      netLedger: `$${Math.round(netLedger).toLocaleString()}`,
      rowsReviewed,
      droppedRows: dropInfo?.dropped ?? 0,
      summary: meta.summary,
      spendTable,
      findings,
    };
  }

  async function handleApproveAndDownload() {
    setGenerating(true);
    setError(null);
    try {
      const { pdf } = await import("@react-pdf/renderer");
      const { AuditPdf } = await import("@/lib/reportPdf");
      const blob = await pdf(<AuditPdf report={buildReport()} />).toBlob();

      // A linked intake is saved BEFORE anything is downloaded or sendable.
      // If the save fails the reviewer stays here and nothing is offered.
      if (selectedIntakeId) {
        if (!engineOutput) throw new Error("Engine output is missing. Re-upload the ledger.");
        const digest = await crypto.subtle.digest("SHA-256", await blob.arrayBuffer());
        const pdfSha256 = Array.from(new Uint8Array(digest))
          .map((b) => b.toString(16).padStart(2, "0"))
          .join("");
        const res = await fetch("/api/admin/reviews", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            intakeId: selectedIntakeId,
            engineVersion: ENGINE_VERSION,
            engineOutput,
            reviewerEdits: { meta, findings, triggerCount },
            gateChecks: gateChecked,
            approved: true,
            pdfSha256,
          }),
        });
        if (!res.ok) {
          const payload = await res.json().catch(() => ({}));
          throw new Error(`Review was not saved, so nothing was downloaded or sent. ${payload?.error ?? `Server returned ${res.status}.`}`);
        }
      }

      setApprovedPdf(blob);
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      const safeName = (meta.propertyName || "audit").replace(/[^a-z0-9]+/gi, "_");
      a.download = `${safeName}_Ledger_Review.pdf`;
      a.click();
      URL.revokeObjectURL(url);
      setStage("done");
    } catch (e) {
      setError(e instanceof Error ? e.message : "PDF generation failed.");
    } finally {
      setGenerating(false);
    }
  }

  async function blobToBase64(blob: Blob): Promise<string> {
    const buf = await blob.arrayBuffer();
    const bytes = new Uint8Array(buf);
    // Chunked rather than String.fromCharCode(...bytes) -- spreading a
    // few hundred KB of bytes into an argument list overflows the stack.
    let binary = "";
    const CHUNK = 0x8000;
    for (let i = 0; i < bytes.length; i += CHUNK) {
      binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
    }
    return btoa(binary);
  }

  async function handleSendToCustomer() {
    if (!selectedIntakeId || !approvedPdf) return;
    setSending(true);
    setSendResult(null);
    setSendError(null);
    try {
      const pdfBase64 = await blobToBase64(approvedPdf);
      const res = await fetch("/api/send-report", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          intakeId: selectedIntakeId,
          pdfBase64,
          propertyName: meta.propertyName || "Untitled Property",
          triggerCount,
        }),
      });
      if (res.ok) {
        setSendResult("sent");
      } else {
        const payload = await res.json().catch(() => ({}));
        setSendResult("failed");
        setSendError(payload?.error ?? `Server returned ${res.status}.`);
      }
    } catch (e) {
      setSendResult("failed");
      setSendError(e instanceof Error ? e.message : "Request failed before reaching the server.");
    } finally {
      setSending(false);
    }
  }

  async function handleLogout() {
    await fetch("/api/admin/logout", { method: "POST" });
    window.location.href = "/admin/login";
  }

  return (
    <div style={{ minHeight: "100vh", background: VOID, color: BODY, fontFamily: "Inter, ui-sans-serif, system-ui, sans-serif" }}>
      <div style={{ maxWidth: 900, margin: "0 auto", padding: "40px 24px 80px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 36 }}>
          <div style={{ color: BRIGHT, fontWeight: 800, fontSize: 20 }}>
            PROPOPS<span style={{ color: CYAN }}>8</span>{" "}
            <span style={{ color: LABEL, fontWeight: 400, fontSize: 14 }}>/ ledger review</span>
          </div>
          <button onClick={handleLogout} style={ghostBtn}>Sign out</button>
        </div>

        {error && (
          <div style={{ background: "rgba(255,45,107,0.1)", border: `1px solid ${PINK}`, borderRadius: 8, padding: "12px 16px", color: PINK, marginBottom: 20, fontSize: 13 }}>
            {error}
          </div>
        )}

        {stage === "upload" && <UploadStage onFile={handleFile} />}

        {stage === "review" && (
          <>
            {dropInfo && dropInfo.dropped > 0 && (
              <div style={{ color: LABEL, fontSize: 12.5, marginBottom: 18 }}>
                Parsed {dropInfo.total - dropInfo.dropped} of {dropInfo.total} rows —{" "}
                {dropInfo.dropped} skipped for missing date/vendor/category/amount.
              </div>
            )}

            <Section title="Report details">
              {intakes.length > 0 && (
                <div style={{ marginBottom: 14 }}>
                  <div style={{ fontSize: 11.5, color: LABEL, marginBottom: 4 }}>Link to a paid intake (optional)</div>
                  <select
                    value={selectedIntakeId ?? ""}
                    onChange={(e) => {
                      const id = e.target.value || null;
                      setSelectedIntakeId(id);
                      const picked = intakes.find((i) => i.id === id);
                      if (picked) setMeta((m) => ({ ...m, propertyName: picked.company, clientName: picked.name }));
                    }}
                    style={selectStyle}
                  >
                    <option value="">— not linked to an intake —</option>
                    {intakes.map((i) => (
                      <option key={i.id} value={i.id}>{i.company} — {i.name} ({i.email})</option>
                    ))}
                  </select>
                </div>
              )}
              <Field label="Property name" value={meta.propertyName} onChange={(v) => setMeta((m) => ({ ...m, propertyName: v }))} />
              <Field label="Client name" value={meta.clientName} onChange={(v) => setMeta((m) => ({ ...m, clientName: v }))} />
              <Field label="Report date" value={meta.reportDate} onChange={(v) => setMeta((m) => ({ ...m, reportDate: v }))} />
              <Field
                label="Summary paragraph"
                value={meta.summary}
                onChange={(v) => setMeta((m) => ({ ...m, summary: v }))}
                multiline
                placeholder="Optional. Describe what you found in your own words — but don't assert a cause the file doesn't show."
              />
            </Section>

            {/* Derived, not typed. A hand-entered period can contradict the file. */}
            <Section title="Audit window — read from the file, not entered">
              <div style={{ background: SHELL, borderRadius: 8, padding: "12px 14px", fontFamily: "monospace", fontSize: 11.5, color: LABEL, lineHeight: 1.8 }}>
                {auditWindow ? (
                  <>
                    <div>DATA WINDOW: {auditWindow.firstDate} → {auditWindow.lastDate}</div>
                    <div>ANALYSIS MONTH: {auditWindow.latestMonth}</div>
                    {auditWindow.partialMonthExcluded && (
                      <div style={{ color: AMBER }}>
                        EXCLUDED: {auditWindow.partialMonthExcluded} — partial month, file ends {auditWindow.lastDate}
                      </div>
                    )}
                    <div>BASELINE: {auditWindow.baselineFormula}</div>
                    <div>ROWS REVIEWED: {rowsReviewed.toLocaleString()} · NET LEDGER: ${Math.round(netLedger).toLocaleString()}</div>
                  </>
                ) : (
                  <div style={{ color: AMBER }}>
                    No parseable dates in this file. Monthly baselines and aging are unavailable —
                    the report will say so rather than estimate them.
                  </div>
                )}
              </div>
            </Section>

            <Section title={`Review triggers — ${triggerCount} of ${findings.length} included`}>
              <div style={{ fontSize: 12.5, color: LABEL, marginBottom: 10 }}>
                A count of what a human should look at. Not a dollar total, and not a savings
                estimate — untick anything you don&rsquo;t want to stand behind.
              </div>
              {findings.length === 0 ? (
                <div style={{ color: LABEL, fontSize: 13 }}>
                  Nothing crossed a threshold in this file. That is a legitimate result and the
                  report should say it plainly.
                </div>
              ) : (
                findings.map((f) => (
                  <FindingCard key={f.id} finding={f} onChange={(patch) => updateFinding(f.id, patch)} />
                ))
              )}
            </Section>

            <Section title={`Category variance (${spendTable.length})`}>
              {spendTable.length === 0 ? (
                <div style={{ color: LABEL, fontSize: 13 }}>No categories detected.</div>
              ) : (
                spendTable.map((row) => (
                  <div key={row.category} style={{ display: "flex", justifyContent: "space-between", padding: "8px 0", borderBottom: "1px solid rgba(255,255,255,0.05)", fontSize: 13 }}>
                    <span>{row.category}</span>
                    <span style={{ color: LABEL }}>{row.thisPeriod} vs {row.baseline}</span>
                    {row.baselineUsable ? (
                      <span style={{ color: row.variancePct > 0 ? PINK : MINT, fontWeight: 600 }}>
                        {row.variancePct > 0 ? "+" : ""}{row.variancePct}%
                      </span>
                    ) : (
                      <span style={{ color: AMBER, fontFamily: "monospace", fontSize: 11 }}>INSUFFICIENT BASELINE</span>
                    )}
                  </div>
                ))
              )}
            </Section>

            {/* The gate. Doctrine says a human reviews before delivery; a
                disabled button is what makes that a step rather than a hope. */}
            <Section title="Before approving">
              {GATE.map((g, i) => (
                <label key={g} style={{ display: "flex", alignItems: "flex-start", gap: 10, fontSize: 13, color: gateChecked[i] ? BODY : LABEL, cursor: "pointer", marginBottom: 9 }}>
                  <input
                    type="checkbox"
                    checked={gateChecked[i]}
                    onChange={(e) => setGateChecked((prev) => prev.map((v, j) => (j === i ? e.target.checked : v)))}
                    style={{ marginTop: 2 }}
                  />
                  {g}
                </label>
              ))}
            </Section>

            <div style={{ display: "flex", gap: 12, marginTop: 28, alignItems: "center" }}>
              <button onClick={() => setStage("upload")} style={ghostBtn}>← Start over</button>
              <button
                onClick={handleApproveAndDownload}
                disabled={generating || !gatePassed}
                style={primaryBtn(generating || !gatePassed)}
              >
                {generating ? "Generating…" : "Approve & download PDF"}
              </button>
              {!gatePassed && (
                <span style={{ color: LABEL, fontSize: 12 }}>Check all four to approve.</span>
              )}
            </div>
          </>
        )}

        {stage === "done" && (
          <div style={{ textAlign: "center", padding: "80px 0" }}>
            <div style={{ color: MINT, fontSize: 18, fontWeight: 700, marginBottom: 10 }}>PDF downloaded.</div>
            <div style={{ color: LABEL, fontSize: 13, marginBottom: 24 }}>
              {selectedIntakeId
                ? "Read it end to end, then send it to the customer below."
                : "Not linked to an intake — read it end to end, then send it however you send reports today."}
            </div>
            {selectedIntakeId && (
              <div style={{ marginBottom: 16 }}>
                <button onClick={handleSendToCustomer} disabled={sending} style={primaryBtn(sending)}>
                  {sending ? "Sending…" : "Send to customer"}
                </button>
                {sendResult === "sent" && <div style={{ color: MINT, fontSize: 13, marginTop: 10 }}>Sent.</div>}
                {sendResult === "failed" && (
                  <div style={{ color: PINK, fontSize: 13, marginTop: 10, maxWidth: 460, marginLeft: "auto", marginRight: "auto", lineHeight: 1.5 }}>
                    Send failed. {sendError}
                  </div>
                )}
              </div>
            )}
            <button onClick={() => setStage("review")} style={ghostBtn}>← Back to review</button>
          </div>
        )}
      </div>
    </div>
  );
}

function UploadStage({ onFile }: { onFile: (f: File) => void }) {
  const [dragging, setDragging] = useState(false);
  return (
    <div
      onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
      onDragLeave={() => setDragging(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDragging(false);
        const file = e.dataTransfer.files?.[0];
        if (file) onFile(file);
      }}
      style={{
        border: `1.5px dashed ${dragging ? CYAN : "rgba(255,255,255,0.15)"}`,
        borderRadius: 14,
        padding: "64px 24px",
        textAlign: "center",
        background: dragging ? "rgba(34,211,238,0.04)" : "transparent",
      }}
    >
      <div style={{ color: BRIGHT, fontSize: 16, fontWeight: 600, marginBottom: 8 }}>Drop a ledger CSV here</div>
      <div style={{ color: LABEL, fontSize: 13, marginBottom: 20 }}>
        date, vendor, category, amount — plus optional status/opened_date for aging
      </div>
      <label style={{ ...primaryBtn(false), display: "inline-block", cursor: "pointer" }}>
        Choose file
        <input
          type="file"
          accept=".csv,text/csv"
          style={{ display: "none" }}
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) onFile(file);
          }}
        />
      </label>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 28 }}>
      <div style={{ fontFamily: "monospace", fontSize: 11, letterSpacing: "0.1em", color: LABEL, textTransform: "uppercase", marginBottom: 10 }}>
        {title}
      </div>
      {children}
    </div>
  );
}

const selectStyle: React.CSSProperties = {
  width: "100%",
  boxSizing: "border-box",
  background: SHELL,
  border: "1px solid rgba(255,255,255,0.1)",
  borderRadius: 8,
  padding: "9px 11px",
  color: BODY,
  fontSize: 13,
  fontFamily: "inherit",
};

function Field({
  label, value, onChange, multiline, placeholder,
}: {
  label: string; value: string; onChange: (v: string) => void; multiline?: boolean; placeholder?: string;
}) {
  const commonStyle = {
    width: "100%",
    boxSizing: "border-box" as const,
    background: SHELL,
    border: "1px solid rgba(255,255,255,0.1)",
    borderRadius: 8,
    padding: "9px 11px",
    color: BODY,
    fontSize: 13,
    fontFamily: "inherit",
  };
  return (
    <div style={{ marginBottom: 10 }}>
      <div style={{ fontSize: 11.5, color: LABEL, marginBottom: 4 }}>{label}</div>
      {multiline ? (
        <textarea rows={3} value={value} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} style={commonStyle} />
      ) : (
        <input value={value} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} style={commonStyle} />
      )}
    </div>
  );
}

function FindingCard({ finding, onChange }: { finding: Finding; onChange: (patch: Partial<Finding>) => void }) {
  return (
    <div
      style={{
        background: CARD,
        borderRadius: 8,
        padding: 16,
        marginBottom: 10,
        borderLeft: `3px solid ${finding.amountIsCost ? PINK : MINT}`,
        opacity: finding.include ? 1 : 0.45,
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
        <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12, color: LABEL, cursor: "pointer" }}>
          <input type="checkbox" checked={finding.include} onChange={(e) => onChange({ include: e.target.checked })} />
          include in report
        </label>

        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ fontSize: 12, color: LABEL }}>claim type</span>
          <select
            value={finding.claimType}
            onChange={(e) => onChange({ claimType: e.target.value as ClaimType })}
            style={{
              background: SHELL,
              border: `1px solid ${CLAIM_COLOR[finding.claimType]}`,
              color: CLAIM_COLOR[finding.claimType],
              borderRadius: 6,
              padding: "4px 8px",
              fontSize: 11,
              fontFamily: "monospace",
            }}
          >
            {CLAIM_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
        </div>

        <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12, color: LABEL, cursor: "pointer" }}>
          <input type="checkbox" checked={finding.amountIsCost} onChange={(e) => onChange({ amountIsCost: e.target.checked })} />
          cost (unchecked = mint)
        </label>
      </div>

      {finding.sourceRows?.length ? (
        <div style={{ fontFamily: "monospace", fontSize: 10.5, color: LABEL, marginTop: 10 }}>
          {finding.sourceRows.length} source row(s): {finding.sourceRows.slice(0, 12).join(", ")}
          {finding.sourceRows.length > 12 ? " …" : ""}
        </div>
      ) : null}

      <div style={{ marginTop: 10 }}>
        <Field label="Category" value={finding.category} onChange={(v) => onChange({ category: v })} />
        <Field label="Title" value={finding.title} onChange={(v) => onChange({ title: v })} />
        <Field label="Description" value={finding.description} onChange={(v) => onChange({ description: v })} multiline />
        <div style={{ display: "flex", gap: 10 }}>
          <div style={{ flex: 1 }}>
            <Field label="Amount" value={finding.amount} onChange={(v) => onChange({ amount: v })} />
          </div>
          <div style={{ flex: 1 }}>
            <Field label="Amount label" value={finding.amountLabel} onChange={(v) => onChange({ amountLabel: v })} />
          </div>
        </div>
        <Field label="Review next" value={finding.recommendation} onChange={(v) => onChange({ recommendation: v })} multiline />
      </div>
    </div>
  );
}

const ghostBtn: React.CSSProperties = {
  background: "transparent",
  border: "1px solid rgba(255,255,255,0.18)",
  color: BRIGHT,
  borderRadius: 8,
  padding: "10px 18px",
  fontSize: 12.5,
  fontWeight: 600,
  cursor: "pointer",
};

function primaryBtn(disabled: boolean): React.CSSProperties {
  return {
    background: CYAN,
    border: "none",
    color: "#06202a",
    borderRadius: 8,
    padding: "10px 20px",
    fontSize: 12.5,
    fontWeight: 700,
    cursor: disabled ? "default" : "pointer",
    opacity: disabled ? 0.6 : 1,
  };
}
