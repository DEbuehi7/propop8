"use client";

/**
 * components/DiagnosticCalculatorClient.tsx
 * ----------------------------------------------------------------
 * UPDATED: every slug now gets its own bespoke visual instead of the
 * generic single-number result, matching the vendor-money-pit pattern.
 *
 * The values.xxx keys below (values.closed, values.reopened, etc.) are
 * checked directly against lib/diagnosticCalculators.ts's own `inputs`
 * arrays -- not guessed from the visible labels. Each visual's internal
 * cost/healthy threshold is likewise matched to that file's calculate()
 * logic (e.g. callback-nightmare flags above 5%, deadline-graveyard
 * above 15%), so the color shown here never disagrees with the number
 * the site's own calculation says it should be.
 */
import { useState } from "react";
import {
  PALETTE,
  cardStyle,
  panelStyle,
  utilityLabel,
  headingStyle,
  figureStyle,
  ghostCtaStyle,
  hexA,
} from "@/lib/chaosTokens";
import { getCalculator, type CalcInput } from "@/lib/diagnosticCalculators";
import { CALCULATOR_VISUALS } from "./calculatorVisuals";

export default function DiagnosticCalculatorClient({ slug }: { slug: string }) {
  const calc = getCalculator(slug);
  const [values, setValues] = useState<Record<string, number>>(() => {
    const initial: Record<string, number> = {};
    calc?.inputs.forEach((i) => {
      if (i.defaultValue !== undefined) initial[i.key] = i.defaultValue;
    });
    return initial;
  });

  if (!calc) return null; // page.tsx already calls notFound() before this renders

  const result = calc.calculate(values);
  const resultColor = result.headlineIsCost ? PALETTE.pink : PALETTE.mint;

  function renderVisual() {
    const Visual = CALCULATOR_VISUALS[slug];
    if (Visual && calc) return <Visual {...calc.visualProps(values)} />;
    return (
      <div style={{ ...cardStyle, padding: 28, marginTop: 20, textAlign: "center" }}>
        <div style={figureStyle(resultColor)}>{result.headline}</div>
        <p style={{ color: PALETTE.body, fontSize: 14.5, lineHeight: 1.6, marginTop: 14, maxWidth: 520, marginLeft: "auto", marginRight: "auto" }}>
          {result.detail}
        </p>
      </div>
    );
  }

  return (
    <div style={{ maxWidth: 720, margin: "0 auto", padding: "72px 20px 96px" }}>
      <span style={utilityLabel}>{calc.name.toUpperCase()}</span>
      <h1 style={{ ...headingStyle, marginTop: 10 }}>{calc.line}</h1>

      <div style={{ ...panelStyle, padding: 28, marginTop: 32 }}>
        {calc.inputs.map((input: CalcInput) => (
          <div key={input.key} style={{ marginBottom: 18 }}>
            <label
              style={{
                display: "block",
                fontFamily: "inherit",
                fontSize: 13.5,
                color: PALETTE.label,
                marginBottom: 6,
              }}
            >
              {input.label}
            </label>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              {input.prefix && <span style={{ color: PALETTE.label }}>{input.prefix}</span>}
              <input
                type="number"
                inputMode="decimal"
                className="chaos-input"
                value={values[input.key] ?? ""}
                onChange={(e) =>
                  setValues((prev) => ({ ...prev, [input.key]: Number(e.target.value) || 0 }))
                }
                placeholder="0"
                style={{
                  flex: 1,
                  background: PALETTE.card,
                  border: `1px solid ${hexA("#ffffff", 0.1)}`,
                  borderRadius: 8,
                  padding: "10px 12px",
                  color: PALETTE.bright,
                  fontSize: 15,
                }}
              />
              {input.suffix && <span style={{ color: PALETTE.label }}>{input.suffix}</span>}
            </div>
          </div>
        ))}
      </div>

      {renderVisual()}

      <div style={{ marginTop: 28, display: "flex", gap: 12, justifyContent: "center", flexWrap: "wrap" }}>
        <a href={calc.ctaHref} className="chaos-ghost" style={ghostCtaStyle()}>
          {calc.ctaLabel}
        </a>
      </div>

      <p style={{ textAlign: "center", color: PALETTE.label, fontSize: 12, marginTop: 24 }}>
        Your own numbers, in your browser. Nothing transmits.
      </p>
    </div>
  );
}
