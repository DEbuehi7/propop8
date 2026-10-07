/**
 * components/OperationsChaosIndexVisual.tsx
 * ----------------------------------------------------------------
 * The reference image's 73/100 "chaos score" is a composite of
 * several weighted factors (vacancy %, maintenance %, vendor delays
 * %) -- this page's actual inputs are just an issue count and an
 * average cost. Inventing a 0-100 score from two numbers that were
 * never weighted against anything would be exactly the kind of
 * unsupported figure the audit report itself is careful never to
 * show. This instead visualizes the real math -- count x average --
 * as blocks accumulating to the total, which is what was asked and
 * nothing more.
 */
import { PALETTE, figureStyle, cardStyle, utilityLabel, hexA } from "@/lib/chaosTokens";

const MAX_BLOCKS = 30;

export default function OperationsChaosIndexVisual({
  issueCount,
  avgCostPerIssue,
}: {
  issueCount: number;
  avgCostPerIssue: number;
}) {
  const total = issueCount * avgCostPerIssue;
  const shown = Math.min(issueCount, MAX_BLOCKS);
  const overflow = Math.max(0, issueCount - MAX_BLOCKS);

  return (
    <div style={{ ...cardStyle, padding: "28px 24px", marginTop: 20 }}>
      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          gap: 6,
          justifyContent: "center",
          minHeight: 32,
        }}
      >
        {issueCount === 0 ? (
          <span style={{ ...utilityLabel, fontSize: 11 }}>Enter your numbers to see them add up</span>
        ) : (
          Array.from({ length: shown }).map((_, i) => (
            <span
              key={i}
              title={`Issue ${i + 1}`}
              style={{
                width: 16,
                height: 16,
                borderRadius: 3,
                background: hexA(PALETTE.pink, 0.65),
              }}
            />
          ))
        )}
        {overflow > 0 && (
          <span style={{ ...utilityLabel, fontSize: 10, alignSelf: "center", marginLeft: 4 }}>
            +{overflow} more
          </span>
        )}
      </div>

      <div style={{ textAlign: "center", marginTop: 22, paddingTop: 20, borderTop: `1px solid ${hexA("#ffffff", 0.08)}` }}>
        <div style={figureStyle(PALETTE.pink)}>{total > 0 ? `$${Math.round(total).toLocaleString()}` : "—"}</div>
        <div style={{ ...utilityLabel, marginTop: 6 }}>
          {issueCount > 0
            ? `${issueCount} issues logged this quarter, ~$${avgCostPerIssue.toLocaleString()} each`
            : "Separate small issues, added up"}
        </div>
      </div>

      <p style={{ color: PALETTE.body, fontSize: 14, lineHeight: 1.6, marginTop: 22, textAlign: "center" }}>
        None of these individually looked worth escalating. That&apos;s the pattern — nothing here is a
        single finding, it&apos;s what happens when nobody adds the small ones together.
      </p>
    </div>
  );
}
