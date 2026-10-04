"use client";

import { useCallback, useEffect, useState } from "react";

interface Intake {
  id: string;
  created_at: string;
  name: string;
  email: string;
  company: string;
  portfolio_size: string;
  primary_concern: string;
  status: string;
  fulfillment_status: string;
  fulfillment_error: string | null;
  files_submitted_at: string | null;
  report_sent_at: string | null;
}

const BADGE: Record<string, string> = {
  submitted: "#F2A33A",
  paid: "#4FD69C",
  files_received: "#03edff",
  in_analysis: "#8B7CF6",
};

function label(i: Intake): string {
  if (i.report_sent_at) return "report sent";
  if (i.status === "submitted") return "HELD — payment unconfirmed";
  if (i.files_submitted_at) return "files received";
  if (i.fulfillment_status === "failed") return "link FAILED";
  if (i.fulfillment_status === "sent") return "link sent, awaiting files";
  return i.status.replace("_", " ");
}

export default function IntakesPage() {
  const [rows, setRows] = useState<Intake[] | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    const res = await fetch("/api/admin/intakes", { cache: "no-store" });
    if (!res.ok) { setMsg("Could not load intakes."); return; }
    setRows((await res.json()).intakes);
  }, []);

  useEffect(() => { load(); }, [load]);

  async function act(i: Intake, action: "release" | "resend") {
    const ask = action === "release"
      ? `Confirm the $497 for ${i.company} has landed, then release? This emails ${i.email} their upload link.`
      : `Email ${i.email} a NEW upload link? The old link stops working.`;
    if (!window.confirm(ask)) return;
    setBusy(i.id); setMsg(null);
    const res = await fetch("/api/admin/intakes", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: i.id, action }),
    });
    const body = await res.json().catch(() => ({}));
    setMsg(res.ok ? body.message : body.error ?? "Failed.");
    setBusy(null);
    load();
  }

  return (
    <main style={{ maxWidth: 900, margin: "0 auto", padding: "28px 16px 80px", color: "#cbd5e1", fontFamily: "Inter, system-ui, sans-serif" }}>
      <h1 style={{ color: "#fff", fontSize: 22, fontWeight: 800, margin: "0 0 4px" }}>Audit intakes</h1>
      <p style={{ margin: "0 0 20px", fontSize: 13, color: "#8e9ab3" }}>
        Held intakes need you to confirm payment, then Release sends the upload link. Resend issues a fresh link and kills the old one.
      </p>
      {msg && <div role="status" style={{ padding: "10px 12px", marginBottom: 16, borderRadius: 8, background: "#111a2b", border: "1px solid rgba(255,255,255,.1)" }}>{msg}</div>}
      {rows === null && <p>Loading…</p>}
      {rows?.length === 0 && <p>No open intakes.</p>}
      <div style={{ display: "grid", gap: 10 }}>
        {rows?.map((i) => (
          <div key={i.id} style={{ padding: 14, borderRadius: 12, background: "#111a33", border: "1px solid rgba(233,235,239,.12)", borderLeft: `3px solid ${BADGE[i.status] ?? "#A3A9B8"}` }}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
              <strong style={{ color: "#fff" }}>{i.company}</strong>
              <span style={{ fontFamily: "ui-monospace, monospace", fontSize: 11, textTransform: "uppercase", letterSpacing: ".08em", color: BADGE[i.status] ?? "#A3A9B8" }}>{label(i)}</span>
            </div>
            <div style={{ fontSize: 13, margin: "4px 0 8px" }}>{i.name} · {i.email} · {i.portfolio_size} · {new Date(i.created_at).toLocaleDateString()}</div>
            {i.fulfillment_error && <div style={{ fontSize: 12, color: "#f87171", marginBottom: 8 }}>Last error: {i.fulfillment_error}</div>}
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              {i.status === "submitted" && (
                <button disabled={busy === i.id} onClick={() => act(i, "release")} style={btn("#4FD69C")}>Release (payment confirmed)</button>
              )}
              {(i.status === "paid" || i.status === "files_received") && !i.report_sent_at && (
                <button disabled={busy === i.id} onClick={() => act(i, "resend")} style={btn("#03edff")}>Resend link</button>
              )}
            </div>
          </div>
        ))}
      </div>
    </main>
  );
}

const btn = (c: string): React.CSSProperties => ({
  padding: "8px 12px", borderRadius: 8, border: `1px solid ${c}`, background: "transparent",
  color: c, font: "600 12px Inter, system-ui, sans-serif", cursor: "pointer",
});
