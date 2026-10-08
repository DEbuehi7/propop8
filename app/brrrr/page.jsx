"use client";

import React, { useState, useEffect, useMemo } from "react";
import SimulatePanel from "./SimulatePanel";

// Swap this for a Supabase table when you want the trades on more than one device.
const STORE_KEY = "brrrr:papertrades";

/* ------------------------------------------------------------------
   Palette is a file, not a habit. Six values. Change them here only.
   ------------------------------------------------------------------ */
const T = {
  navy: "#1B243D",
  navyDeep: "#141B2E",
  slate: "#5C6478",
  gray: "#E9EBEF",
  cyan: "#3DDCE8",
  magenta: "#E92AD6",
};

const FONT = "ui-sans-serif, system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif";
const NUM = { fontVariantNumeric: "tabular-nums", fontFeatureSettings: "'tnum'" };

/* ------------------------------------------------------------------
   Underwriting math. Every figure below is derived, never stored.
   ------------------------------------------------------------------ */

// Monthly amortization factor
function amortFactor(annualRatePct, years) {
  const r = annualRatePct / 100 / 12;
  const n = years * 12;
  if (r === 0) return 1 / n;
  const g = Math.pow(1 + r, n);
  return (r * g) / (g - 1);
}

// PITI + MIP for a given price, under the stated assumptions.
function computePiti(price, a) {
  const baseLoan = price * (1 - a.downPct / 100);
  const ufmip = baseLoan * (a.ufmipPct / 100);
  const totalLoan = a.financeUfmip ? baseLoan + ufmip : baseLoan;
  const k = amortFactor(a.ratePct, a.termYears);

  const pi = totalLoan * k;
  const mip = (baseLoan * (a.annualMipPct / 100)) / 12;
  const tax = (price * (a.taxRatePct / 100)) / 12;
  const ins = a.insuranceAnnual / 12;
  const hoa = a.hoaMonthly;

  return { baseLoan, ufmip, totalLoan, pi, mip, tax, ins, hoa, total: pi + mip + tax + ins + hoa };
}

// Solve backward: highest price at which qualifying rent still covers PITI.
// PITI(P) = P*A + fixed, so P* = (target - fixed) / A
function maxCompatiblePrice(qualifyingRent, a) {
  const k = amortFactor(a.ratePct, a.termYears);
  const d = 1 - a.downPct / 100;
  const u = a.financeUfmip ? 1 + a.ufmipPct / 100 : 1;
  const A = d * u * k + (d * (a.annualMipPct / 100)) / 12 + a.taxRatePct / 100 / 12;
  const fixed = a.insuranceAnnual / 12 + a.hoaMonthly;
  const p = (qualifyingRent - fixed) / A;
  return p > 0 ? p : 0;
}

const usd = (n, dp = 0) =>
  n == null || !isFinite(n)
    ? "—"
    : "$" + n.toLocaleString("en-US", { minimumFractionDigits: dp, maximumFractionDigits: dp });

/* ------------------------------------------------------------------
   Gauge. Marker position against a fixed threshold — position encoded,
   not area. The number in the middle is the actual hero.
   ------------------------------------------------------------------ */
const GMIN = 0.6;
const GMAX = 1.5;
const A0 = 135;
const A1 = 405;

const polar = (cx, cy, r, deg) => {
  const t = (deg * Math.PI) / 180;
  return { x: cx + r * Math.cos(t), y: cy + r * Math.sin(t) };
};
const angleFor = (v) => A0 + ((Math.min(GMAX, Math.max(GMIN, v)) - GMIN) / (GMAX - GMIN)) * (A1 - A0);
const arcPath = (cx, cy, r, a, b) => {
  const s = polar(cx, cy, r, a);
  const e = polar(cx, cy, r, b);
  return `M ${s.x} ${s.y} A ${r} ${r} 0 ${b - a > 180 ? 1 : 0} 1 ${e.x} ${e.y}`;
};

function MarginGauge({ margin, band, applicable }) {
  const cx = 130, cy = 130, r = 98;
  const color = band === "pass" ? T.cyan : band === "fail" ? T.magenta : T.slate;

  return (
    <svg viewBox="0 0 260 250" style={{ width: "100%", maxWidth: 300, display: "block" }}>
      <path d={arcPath(cx, cy, r, A0, A1)} fill="none" stroke={T.slate} strokeWidth="14" opacity="0.32" strokeLinecap="butt" />
      {applicable && isFinite(margin) && (
        <path d={arcPath(cx, cy, r, A0, angleFor(margin))} fill="none" stroke={color} strokeWidth="14" strokeLinecap="butt" />
      )}

      {/* Threshold ticks — 1.00 is the FHA screen line, 1.10 the internal margin */}
      {[1.0, 1.1].map((t) => {
        const a = angleFor(t);
        const p1 = polar(cx, cy, r - 11, a);
        const p2 = polar(cx, cy, r + 11, a);
        const lb = polar(cx, cy, r + 24, a);
        return (
          <g key={t}>
            <line x1={p1.x} y1={p1.y} x2={p2.x} y2={p2.y} stroke={T.gray} strokeWidth={t === 1 ? 2.5 : 1.5} opacity={t === 1 ? 1 : 0.55} />
            <text x={lb.x} y={lb.y} fill={T.gray} opacity={t === 1 ? 0.9 : 0.5} fontSize="10.5" textAnchor="middle" dominantBaseline="middle" style={NUM}>
              {t.toFixed(2)}
            </text>
          </g>
        );
      })}

      {/* Encode twice: shape carries the same fact as colour */}
      {applicable && isFinite(margin) && band !== "mid" && (
        <path
          d={band === "pass" ? "M 130 58 l 9 15 h -18 z" : "M 130 73 l 9 -15 h -18 z"}
          fill={color}
        />
      )}
      {applicable && band === "mid" && <rect x="121" y="64" width="18" height="3" fill={T.slate} />}

      <text x={cx} y={cy + 6} fill={applicable ? T.gray : T.slate} fontSize="46" fontWeight="600" textAnchor="middle" style={NUM}>
        {applicable && isFinite(margin) ? margin.toFixed(2) : "—"}
      </text>
      <text x={cx} y={cy + 30} fill={T.slate} fontSize="11.5" textAnchor="middle">
        coverage ratio
      </text>
    </svg>
  );
}

/* ------------------------------------------------------------------
   Inputs
   ------------------------------------------------------------------ */
function Field({ label, value, onChange, prefix, suffix, hint, wide }) {
  return (
    <label style={{ display: "block", marginBottom: 14, gridColumn: wide ? "1 / -1" : "auto" }}>
      <div style={{ color: T.slate, fontSize: 12.5, marginBottom: 5 }}>{label}</div>
      <div style={{ display: "flex", alignItems: "center", background: T.navyDeep, border: `1px solid ${T.slate}55`, borderRadius: 3 }}>
        {prefix && <span style={{ color: T.slate, padding: "0 0 0 9px", fontSize: 13 }}>{prefix}</span>}
        <input
          type="number"
          value={value}
          onChange={(e) => onChange(e.target.value === "" ? "" : Number(e.target.value))}
          style={{
            flex: 1, background: "transparent", border: "none", outline: "none",
            color: T.gray, fontSize: 15, padding: "9px", width: "100%", fontFamily: FONT, ...NUM,
          }}
        />
        {suffix && <span style={{ color: T.slate, padding: "0 9px 0 0", fontSize: 13 }}>{suffix}</span>}
      </div>
      {hint && <div style={{ color: T.slate, fontSize: 11, marginTop: 4 }}>{hint}</div>}
    </label>
  );
}

const Rule = ({ label }) => (
  <div style={{ display: "flex", alignItems: "center", gap: 10, margin: "26px 0 14px" }}>
    <span style={{ color: T.gray, fontSize: 13.5 }}>{label}</span>
    <span style={{ flex: 1, height: 1, background: `${T.slate}44` }} />
  </div>
);

/* ------------------------------------------------------------------ */

function ScreenPanel() {
  const [unitCount, setUnitCount] = useState(4);
  const [price, setPrice] = useState(650000);
  const [rents, setRents] = useState([1700, 1700, 1750, 1750]);
  const [county, setCounty] = useState("Kern");
  const [address, setAddress] = useState("");

  const [rentSource, setRentSource] = useState("estimated");
  const [unitsVerified, setUnitsVerified] = useState(false);
  const [lenderVerified, setLenderVerified] = useState(false);

  const [showAssumptions, setShowAssumptions] = useState(false);
  const [a, setA] = useState({
    downPct: 3.5, ratePct: 6.5, termYears: 30,
    ufmipPct: 1.75, financeUfmip: true, annualMipPct: 0.55,
    taxRatePct: 1.15, insuranceAnnual: 3600, hoaMonthly: 0, coveragePct: 75,
  });
  const set = (k) => (v) => setA((p) => ({ ...p, [k]: v }));

  const [saved, setSaved] = useState([]);
  const [storageOk, setStorageOk] = useState(true);

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(STORE_KEY);
      if (raw) setSaved(JSON.parse(raw));
    } catch { /* nothing saved yet */ }
  }, []);

  const activeRents = rents.slice(0, unitCount);
  const grossRent = activeRents.reduce((s, r) => s + (Number(r) || 0), 0);
  const qualifying = grossRent * (a.coveragePct / 100);
  const piti = useMemo(() => computePiti(price || 0, a), [price, a]);
  const applicable = unitCount >= 3;
  const margin = piti.total > 0 ? qualifying / piti.total : NaN;
  const band = !applicable ? "mid" : margin >= 1.1 ? "pass" : margin >= 1.0 ? "mid" : "fail";
  const maxPrice = maxCompatiblePrice(qualifying, a);

  const gatesOpen = [
    !unitsVerified && "legal unit count",
    rentSource === "estimated" && "rent evidence",
    !lenderVerified && "lender confirmation",
  ].filter(Boolean);

  let verdict, verdictColor, verdictNote;
  if (!applicable) {
    verdict = "Screen not applicable";
    verdictColor = T.slate;
    verdictNote = "FHA self-sufficiency applies to 3- and 4-unit properties only. Underwrite this one on debt-to-income and cash flow instead.";
  } else if (!isFinite(margin)) {
    verdict = "Insufficient evidence";
    verdictColor = T.slate;
    verdictNote = "Enter a price and rents.";
  } else if (margin < 1.0) {
    verdict = "Kill";
    verdictColor = T.magenta;
    verdictNote = `Fails the preliminary screen at ${usd(price)}. Conservative rents cover ${(margin * 100).toFixed(0)}% of monthly housing expense.`;
  } else if (gatesOpen.length) {
    verdict = "Verify";
    verdictColor = T.slate;
    verdictNote = `Ratio clears, but ${gatesOpen.join(", ")} ${gatesOpen.length > 1 ? "remain" : "remains"} unverified. Not a pass.`;
  } else if (margin < 1.1) {
    verdict = "Conditional";
    verdictColor = T.slate;
    verdictNote = "Clears the screen but sits inside the internal margin. No room for a rate move or a rent miss.";
  } else {
    verdict = "Preliminary pass";
    verdictColor = T.cyan;
    verdictNote = "Clears the screen with margin. Lender and appraiser still decide.";
  }

  const sensitivity = [5.5, 6.0, 6.5, 7.0, 7.5].map((r) => {
    const p = computePiti(price || 0, { ...a, ratePct: r });
    const m = p.total > 0 ? qualifying / p.total : NaN;
    return { rate: r, piti: p.total, margin: m, max: maxCompatiblePrice(qualifying, { ...a, ratePct: r }) };
  });

  function savePaperTrade() {
    const rec = {
      // eslint-disable-next-line react-hooks/purity -- runs in a click handler, not during render
      id: Date.now(), address: address || "Address not verified", county, unitCount,
      price, grossRent, piti: Math.round(piti.total),
      margin: isFinite(margin) ? Number(margin.toFixed(3)) : null,
      maxPrice: Math.round(maxPrice), rentSource, verdict, savedAt: new Date().toISOString().slice(0, 10),
    };
    const next = [rec, ...saved];
    setSaved(next);
    try {
      window.localStorage.setItem(STORE_KEY, JSON.stringify(next));
    } catch {
      setStorageOk(false);
    }
  }

  function remove(id) {
    const next = saved.filter((s) => s.id !== id);
    setSaved(next);
    try { window.localStorage.setItem(STORE_KEY, JSON.stringify(next)); } catch { setStorageOk(false); }
  }

  const pitiRows = [
    ["Principal & interest", piti.pi],
    ["Mortgage insurance", piti.mip],
    ["Property taxes", piti.tax],
    ["Hazard insurance", piti.ins],
    ...(a.hoaMonthly ? [["HOA", piti.hoa]] : []),
  ];
  const pitiMax = Math.max(...pitiRows.map((r) => r[1]), 1);

  return (
    <div style={{ background: T.navy, color: T.gray, fontFamily: FONT, minHeight: "100%", padding: "22px 18px 40px" }}>
      <div style={{ maxWidth: 1080, margin: "0 auto" }}>

        <div style={{ borderBottom: `1px solid ${T.slate}44`, paddingBottom: 14, marginBottom: 22 }}>
          <div style={{ fontSize: 19, fontWeight: 600, letterSpacing: "-0.01em" }}>
            PropOps8 BRRRR — acquisition screen
          </div>
          <div style={{ color: T.slate, fontSize: 12.5, marginTop: 4, maxWidth: 620, lineHeight: 1.5 }}>
            Preliminary internal screen. Not an FHA approval, not an appraisal, not a lender quote.
            Every figure below is derived from what you enter.
          </div>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))", gap: 34, alignItems: "start" }}>

          {/* ---------------- inputs ---------------- */}
          <div>
            <Rule label="Property" />
            <label style={{ display: "block", marginBottom: 14 }}>
              <div style={{ color: T.slate, fontSize: 12.5, marginBottom: 5 }}>Address</div>
              <input
                value={address} onChange={(e) => setAddress(e.target.value)}
                placeholder="Not verified"
                style={{ width: "100%", background: T.navyDeep, border: `1px solid ${T.slate}55`, borderRadius: 3,
                  color: T.gray, fontSize: 15, padding: 9, outline: "none", fontFamily: FONT, boxSizing: "border-box" }}
              />
            </label>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
              <label style={{ display: "block", marginBottom: 14 }}>
                <div style={{ color: T.slate, fontSize: 12.5, marginBottom: 5 }}>County</div>
                <select value={county} onChange={(e) => setCounty(e.target.value)}
                  style={{ width: "100%", background: T.navyDeep, border: `1px solid ${T.slate}55`, borderRadius: 3,
                    color: T.gray, fontSize: 14, padding: 9, outline: "none", fontFamily: FONT }}>
                  {["Kern", "Fresno", "San Bernardino", "Twentynine Palms", "Other"].map((c) => <option key={c}>{c}</option>)}
                </select>
              </label>
              <label style={{ display: "block", marginBottom: 14 }}>
                <div style={{ color: T.slate, fontSize: 12.5, marginBottom: 5 }}>Legal units</div>
                <select value={unitCount} onChange={(e) => setUnitCount(Number(e.target.value))}
                  style={{ width: "100%", background: T.navyDeep, border: `1px solid ${T.slate}55`, borderRadius: 3,
                    color: T.gray, fontSize: 14, padding: 9, outline: "none", fontFamily: FONT }}>
                  {[2, 3, 4].map((n) => <option key={n} value={n}>{n}</option>)}
                </select>
              </label>
            </div>

            <Field label="Asking price" value={price} onChange={setPrice} prefix="$" />

            <Rule label="Conservative rent per unit" />
            <div style={{ color: T.slate, fontSize: 11.5, marginTop: -6, marginBottom: 12, lineHeight: 1.5 }}>
              Appraiser-supportable, not seller-reported and not post-rehab. The screen uses this number only.
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
              {activeRents.map((r, i) => (
                <Field key={i} label={`Unit ${i + 1}`} value={r} prefix="$"
                  onChange={(v) => setRents((p) => p.map((x, j) => (j === i ? v : x)))} />
              ))}
            </div>

            <label style={{ display: "block", marginBottom: 14 }}>
              <div style={{ color: T.slate, fontSize: 12.5, marginBottom: 5 }}>Rent evidence</div>
              <select value={rentSource} onChange={(e) => setRentSource(e.target.value)}
                style={{ width: "100%", background: T.navyDeep, border: `1px solid ${T.slate}55`, borderRadius: 3,
                  color: T.gray, fontSize: 14, padding: 9, outline: "none", fontFamily: FONT }}>
                <option value="estimated">Estimated — no document</option>
                <option value="reported">Reported — seller or listing</option>
                <option value="verified">Verified — lease or rent roll</option>
              </select>
            </label>

            <Rule label="Verification gates" />
            {[
              ["Legal unit count confirmed with the county", unitsVerified, setUnitsVerified],
              ["Lender has reviewed this scenario", lenderVerified, setLenderVerified],
            ].map(([lab, val, fn]) => (
              <label key={lab} style={{ display: "flex", gap: 9, alignItems: "flex-start", marginBottom: 10, cursor: "pointer" }}>
                <input type="checkbox" checked={val} onChange={(e) => fn(e.target.checked)} style={{ marginTop: 2, accentColor: T.cyan }} />
                <span style={{ fontSize: 13, color: val ? T.gray : T.slate, lineHeight: 1.45 }}>{lab}</span>
              </label>
            ))}

            <button onClick={() => setShowAssumptions((s) => !s)}
              style={{ background: "none", border: "none", color: T.cyan, fontSize: 12.5, padding: "14px 0 0", cursor: "pointer", fontFamily: FONT }}>
              {showAssumptions ? "Hide" : "Show"} financing assumptions
            </button>

            {showAssumptions && (
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginTop: 14,
                padding: 14, background: T.navyDeep, borderRadius: 3, border: `1px solid ${T.slate}33` }}>
                <div style={{ gridColumn: "1 / -1", color: T.slate, fontSize: 11.5, lineHeight: 1.5 }}>
                  Planning values. Verify each against current HUD policy and a lender before any offer.
                </div>
                <Field label="Down payment" value={a.downPct} onChange={set("downPct")} suffix="%" />
                <Field label="Interest rate" value={a.ratePct} onChange={set("ratePct")} suffix="%" />
                <Field label="Term" value={a.termYears} onChange={set("termYears")} suffix="yr" />
                <Field label="Upfront MIP" value={a.ufmipPct} onChange={set("ufmipPct")} suffix="%" />
                <Field label="Annual MIP" value={a.annualMipPct} onChange={set("annualMipPct")} suffix="%" />
                <Field label="Tax rate" value={a.taxRatePct} onChange={set("taxRatePct")} suffix="%" />
                <Field label="Insurance" value={a.insuranceAnnual} onChange={set("insuranceAnnual")} prefix="$" suffix="/yr" />
                <Field label="HOA" value={a.hoaMonthly} onChange={set("hoaMonthly")} prefix="$" suffix="/mo" />
                <Field label="Coverage factor" value={a.coveragePct} onChange={set("coveragePct")} suffix="%" wide
                  hint="FHA deducts the greater of the appraiser's vacancy estimate or 25%." />
              </div>
            )}
          </div>

          {/* ---------------- results ---------------- */}
          <div>
            <Rule label="Preliminary self-sufficiency screen" />
            <MarginGauge margin={margin} band={band} applicable={applicable} />

            <div style={{ borderLeft: `2px solid ${verdictColor}`, paddingLeft: 12, margin: "18px 0 24px" }}>
              <div style={{ color: verdictColor, fontSize: 16, fontWeight: 600 }}>{verdict}</div>
              <div style={{ color: T.slate, fontSize: 12.5, marginTop: 5, lineHeight: 1.55 }}>{verdictNote}</div>
            </div>

            {applicable && (
              <div style={{ marginBottom: 26 }}>
                <div style={{ color: T.slate, fontSize: 12.5, marginBottom: 4 }}>Highest price that still clears the screen</div>
                <div style={{ fontSize: 38, fontWeight: 600, letterSpacing: "-0.02em", ...NUM,
                  color: maxPrice >= price ? T.cyan : T.magenta }}>
                  {usd(maxPrice)}
                </div>
                <div style={{ color: T.slate, fontSize: 12, marginTop: 4, ...NUM }}>
                  {maxPrice >= price
                    ? `${usd(maxPrice - price)} of headroom above asking`
                    : `${usd(price - maxPrice)} below asking — offer or walk`}
                </div>
              </div>
            )}

            <Rule label="Monthly housing expense" />
            <div style={{ marginBottom: 6 }}>
              {pitiRows.map(([label, v]) => (
                <div key={label} style={{ marginBottom: 9 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12.5, marginBottom: 3 }}>
                    <span style={{ color: T.slate }}>{label}</span>
                    <span style={NUM}>{usd(v)}</span>
                  </div>
                  <div style={{ height: 4, background: `${T.slate}33`, borderRadius: 2 }}>
                    <div style={{ height: 4, width: `${(v / pitiMax) * 100}%`, background: T.slate, borderRadius: 2 }} />
                  </div>
                </div>
              ))}
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 14,
                borderTop: `1px solid ${T.slate}44`, paddingTop: 9, marginTop: 12 }}>
                <span>Total PITI + MIP</span>
                <span style={{ fontWeight: 600, ...NUM }}>{usd(piti.total)}</span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, color: T.slate, marginTop: 7 }}>
                <span>Gross rent × {a.coveragePct}%</span>
                <span style={NUM}>{usd(qualifying)}</span>
              </div>
            </div>

            <Rule label="Rate sensitivity" />
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12.5, ...NUM }}>
              <thead>
                <tr style={{ color: T.slate, textAlign: "right" }}>
                  <th style={{ textAlign: "left", fontWeight: 400, paddingBottom: 7 }}>Rate</th>
                  <th style={{ fontWeight: 400, paddingBottom: 7 }}>PITI</th>
                  <th style={{ fontWeight: 400, paddingBottom: 7 }}>Ratio</th>
                  <th style={{ fontWeight: 400, paddingBottom: 7 }}>Max price</th>
                </tr>
              </thead>
              <tbody>
                {sensitivity.map((s) => {
                  const c = !applicable ? T.gray : s.margin >= 1.1 ? T.cyan : s.margin >= 1.0 ? T.gray : T.magenta;
                  return (
                    <tr key={s.rate} style={{ borderTop: `1px solid ${T.slate}2A` }}>
                      <td style={{ padding: "7px 0", color: s.rate === a.ratePct ? T.gray : T.slate }}>
                        {s.rate.toFixed(2)}%
                      </td>
                      <td style={{ textAlign: "right", color: T.slate }}>{usd(s.piti)}</td>
                      <td style={{ textAlign: "right", color: c }}>{applicable && isFinite(s.margin) ? s.margin.toFixed(2) : "—"}</td>
                      <td style={{ textAlign: "right", color: T.slate }}>{applicable ? usd(s.max) : "—"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>

            <button onClick={savePaperTrade}
              style={{ marginTop: 22, width: "100%", background: "transparent", border: `1px solid ${T.cyan}`,
                color: T.cyan, borderRadius: 3, padding: "11px", fontSize: 13.5, cursor: "pointer", fontFamily: FONT }}>
              Save paper trade
            </button>
            {!storageOk && (
              <div style={{ color: T.magenta, fontSize: 11.5, marginTop: 8 }}>
                Saved for this session only — browser storage is unavailable.
              </div>
            )}
          </div>
        </div>

        {/* ---------------- paper trades ---------------- */}
        <Rule label={`Paper trades (${saved.length})`} />
        {saved.length === 0 ? (
          <div style={{ color: T.slate, fontSize: 13, padding: "14px 0", lineHeight: 1.55 }}>
            Nothing recorded yet. Screen a real listing and save it. The portfolio builds from properties you
            actually looked at — not from generated rows.
          </div>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12.5, minWidth: 660, ...NUM }}>
              <thead>
                <tr style={{ color: T.slate, textAlign: "right" }}>
                  <th style={{ textAlign: "left", fontWeight: 400, padding: "0 0 7px" }}>Address</th>
                  <th style={{ textAlign: "left", fontWeight: 400, padding: "0 0 7px" }}>County</th>
                  <th style={{ fontWeight: 400, padding: "0 0 7px" }}>Units</th>
                  <th style={{ fontWeight: 400, padding: "0 0 7px" }}>Asking</th>
                  <th style={{ fontWeight: 400, padding: "0 0 7px" }}>Max</th>
                  <th style={{ fontWeight: 400, padding: "0 0 7px" }}>Ratio</th>
                  <th style={{ textAlign: "left", fontWeight: 400, padding: "0 0 7px 16px" }}>Verdict</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {saved.map((s) => {
                  const c = s.margin == null ? T.slate : s.margin >= 1.1 ? T.cyan : s.margin >= 1.0 ? T.gray : T.magenta;
                  return (
                    <tr key={s.id} style={{ borderTop: `1px solid ${T.slate}2A` }}>
                      <td style={{ padding: "9px 0", color: s.address.startsWith("Address not") ? T.slate : T.gray }}>{s.address}</td>
                      <td style={{ color: T.slate }}>{s.county}</td>
                      <td style={{ textAlign: "right", color: T.slate }}>{s.unitCount}</td>
                      <td style={{ textAlign: "right" }}>{usd(s.price)}</td>
                      <td style={{ textAlign: "right", color: T.slate }}>{usd(s.maxPrice)}</td>
                      <td style={{ textAlign: "right", color: c }}>{s.margin?.toFixed(2) ?? "—"}</td>
                      <td style={{ padding: "9px 0 9px 16px", color: c }}>{s.verdict}</td>
                      <td style={{ textAlign: "right" }}>
                        <button onClick={() => remove(s.id)}
                          style={{ background: "none", border: "none", color: T.slate, cursor: "pointer", fontSize: 16, padding: "0 0 0 10px", fontFamily: FONT }}>
                          ×
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        <div style={{ color: T.slate, fontSize: 11.5, marginTop: 30, paddingTop: 14,
          borderTop: `1px solid ${T.slate}33`, lineHeight: 1.6, maxWidth: 680 }}>
          Coverage factor, MIP rates and loan limits change. Confirm against the current HUD handbook and a
          lender before an offer. Self-sufficiency applies to 3- and 4-unit properties; 2-unit purchases are
          underwritten differently.
        </div>
      </div>
    </div>
  );
}

/* Two tools, one page: the FHA acquisition screen (1-4 units) and the
   Monte Carlo underwrite (5+ units). Tabs keep both mounted-on-demand. */
export default function BrrrrUnderwritingScreen() {
  const [mode, setMode] = useState("screen");
  const tabs = [["screen", "Screen · 1–4 units (FHA)"], ["simulate", "Simulate · 5+ units (Monte Carlo)"]];
  return (
    <div style={{ background: T.navy, minHeight: "100%" }}>
      <div role="tablist" aria-label="Underwriting tool" style={{ display: "flex", gap: 6, flexWrap: "wrap", maxWidth: 1080, margin: "0 auto", padding: "16px 18px 0" }}>
        {tabs.map(([id, label]) => (
          <button key={id} role="tab" aria-selected={mode === id} onClick={() => setMode(id)}
            style={{ background: mode === id ? T.cyan : "transparent", color: mode === id ? T.navy : T.gray, border: `1px solid ${mode === id ? T.cyan : T.slate + "66"}`,
              borderRadius: 3, padding: "9px 14px", fontSize: 13.5, fontWeight: 600, cursor: "pointer", fontFamily: FONT }}>
            {label}
          </button>
        ))}
      </div>
      {mode === "screen" ? <ScreenPanel /> : (
        <div style={{ color: T.gray, fontFamily: FONT, padding: "22px 18px 40px" }}>
          <div style={{ maxWidth: 1080, margin: "0 auto" }}>
            <div style={{ borderBottom: `1px solid ${T.slate}44`, paddingBottom: 14, marginBottom: 6 }}>
              <div style={{ fontSize: 19, fontWeight: 600, letterSpacing: "-0.01em" }}>AIM-B5R — simulation underwrite</div>
            </div>
            <SimulatePanel />
          </div>
        </div>
      )}
    </div>
  );
}
