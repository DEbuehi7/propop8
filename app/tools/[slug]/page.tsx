/**
 * app/tools/[slug]/page.tsx
 * ----------------------------------------------------------------
 * FIXED: Next.js 16 requires params to be awaited -- it's a Promise,
 * not a plain object (this was soft-deprecated in 15, hard-required
 * in 16). The previous version read params.slug directly, which
 * silently returned undefined instead of throwing, causing
 * getCalculator() to fail to match ANY slug and hit notFound() on
 * every single request. That's the exact 404 you were seeing.
 *
 * Otherwise identical to before -- generateStaticParams is untouched
 * since it doesn't receive request-scoped params at all.
 */
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { renderableCalculators, getCalculator } from "@/lib/diagnosticCalculators";
import DiagnosticCalculatorClient from "@/components/DiagnosticCalculatorClient";

export function generateStaticParams() {
  return renderableCalculators().map((c) => ({ slug: c.slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const calc = getCalculator(slug);
  if (!calc) return {};
  return {
    title: `${calc.name} — PropOps8`,
    description: calc.line,
  };
}

export default async function ToolPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const calc = getCalculator(slug);
  if (!calc || calc.externalHref) notFound();
  return <DiagnosticCalculatorClient slug={slug} />;
}
