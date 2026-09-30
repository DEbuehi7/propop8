/**
 * components/DeadlineGraveyardVisual.tsx
 * ----------------------------------------------------------------
 * Same underlying shape as VendorMoneyPitVisual -- a share of a
 * whole -- so it reuses Gauge directly rather than inventing a new
 * primitive. The reference image's four-quadrant grid (Overdue / Due
 * Today / Due This Week / Complete) needs data this page's two
 * inputs don't collect; showing those four boxes anyway would mean
 * inventing two numbers nobody entered. This shows exactly what's
 * asked for: total open, and the aged share of it.
 */
import { PALETTE, figureStyle, cardStyle, utilityLabel, hexA } from "@/lib/chaosTokens";
import { Gauge } from "./Gauge";

export default function DeadlineGraveyardVisual({
  totalOpen,
  agedPast30,
}: {
  totalOpen: number;
  agedPast30: number;
}) {
  const current = Math.max(0, totalOpen - agedPast30);
  const share = totalOpen > 0 ? (agedPast30 / totalOpen) * 100 : 0;
  // Threshold matches diagnosticCalculators.ts's own deadline-graveyard
  // calculate() (flags cost above 15%), not an independent judgment call.
  const isHighRisk = share > 15;
  const color = isHighRisk ? PALETTE.pink : PALETTE.mint;

  return (
    <div style={{ ...cardStyle, padding: "32px 28px", marginTop: 20 }}>
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
        <Gauge value={share} color={color} size={220} />
        <div style={{ ...figureStyle(color), marginTop: -12 }}>
          {totalOpen > 0 ? `${share.toFixed(0)}%` : "—"}
        </div>
        <div style={{ ...utilityLabel, marginTop: 6 }}>
          {totalOpen === 0 ? "Enter your numbers to see the aging share" : isHighRisk ? "High aging share" : "Within a healthy range"}
        </div>
      </div>

      <div style={{ display: "flex", gap: 14, marginTop: 30 }}>
        <div
          style={{
            flex: 1,
            background: hexA(PALETTE.pink, 0.08),
            border: `1px solid ${hexA(PALETTE.pink, 0.25)}`,
            borderRadius: 10,
            padding: "16px 12px",
            textAlign: "center",
          }}
        >
          <div style={{ color: PALETTE.pink, fontWeight: 800, fontSize: 21 }}>{agedPast30}</div>
          <div style={{ color: PALETTE.label, fontSize: 11, marginTop: 4, letterSpacing: "0.05em" }}>
            PAST 30 DAYS
          </div>
        </div>
        <div
          style={{
            flex: 1,
            background: hexA(PALETTE.cyan, 0.06),
            border: `1px solid ${hexA(PALETTE.cyan, 0.2)}`,
            borderRadius: 10,
            padding: "16px 12px",
            textAlign: "center",
          }}
        >
          <div style={{ color: PALETTE.cyan, fontWeight: 800, fontSize: 21 }}>{current}</div>
          <div style={{ color: PALETTE.label, fontSize: 11, marginTop: 4, letterSpacing: "0.05em" }}>
            STILL CURRENT
          </div>
        </div>
      </div>

      <p style={{ color: PALETTE.body, fontSize: 14, lineHeight: 1.6, marginTop: 22, textAlign: "center" }}>
        Nothing here looks like an emergency individually — that's usually how the aged share gets
        this large. A ticket that's been open 45 days doesn't announce itself the way a new one does.
      </p>
    </div>
  );
}
