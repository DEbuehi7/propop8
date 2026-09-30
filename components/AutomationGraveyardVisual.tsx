/**
 * components/AutomationGraveyardVisual.tsx
 * ----------------------------------------------------------------
 * A row of expected checkpoints, not a pipeline diagram -- the two
 * real inputs (frequency, days since last confirmed run) describe a
 * cadence, not a sequence of named stages, so this shows exactly
 * that: dots at every point a run should have happened, with the
 * ones past "now" (days since) marked as missed.
 */
import { PALETTE, figureStyle, cardStyle, utilityLabel, hexA } from "@/lib/chaosTokens";

const MAX_DOTS = 12;

export default function AutomationGraveyardVisual({
  frequency,
  daysSince,
}: {
  frequency: number;
  daysSince: number;
}) {
  const hasData = frequency > 0;
  const expectedRuns = hasData ? Math.max(1, Math.round(daysSince / frequency)) : 0;
  const missed = hasData ? Math.max(0, Math.floor(daysSince / frequency) - 1) : 0;
  const shown = Math.min(expectedRuns, MAX_DOTS);
  const overflow = Math.max(0, expectedRuns - MAX_DOTS);

  return (
    <div style={{ ...cardStyle, padding: "28px 24px", marginTop: 20 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", justifyContent: "center" }}>
        {hasData ? (
          Array.from({ length: shown }).map((_, i) => {
            const checkpointDay = (i + 1) * frequency;
            const isMissed = checkpointDay < daysSince;
            return (
              <div key={i} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 4 }}>
                <span
                  style={{
                    width: 14,
                    height: 14,
                    borderRadius: "50%",
                    background: isMissed ? hexA(PALETTE.pink, 0.75) : hexA(PALETTE.mint, 0.7),
                  }}
                />
                {i === shown - 1 && (
                  <span style={{ fontSize: 9, color: PALETTE.label, whiteSpace: "nowrap" }}>now</span>
                )}
              </div>
            );
          })
        ) : (
          <span style={{ ...utilityLabel, fontSize: 11 }}>Enter your numbers to see the checkpoints</span>
        )}
        {overflow > 0 && (
          <span style={{ ...utilityLabel, fontSize: 10 }}>+{overflow} more</span>
        )}
      </div>

      <div style={{ textAlign: "center", marginTop: 22, paddingTop: 20, borderTop: `1px solid ${hexA("#ffffff", 0.08)}` }}>
        <div style={figureStyle(missed > 0 ? PALETTE.pink : PALETTE.mint)}>{hasData ? missed : "—"}</div>
        <div style={{ ...utilityLabel, marginTop: 6 }}>
          {hasData ? "Run(s) likely missed" : "Missed runs, once you enter both numbers"}
        </div>
      </div>

      <p style={{ color: PALETTE.body, fontSize: 14, lineHeight: 1.6, marginTop: 22, textAlign: "center" }}>
        Auto-late-fees, a maintenance routing rule, a smart-thermostat shutoff on a vacant unit —
        most of these fail silently. A dashboard that still says "active" is checking that the
        automation exists, not that it ran.
      </p>
    </div>
  );
}
