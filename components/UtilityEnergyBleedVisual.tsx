/**
 * components/UtilityEnergyBleedVisual.tsx
 * ----------------------------------------------------------------
 * The reference image's six-building bar chart needs a portfolio of
 * buildings this page's two inputs (this month's bill, trailing
 * average) don't collect -- it's built for a single property's
 * variance against its own baseline. Shown as a horizontal meter so
 * it reads differently from the vertical bars used elsewhere on the
 * site, rather than every widget defaulting to the same shape.
 */
import { PALETTE, figureStyle, cardStyle, utilityLabel, hexA } from "@/lib/chaosTokens";

export default function UtilityEnergyBleedVisual({
  thisMonthBill,
  trailingAverage,
}: {
  thisMonthBill: number;
  trailingAverage: number;
}) {
  const hasData = trailingAverage > 0;
  const variancePct = hasData ? ((thisMonthBill - trailingAverage) / trailingAverage) * 100 : 0;
  const over = variancePct > 0;
  const color = over ? PALETTE.pink : PALETTE.mint;
  // Position of "this month" on a track centered on the average, clamped to view.
  const clamped = Math.max(-60, Math.min(60, variancePct));
  const markerPct = 50 + clamped / 2; // 50% = average, each side spans ±30pt visually

  return (
    <div style={{ ...cardStyle, padding: "28px 24px", marginTop: 20 }}>
      <div style={{ position: "relative", height: 52, margin: "0 8px" }}>
        <div
          style={{
            position: "absolute",
            top: "50%",
            left: 0,
            right: 0,
            height: 3,
            borderRadius: 2,
            background: hexA("#ffffff", 0.1),
            transform: "translateY(-50%)",
          }}
        />
        <div
          style={{
            position: "absolute",
            top: "50%",
            left: "50%",
            width: 2,
            height: 28,
            background: PALETTE.cyan,
            transform: "translate(-50%, -50%)",
          }}
        />
        <span
          style={{
            position: "absolute",
            top: 0,
            left: "50%",
            transform: "translateX(-50%)",
            ...utilityLabel,
            fontSize: 9.5,
          }}
        >
          trailing avg
        </span>
        {hasData && (
          <div
            style={{
              position: "absolute",
              top: "50%",
              left: `${markerPct}%`,
              width: 18,
              height: 18,
              borderRadius: "50%",
              background: color,
              border: `3px solid ${hexA(color, 0.3)}`,
              transform: "translate(-50%, -50%)",
              transition: "left 0.3s ease",
            }}
          />
        )}
      </div>

      <div style={{ textAlign: "center", marginTop: 18, paddingTop: 20, borderTop: `1px solid ${hexA("#ffffff", 0.08)}` }}>
        <div style={figureStyle(color)}>
          {hasData ? `${over ? "+" : ""}${variancePct.toFixed(1)}%` : "—"}
        </div>
        <div style={{ ...utilityLabel, marginTop: 6 }}>
          {hasData ? "Variance vs. trailing average" : "Enter your trailing average to see the variance"}
        </div>
      </div>

      <p style={{ color: PALETTE.body, fontSize: 14, lineHeight: 1.6, marginTop: 22, textAlign: "center" }}>
        A bill inside normal range doesn&apos;t need a story. One that doesn&apos;t — a leak, a rate change, a
        meter reading a vacant unit as occupied — usually does, and the bill by itself won&apos;t say which.
      </p>
    </div>
  );
}
