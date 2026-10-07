/**
 * app/tools/page.tsx
 * ----------------------------------------------------------------
 * Index of every diagnostic calculator. Reads the registry in
 * lib/diagnosticCalculators.ts, so a calculator added there is
 * reachable from here with no second list to keep in sync.
 */
import type { Metadata } from "next";
import Link from "next/link";
import { DIAGNOSTIC_CALCULATORS, calculatorHref } from "@/lib/diagnosticCalculators";
import { PALETTE, MONO, DISPLAY, hexA, cardStyle, utilityLabel, headingStyle, sharedCss } from "@/lib/chaosTokens";

export const metadata: Metadata = {
  title: "Diagnostics — PropOps8",
  description:
    "Free calculators that show where an operation is leaking money. Your own numbers, in your browser. Nothing transmits.",
};

export default function ToolsIndexPage() {
  return (
    <main style={{ minHeight: "100vh", background: PALETTE.void, padding: "72px 20px 96px", fontFamily: DISPLAY }}>
      <style>{sharedCss}</style>
      <div style={{ maxWidth: 1120, margin: "0 auto" }}>
        <span style={utilityLabel}>The Ugly8</span>
        <h1 style={{ ...headingStyle, margin: "14px 0 10px" }}>Diagnostics</h1>
        <p style={{ color: hexA("#ffffff", 0.66), fontSize: 15, lineHeight: 1.6, maxWidth: "46ch", margin: "0 0 32px" }}>
          Pick the problem that sounds most like your week. Each one runs on your own numbers, in your browser.
          Nothing transmits.
        </p>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {DIAGNOSTIC_CALCULATORS.map((c) => (
            <Link
              key={c.slug}
              href={calculatorHref(c)}
              className="chaos-tile chaos-focus block overflow-hidden"
              style={{ ...cardStyle, textDecoration: "none" }}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={`/widgets/sm/${c.slug}.png?v=2`}
                alt={`${c.name} diagnostic card`}
                width={600}
                height={600}
                loading="lazy"
                style={{ width: "100%", height: "auto", display: "block" }}
              />
              <div style={{ padding: "16px 16px 18px" }}>
                <div style={{ fontFamily: MONO, fontSize: 11.5, letterSpacing: "0.13em", textTransform: "uppercase", color: PALETTE.cyan }}>
                  {c.name}
                </div>
                <p style={{ fontSize: 13.5, lineHeight: 1.5, color: hexA("#ffffff", 0.66), margin: "9px 0 0" }}>{c.line}</p>
              </div>
            </Link>
          ))}
        </div>
      </div>
    </main>
  );
}
