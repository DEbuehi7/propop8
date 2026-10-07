/**
 * components/VendorMoneyPitVisual.tsx
 * ----------------------------------------------------------------
 * The prototype for the "fuller illustrated" direction -- gauge +
 * side-by-side vendor comparison, replacing the plain big-number
 * result for this one widget specifically. If this reads right,
 * the other 6 get their own version of this treatment next
 * (Deadline Graveyard and Asset Health Nightmare are the two that
 * would reuse Gauge directly with almost no new code).
 */
import { PALETTE, figureStyle, cardStyle, utilityLabel, hexA } from "@/lib/chaosTokens";
import { Gauge } from "./Gauge";

export default function VendorMoneyPitVisual({
  totalSpend,
  topVendorSpend,
}: {
  totalSpend: number;
  topVendorSpend: number;
}) {
  const otherSpend = Math.max(0, totalSpend - topVendorSpend);
  const share = totalSpend > 0 ? (topVendorSpend / totalSpend) * 100 : 0;
  const isHighRisk = share >= 50;
  const color = isHighRisk ? PALETTE.pink : PALETTE.mint;

  return (
    <div style={{ ...cardStyle, padding: "32px 28px", marginTop: 20 }}>
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
        <Gauge value={share} color={color} size={220} />
        <div style={{ ...figureStyle(color), marginTop: -12 }}>
          {totalSpend > 0 ? `${share.toFixed(0)}%` : "—"}
        </div>
        <div style={{ ...utilityLabel, marginTop: 6 }}>
          {totalSpend === 0 ? "Enter spend to see concentration" : isHighRisk ? "High concentration" : "Within a healthy range"}
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
          <div style={{ color: PALETTE.pink, fontWeight: 800, fontSize: 21 }}>
            ${topVendorSpend.toLocaleString()}
          </div>
          <div style={{ color: PALETTE.label, fontSize: 11, marginTop: 4, letterSpacing: "0.05em" }}>
            TOP VENDOR
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
          <div style={{ color: PALETTE.cyan, fontWeight: 800, fontSize: 21 }}>
            ${otherSpend.toLocaleString()}
          </div>
          <div style={{ color: PALETTE.label, fontSize: 11, marginTop: 4, letterSpacing: "0.05em" }}>
            ALL OTHER VENDORS
          </div>
        </div>
      </div>

      <p style={{ color: PALETTE.body, fontSize: 14, lineHeight: 1.6, marginTop: 22, textAlign: "center" }}>
        Concentration isn&apos;t proof of overbilling. It&apos;s a reason to investigate pricing, SLAs, and
        dependency — a comparison quote either confirms you&apos;re fine or catches it before renewal.
      </p>
    </div>
  );
}
