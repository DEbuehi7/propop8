/**
 * lib/reportPdf.tsx
 * ----------------------------------------------------------------
 * The branded PDF. Runs in the browser via @react-pdf/renderer -- no
 * server function, no headless Chromium, nothing that can time out.
 *
 * Fonts and the logo load from /public by URL at render time, so they
 * have to be deployed, not just present locally.
 *
 * REBUILT FOR THE REVIEW-TRIGGER DOCTRINE. What changed and why:
 *
 * 1. The hero is a COUNT, not a dollar total. It previously printed
 *    report.recoveryTotal in 44pt pink above "identified annual
 *    recovery opportunity" -- the single least defensible element in
 *    the document, asserting both recoverability and an annual period
 *    from a file that establishes neither.
 *
 * 2. INSUFFICIENT BASELINE is printed wherever the engine says
 *    baselineUsable is false. The old table printed a calm 0% in
 *    exactly the cases where the arithmetic had broken down (a
 *    negative or absent baseline), which is worse than printing
 *    nothing.
 *
 * 3. The audit window and the baseline formula are printed on page 1.
 *    A variance figure with no stated baseline is not checkable, and
 *    an uncheckable number should not ship.
 *
 * 4. Every finding carries its claim type -- FACT / CALCULATION /
 *    INFERENCE / PREDICTION -- and its supporting source row count.
 *
 * 5. "RECOMMENDED FIX" is now "REVIEW NEXT". The old label implied
 *    the report had established a problem to fix. It hasn't; it has
 *    identified something a human should look at.
 *
 * 6. A limits page is appended, stating in the document itself what
 *    this schema cannot support. That page is not optional -- it is
 *    what makes the rest of the report safe to hand to an
 *    institutional operator.
 */
import { Document, Page, View, Text, Image, Font, StyleSheet, Svg, Path } from "@react-pdf/renderer";
import type { AuditReport } from "./reportTypes";
import { ENGINE_VERSION } from "./engineVersion";
import type { Finding, ClaimType } from "./auditEngine";

Font.register({
  family: "Inter",
  fonts: [
    { src: "/fonts/Inter-Regular.ttf", fontWeight: 400 },
    { src: "/fonts/Inter-SemiBold.ttf", fontWeight: 600 },
    { src: "/fonts/Inter-Bold.ttf", fontWeight: 700 },
  ],
});
Font.register({
  family: "JetBrains Mono",
  fonts: [
    { src: "/fonts/JetBrainsMono-Regular.ttf", fontWeight: 400 },
    { src: "/fonts/JetBrainsMono-Bold.ttf", fontWeight: 700 },
  ],
});
// Disable automatic word-hyphenation -- the default hyphenator was breaking
// "exposure" into "expo-/sure" in the narrow amount column.
Font.registerHyphenationCallback((word) => [word]);

const VOID = "#070b14";
const CARD = "#161f33";
const SHELL = "#0b1220";
const BRIGHT = "#f4f8ff";
const BODY = "#e6edf7";
const LABEL = "#7f8ea8";
const CYAN = "#22d3ee";
const PINK = "#ff2d6b";
const MINT = "#4ade80";
const AMBER = "#f5a524";
const TRACK = "#232f4a";

const CLAIM_COLOR: Record<ClaimType, string> = {
  FACT: MINT,
  CALCULATION: CYAN,
  INFERENCE: AMBER,
  PREDICTION: PINK,
};

const s = StyleSheet.create({
  page: {
    backgroundColor: VOID,
    color: BODY,
    fontFamily: "Inter",
    fontSize: 9.5,
    paddingTop: 90,
    paddingBottom: 40,
    paddingHorizontal: 46,
  },
  headerRow: {
    position: "absolute",
    top: 30,
    left: 46,
    right: 46,
    flexDirection: "row",
    alignItems: "center",
  },
  logo: { width: 56, height: 35, borderRadius: 3 },
  wordmarkBlock: { marginLeft: 12 },
  wordmark: { fontFamily: "Inter", fontWeight: 700, fontSize: 14, color: BRIGHT },
  wordmark8: { color: CYAN },
  tagline: { fontFamily: "JetBrains Mono", fontSize: 6.5, color: LABEL, marginTop: 2 },
  footerText: { fontFamily: "JetBrains Mono", fontSize: 6.5, color: LABEL },
  h1: { fontFamily: "Inter", fontWeight: 700, fontSize: 18, color: BRIGHT, lineHeight: 1.2 },
  h2: { fontFamily: "Inter", fontWeight: 600, fontSize: 11, color: BRIGHT },
  label: { fontFamily: "JetBrains Mono", fontSize: 7.5, color: LABEL },
  subbody: { fontFamily: "Inter", fontSize: 8.5, color: LABEL, lineHeight: 1.4 },
  body: { fontFamily: "Inter", fontSize: 9, color: BODY, lineHeight: 1.5 },

  // ---- provenance strip -------------------------------------------------
  windowBox: {
    backgroundColor: SHELL,
    borderRadius: 4,
    padding: 10,
    marginTop: 10,
  },
  windowLine: { fontFamily: "JetBrains Mono", fontSize: 7, color: LABEL, lineHeight: 1.6 },

  // ---- hero: a count, never a dollar total ------------------------------
  heroNum: { fontFamily: "Inter", fontWeight: 700, fontSize: 44, color: BRIGHT },
  heroLabel: { fontFamily: "Inter", fontWeight: 600, fontSize: 11, color: CYAN, letterSpacing: 1 },
  heroNote: { fontFamily: "JetBrains Mono", fontSize: 7.5, color: LABEL, marginTop: 3 },

  statRow: { flexDirection: "row", marginTop: 16 },
  stat: { flex: 1, backgroundColor: CARD, borderRadius: 4, padding: 9, marginRight: 8 },
  statLast: { flex: 1, backgroundColor: CARD, borderRadius: 4, padding: 9 },
  statNum: { fontFamily: "Inter", fontWeight: 700, fontSize: 12, color: BRIGHT },
  statLabel: { fontFamily: "JetBrains Mono", fontSize: 5.8, color: LABEL, marginTop: 3, letterSpacing: 0.4 },

  table: { marginTop: 8, borderRadius: 4, overflow: "hidden" },
  tableHeadRow: { flexDirection: "row", backgroundColor: SHELL, paddingVertical: 6, paddingHorizontal: 10 },
  tableRow: { flexDirection: "row", backgroundColor: CARD, paddingVertical: 7, paddingHorizontal: 10, borderTopWidth: 0.5, borderTopColor: VOID },
  tableHeadCell: { fontFamily: "JetBrains Mono", fontWeight: 700, fontSize: 6.5, color: BRIGHT },
  tableCell: { fontFamily: "Inter", fontSize: 8.5, color: BODY },
  insufficient: { fontFamily: "JetBrains Mono", fontSize: 6.5, color: AMBER, textAlign: "right" },

  card: { backgroundColor: CARD, borderRadius: 4, marginBottom: 4, flexDirection: "row" },
  cardAccent: { width: 3 },
  cardBody: { flex: 1, padding: 12 },
  cardAmountBlock: { width: 120, padding: 12, alignItems: "flex-end", justifyContent: "flex-start" },
  amountPink: { fontFamily: "Inter", fontWeight: 700, fontSize: 13, color: PINK, textAlign: "right" },
  amountMint: { fontFamily: "Inter", fontWeight: 700, fontSize: 13, color: MINT, textAlign: "right" },
  amountLabel: { fontFamily: "JetBrains Mono", fontSize: 6, color: LABEL, textAlign: "right", marginTop: 2 },
  claimChip: { fontFamily: "JetBrains Mono", fontWeight: 700, fontSize: 5.8, letterSpacing: 0.6 },
  provenance: { fontFamily: "JetBrains Mono", fontSize: 6, color: LABEL, marginTop: 6 },

  visualBlock: { alignItems: "center", marginTop: 2, marginBottom: 12, backgroundColor: SHELL, borderRadius: 4, paddingVertical: 14, paddingHorizontal: 12 },
  visualPct: { fontFamily: "Inter", fontWeight: 700, fontSize: 17, color: BRIGHT, marginTop: -26 },
  visualCaption: { fontFamily: "JetBrains Mono", fontSize: 6.5, letterSpacing: 1, color: LABEL, marginTop: 4, marginBottom: 10 },
  visualBoxRow: { flexDirection: "row", width: "100%" },
  visualBox: { flex: 1, borderRadius: 4, paddingVertical: 8, paddingHorizontal: 6, alignItems: "center", marginRight: 8 },
  visualBoxLast: { flex: 1, borderRadius: 4, paddingVertical: 8, paddingHorizontal: 6, alignItems: "center" },
  visualBoxNum: { fontFamily: "Inter", fontWeight: 700, fontSize: 12 },
  visualBoxLabel: { fontFamily: "JetBrains Mono", fontSize: 6, letterSpacing: 0.4, color: LABEL, marginTop: 3 },

  limitCol: { marginTop: 10 },
  limitItem: { fontFamily: "Inter", fontSize: 8.5, color: BODY, lineHeight: 1.6, marginBottom: 3 },
  claimDefRow: { flexDirection: "row", marginBottom: 5 },
  claimDefTerm: { width: 74, fontFamily: "JetBrains Mono", fontWeight: 700, fontSize: 7 },
  claimDefBody: { flex: 1, fontFamily: "Inter", fontSize: 8.5, color: LABEL, lineHeight: 1.4 },
});

function colw(pct: number) {
  return { width: `${pct}%` } as const;
}

function money(v: number): string {
  return `$${Math.round(v).toLocaleString()}`;
}

function Header() {
  return (
    <View style={s.headerRow} fixed>
      <Image src="/assets/propops8-mark.png" style={s.logo} />
      <View style={s.wordmarkBlock}>
        <Text style={s.wordmark}>
          PROPOPS<Text style={s.wordmark8}>8</Text>
        </Text>
        <Text style={s.tagline}>PROPERTY OPERATIONS INTELLIGENCE</Text>
      </View>
    </View>
  );
}

/** Port of components/Gauge.tsx's arc math. Drawn with a single
 *  strokeDasharray sized to the filled portion rather than the web
 *  version's dasharray+dashoffset pair, because @react-pdf/renderer's
 *  <Path> type doesn't expose strokeDashoffset. Same shape. */
function PdfGauge({ value, color }: { value: number; color: string }) {
  const size = 110;
  const strokeWidth = 10;
  const r = (size - strokeWidth) / 2;
  const cx = size / 2;
  const cy = size / 2;
  const d = `M ${cx - r} ${cy} A ${r} ${r} 0 0 1 ${cx + r} ${cy}`;
  const arcLength = Math.PI * r;
  const clamped = Math.max(0, Math.min(100, value));
  const filled = arcLength * (clamped / 100);
  const viewH = size / 2 + strokeWidth;

  return (
    <Svg width={size} height={viewH} viewBox={`0 0 ${size} ${viewH}`}>
      <Path d={d} stroke={TRACK} strokeWidth={strokeWidth} fill="none" strokeLinecap="round" />
      <Path
        d={d}
        stroke={color}
        strokeWidth={strokeWidth}
        fill="none"
        strokeLinecap="round"
        strokeDasharray={`${filled} ${arcLength}`}
      />
    </Svg>
  );
}

function FindingVisual({ visual }: { visual: NonNullable<Finding["visual"]> }) {
  if (visual.kind === "concentration") {
    const other = Math.max(0, visual.totalSpend - visual.topSpend);
    const color = visual.sharePct >= 50 ? PINK : MINT;
    return (
      <View style={s.visualBlock}>
        <PdfGauge value={visual.sharePct} color={color} />
        <Text style={s.visualPct}>{visual.sharePct.toFixed(1)}%</Text>
        <Text style={s.visualCaption}>SHARE OF CATEGORY SPEND</Text>
        <View style={s.visualBoxRow}>
          <View style={[s.visualBox, { backgroundColor: "rgba(255,45,107,0.08)" }]}>
            <Text style={[s.visualBoxNum, { color: PINK }]}>{money(visual.topSpend)}</Text>
            <Text style={s.visualBoxLabel}>TOP VENDOR</Text>
          </View>
          <View style={[s.visualBoxLast, { backgroundColor: "rgba(74,222,128,0.08)" }]}>
            <Text style={[s.visualBoxNum, { color: MINT }]}>{money(other)}</Text>
            <Text style={s.visualBoxLabel}>ALL OTHER VENDORS</Text>
          </View>
        </View>
      </View>
    );
  }

  const current = Math.max(0, visual.totalOpen - visual.agedCount);
  const share = visual.totalOpen > 0 ? (visual.agedCount / visual.totalOpen) * 100 : 0;
  const color = share > 15 ? PINK : MINT;
  return (
    <View style={s.visualBlock}>
      <PdfGauge value={share} color={color} />
      <Text style={s.visualPct}>{share.toFixed(0)}%</Text>
      <Text style={s.visualCaption}>OF OPEN ITEMS ARE AGED</Text>
      <View style={s.visualBoxRow}>
        <View style={[s.visualBox, { backgroundColor: "rgba(255,45,107,0.08)" }]}>
          <Text style={[s.visualBoxNum, { color: PINK }]}>{visual.agedCount}</Text>
          <Text style={s.visualBoxLabel}>OPEN &gt;30 DAYS</Text>
        </View>
        <View style={[s.visualBoxLast, { backgroundColor: "rgba(74,222,128,0.08)" }]}>
          <Text style={[s.visualBoxNum, { color: MINT }]}>{current}</Text>
          <Text style={s.visualBoxLabel}>WITHIN 30 DAYS</Text>
        </View>
      </View>
    </View>
  );
}

const CAN_SUPPORT = [
  "Vendor and category totals and concentration",
  "Monthly category comparison against this file's own prior months",
  "Exact duplicate candidates from identical ledger keys",
  "Near-duplicate and split-charge candidates for human verification",
  "Credits and reversals",
  "Open-item aging, when status and opened-date are supplied",
];

const CANNOT_SUPPORT = [
  "Fraud, overbilling, or vendor misconduct",
  "Recoverable savings, or an annual recovery figure",
  "Work-order callbacks or repeated repair failures",
  "Building-system root cause",
  "Vacancy causality or leasing bottlenecks",
  "Spend per unit, unless a unit count is supplied separately",
  "Habitability, compliance, tenant risk, or any legal conclusion",
];

const CLAIM_DEFS: Array<[ClaimType, string]> = [
  ["FACT", "Directly present in the source file."],
  ["CALCULATION", "Deterministic arithmetic from source fields; the formula is reproducible."],
  ["INFERENCE", "A review interpretation that may have more than one explanation."],
  ["PREDICTION", "A forward-looking estimate. Not used unless explicitly labelled."],
];

export function AuditPdf({ report }: { report: AuditReport }) {
  const included = report.findings.filter((f) => f.include);
  const w = report.window;

  return (
    <Document>
      {/* ------------------------------------------------------- page 1 */}
      <Page size="LETTER" style={s.page}>
        <Header />

        <Text style={s.h1}>LEDGER REVIEW</Text>
        <Text style={{ ...s.h2, marginTop: 8 }}>{report.propertyName}</Text>
        <Text style={{ ...s.subbody, marginTop: 2 }}>
          Prepared for {report.clientName} · {report.reportDate}
        </Text>

        {/* Window + baseline formula. A variance with no stated baseline
            isn't checkable, so this block is not optional. */}
        <View style={s.windowBox}>
          <Text style={s.windowLine}>
            DATA WINDOW: {w ? `${w.firstDate} through ${w.lastDate}` : "no parseable dates in file"}
          </Text>
          <Text style={s.windowLine}>
            ANALYSIS MONTH: {w ? w.latestMonth : "—"}   |   BASELINE: {w ? w.baselineFormula : "—"}
          </Text>
          {w?.partialMonthExcluded ? (
            <Text style={{ ...s.windowLine, color: AMBER }}>
              EXCLUDED: {w.partialMonthExcluded} — partial month, file ends {w.lastDate}
            </Text>
          ) : null}
          <Text style={s.windowLine}>
            INPUT SCHEMA: date, vendor, category, amount; optional status, opened_date
          </Text>
        </View>

        <Text style={{ ...s.heroNum, marginTop: 20 }}>{report.triggerCount}</Text>
        <Text style={s.heroLabel}>{report.triggerLabel}</Text>
        <Text style={s.heroNote}>{report.triggerNote}</Text>

        <View style={s.statRow}>
          <View style={s.stat}>
            <Text style={s.statNum}>{report.rowsReviewed.toLocaleString()}</Text>
            <Text style={s.statLabel}>
              {report.droppedRows && report.droppedRows > 0
                ? `ROWS REVIEWED (${report.droppedRows.toLocaleString()} SKIPPED)`
                : "ROWS REVIEWED"}
            </Text>
          </View>
          <View style={s.stat}>
            <Text style={s.statNum}>{report.netLedger}</Text>
            <Text style={s.statLabel}>NET LEDGER</Text>
          </View>
          <View style={s.statLast}>
            <Text style={s.statNum}>{report.spendTable.length}</Text>
            <Text style={s.statLabel}>CATEGORIES</Text>
          </View>
        </View>

        {report.summary ? <Text style={{ ...s.body, marginTop: 14 }}>{report.summary}</Text> : null}

        {report.spendTable.length > 0 && (
          <View style={s.table}>
            <View style={s.tableHeadRow}>
              <Text style={{ ...s.tableHeadCell, ...colw(34) }}>CATEGORY</Text>
              <Text style={{ ...s.tableHeadCell, ...colw(22) }}>LATEST MONTH</Text>
              <Text style={{ ...s.tableHeadCell, ...colw(22) }}>BASELINE MEAN</Text>
              <Text style={{ ...s.tableHeadCell, ...colw(22), textAlign: "right" }}>VARIANCE</Text>
            </View>
            {report.spendTable.map((row, i) => (
              <View key={i} style={s.tableRow}>
                <Text style={{ ...s.tableCell, ...colw(34) }}>{row.category}</Text>
                <Text style={{ ...s.tableCell, ...colw(22) }}>{row.thisPeriod}</Text>
                <Text style={{ ...s.tableCell, ...colw(22) }}>{row.baseline}</Text>
                {/* The engine says when a baseline can't anchor a percentage.
                    Printing 0% there -- as the old version did -- hid the
                    exact cases where the arithmetic had broken down. */}
                {row.baselineUsable ? (
                  <Text
                    style={{
                      ...(row.variancePct > 0 ? s.amountPink : s.amountMint),
                      fontSize: 9.5,
                      ...colw(22),
                    }}
                  >
                    {row.variancePct > 0 ? "+" : ""}
                    {row.variancePct}%
                  </Text>
                ) : (
                  <Text style={{ ...s.insufficient, ...colw(22) }}>INSUFFICIENT{"\n"}BASELINE</Text>
                )}
              </View>
            ))}
          </View>
        )}

        <Text style={{ ...s.subbody, marginTop: 10 }}>
          Variance is a review trigger, not a recoverable-dollar claim. One-time capital work,
          seasonality, credits, scope changes and coding changes all move a category without
          indicating waste. No claim of fraud, overbilling, savings, habitability, compliance
          failure or vendor fault is made from this ledger alone.
        </Text>

        <Text style={s.footerText} fixed>
          PROPOPS8 // LEDGER REVIEW // CONFIDENTIAL // ENGINE v{ENGINE_VERSION}
        </Text>
      </Page>

      {/* ------------------------------------------------------- page 2 */}
      <Page size="LETTER" style={s.page} wrap>
        <Header />

        <Text style={s.h1}>REVIEW TRIGGERS</Text>
        <View style={{ marginTop: 14 }}>
          {included.map((f, i) => (
            <View key={f.id} wrap={false} style={{ marginBottom: 10 }}>
              <View style={s.card}>
                <View style={{ ...s.cardAccent, backgroundColor: f.amountIsCost ? PINK : MINT }} />
                <View style={s.cardBody}>
                  <View style={{ flexDirection: "row", alignItems: "center" }}>
                    <Text style={s.label}>
                      {String(i + 1).padStart(2, "0")}   {f.category.toUpperCase()}
                    </Text>
                    <Text style={{ ...s.claimChip, color: CLAIM_COLOR[f.claimType], marginLeft: 8 }}>
                      [{f.claimType}]
                    </Text>
                  </View>
                  <Text style={{ ...s.h2, marginTop: 4 }}>{f.title}</Text>
                  <Text style={{ ...s.subbody, marginTop: 4 }}>{f.description}</Text>
                  {f.recommendation ? (
                    <Text style={{ ...s.subbody, marginTop: 5 }}>
                      <Text style={{ color: CYAN }}>REVIEW NEXT — </Text>
                      {f.recommendation}
                    </Text>
                  ) : null}
                  {f.sourceRows?.length ? (
                    <Text style={s.provenance}>
                      SUPPORTED BY {f.sourceRows.length} SOURCE ROW(S)
                    </Text>
                  ) : null}
                </View>
                <View style={s.cardAmountBlock}>
                  <Text style={f.amountIsCost ? s.amountPink : s.amountMint}>{f.amount}</Text>
                  <Text style={s.amountLabel}>{f.amountLabel}</Text>
                </View>
              </View>
              {f.visual && <FindingVisual visual={f.visual} />}
            </View>
          ))}
        </View>

        <Text
          style={s.footerText}
          fixed
          render={({ pageNumber }) => `PROPOPS8 // LEDGER REVIEW // CONFIDENTIAL // ENGINE v${ENGINE_VERSION}     Page ${pageNumber}`}
        />
      </Page>

      {/* ------------------------------------------------------- page 3 */}
      <Page size="LETTER" style={s.page}>
        <Header />

        <Text style={s.h1}>METHOD, CLAIM TYPES & LIMITS</Text>

        <Text style={{ ...s.h2, marginTop: 16 }}>What this ledger review can support</Text>
        <View style={s.limitCol}>
          {CAN_SUPPORT.map((t) => (
            <Text key={t} style={s.limitItem}>
              <Text style={{ color: MINT }}>· </Text>
              {t}
            </Text>
          ))}
        </View>

        <Text style={{ ...s.h2, marginTop: 16 }}>What it cannot support from this schema alone</Text>
        <View style={s.limitCol}>
          {CANNOT_SUPPORT.map((t) => (
            <Text key={t} style={s.limitItem}>
              <Text style={{ color: PINK }}>· </Text>
              {t}
            </Text>
          ))}
        </View>

        <Text style={{ ...s.h2, marginTop: 16 }}>Claim labels</Text>
        <View style={s.limitCol}>
          {CLAIM_DEFS.map(([term, def]) => (
            <View key={term} style={s.claimDefRow}>
              <Text style={{ ...s.claimDefTerm, color: CLAIM_COLOR[term] }}>{term}</Text>
              <Text style={s.claimDefBody}>{def}</Text>
            </View>
          ))}
        </View>

        <Text style={{ ...s.subbody, marginTop: 18 }}>
          Every finding in this report was reviewed by a person before delivery. Duplicate
          candidates remain candidates until invoice or job documentation is checked, and are
          never converted into credits on the strength of a ledger match alone.
        </Text>

        <Text
          style={s.footerText}
          fixed
          render={({ pageNumber }) => `PROPOPS8 // LEDGER REVIEW // CONFIDENTIAL // ENGINE v${ENGINE_VERSION}     Page ${pageNumber}`}
        />
      </Page>
    </Document>
  );
}
