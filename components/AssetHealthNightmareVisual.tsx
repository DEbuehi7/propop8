/**
 * components/AssetHealthNightmareVisual.tsx
 * ----------------------------------------------------------------
 * The reference image's multi-property risk matrix needs several
 * properties' worth of data this page's two inputs (spend a year
 * ago, spend this month) don't collect. This shows the actual shape
 * of what's asked for -- a trend between two points in time -- as a
 * simple two-bar comparison rather than inventing a portfolio that
 * was never entered.
 */
import { PALETTE, figureStyle, cardStyle, utilityLabel, hexA } from "@/lib/chaosTokens";

export default function AssetHealthNightmareVisual({
  spendLastYear,
  spendThisMonth,
}: {
  spendLastYear: number;
  spendThisMonth: number;
}) {
  const hasData = spendLastYear > 0;
  const changePct = hasData ? ((spendThisMonth - spendLastYear) / spendLastYear) * 100 : 0;
  const rising = changePct > 0;
  const color = rising ? PALETTE.pink : PALETTE.mint;
  const maxVal = Math.max(spendLastYear, spendThisMonth, 1);
  const barHeight = (v: number) => `${Math.max(6, (v / maxVal) * 100)}%`;

  return (
    <div style={{ ...cardStyle, padding: "28px 24px", marginTop: 20 }}>
      <div
        style={{
          display: "flex",
          alignItems: "flex-end",
          justifyContent: "center",
          gap: 28,
          height: 140,
          padding: "0 20px",
        }}
      >
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", height: "100%", justifyContent: "flex-end" }}>
          <div
            style={{
              width: 56,
              height: barHeight(spendLastYear),
              borderRadius: "6px 6px 0 0",
              background: hexA(PALETTE.cyan, 0.55),
            }}
          />
          <span style={{ ...utilityLabel, marginTop: 8, fontSize: 10 }}>12 mo ago</span>
        </div>
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", height: "100%", justifyContent: "flex-end" }}>
          <div
            style={{
              width: 56,
              height: barHeight(spendThisMonth),
              borderRadius: "6px 6px 0 0",
              background: hexA(color, 0.75),
            }}
          />
          <span style={{ ...utilityLabel, marginTop: 8, fontSize: 10 }}>This month</span>
        </div>
      </div>

      <div style={{ textAlign: "center", marginTop: 22, paddingTop: 20, borderTop: `1px solid ${hexA("#ffffff", 0.08)}` }}>
        <div style={figureStyle(color)}>
          {hasData ? `${rising ? "+" : ""}${changePct.toFixed(0)}%` : "—"}
        </div>
        <div style={{ ...utilityLabel, marginTop: 6 }}>
          {hasData ? "Change vs. 12 months ago" : "Enter last year's spend to see the trend"}
        </div>
      </div>

      <p style={{ color: PALETTE.body, fontSize: 14, lineHeight: 1.6, marginTop: 22, textAlign: "center" }}>
        A property rarely becomes expensive overnight. Two points in time only show that something
        moved — the work orders in between show what actually happened.
      </p>
    </div>
  );
}
