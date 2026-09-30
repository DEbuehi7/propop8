/**
 * components/CallbackNightmareVisual.tsx
 * ----------------------------------------------------------------
 * The three ticket cards are illustrative -- there's no per-ticket
 * data in a "total closed / total reopened" input pair, only an
 * aggregate. They show the SHAPE of what a callback looks like
 * (closed, closed, reopened) so the number below means something at
 * a glance, not a claim that these are the visitor's actual tickets.
 */
import { PALETTE, cardStyle, figureStyle, utilityLabel, hexA } from "@/lib/chaosTokens";

const SAMPLE_TICKETS = [
  { id: "WO-1042", issue: "HVAC — no cooling", status: "Closed", tone: "ok" as const },
  { id: "WO-1068", issue: "HVAC — no cooling (recurring)", status: "Closed", tone: "warn" as const },
  { id: "WO-1105", issue: "HVAC — no cooling (again)", status: "Reopened", tone: "flag" as const },
];

const TONE_COLOR = { ok: PALETTE.mint, warn: "#f5a524", flag: PALETTE.pink };

export default function CallbackNightmareVisual({
  totalWorkOrders,
  reopenedWithin30,
}: {
  totalWorkOrders: number;
  reopenedWithin30: number;
}) {
  const rate = totalWorkOrders > 0 ? (reopenedWithin30 / totalWorkOrders) * 100 : 0;
  // Threshold matches lib/diagnosticCalculators.ts's own callback-nightmare
  // calculate() ("Above roughly 5%..."), not an independent judgment call.
  const color = rate > 5 ? PALETTE.pink : PALETTE.mint;

  return (
    <div style={{ ...cardStyle, padding: "28px 24px", marginTop: 20 }}>
      <div style={{ ...utilityLabel, marginBottom: 14, textAlign: "center" }}>
        What a callback looks like
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {SAMPLE_TICKETS.map((t) => (
          <div
            key={t.id}
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: 12,
              padding: "10px 14px",
              borderRadius: 8,
              border: `1px solid ${hexA(TONE_COLOR[t.tone], 0.3)}`,
              background: hexA(TONE_COLOR[t.tone], 0.06),
            }}
          >
            <div style={{ display: "flex", flexDirection: "column" }}>
              <span style={{ fontFamily: "monospace", fontSize: 11, color: PALETTE.label }}>{t.id}</span>
              <span style={{ fontSize: 13.5, color: PALETTE.body, marginTop: 2 }}>{t.issue}</span>
            </div>
            <span
              style={{
                fontFamily: "monospace",
                fontSize: 10.5,
                letterSpacing: "0.08em",
                textTransform: "uppercase",
                color: TONE_COLOR[t.tone],
                whiteSpace: "nowrap",
              }}
            >
              {t.status}
            </span>
          </div>
        ))}
      </div>
      <div style={{ textAlign: "center", fontSize: 10.5, color: PALETTE.label, marginTop: 8, fontStyle: "italic" }}>
        Illustrative pattern — not your actual tickets
      </div>

      <div style={{ textAlign: "center", marginTop: 26, paddingTop: 22, borderTop: `1px solid ${hexA("#ffffff", 0.08)}` }}>
        <div style={figureStyle(color)}>
          {totalWorkOrders > 0 ? `${rate.toFixed(1)}%` : "—"}
        </div>
        <div style={{ ...utilityLabel, marginTop: 6 }}>
          {totalWorkOrders === 0
            ? "Enter your numbers to see the rate"
            : `${reopenedWithin30} of ${totalWorkOrders} work orders reopened within 30 days`}
        </div>
      </div>

      <p style={{ color: PALETTE.body, fontSize: 14, lineHeight: 1.6, marginTop: 22, textAlign: "center" }}>
        A reopened ticket doesn't prove the original fix failed — a delivery, a resident schedule
        conflict, a second unrelated issue can all look identical here. It's a reason to check the
        pattern, not a verdict on any one repair.
      </p>
    </div>
  );
}
