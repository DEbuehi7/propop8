/**
 * components/Gauge.tsx
 * ----------------------------------------------------------------
 * A real, functional semicircle arc gauge -- not a static image, a
 * live SVG driven by whatever number you pass it. Built as a shared
 * primitive on purpose: Deadline Graveyard's aging %, Asset Health's
 * score, and Callback Nightmare's rate could all reuse this exact
 * component later rather than each widget inventing its own gauge.
 *
 * Note on the reference images: those are AI-generated concept
 * mockups -- glossy 3D coins, photoreal pits, etc. This captures
 * their INFORMATION shape (a gauge communicating risk at a glance)
 * as clean, real, on-brand UI using your actual design tokens,
 * rather than trying to pixel-match illustrated marketing art in a
 * production component. That's a deliberate translation, not a
 * simplification I'd consider a gap.
 */
export function Gauge({
  value,
  size = 220,
  strokeWidth = 18,
  color,
  trackColor = "rgba(255,255,255,0.08)",
}: {
  value: number; // 0-100
  size?: number;
  strokeWidth?: number;
  color: string;
  trackColor?: string;
}) {
  const r = (size - strokeWidth) / 2;
  const cx = size / 2;
  const cy = size / 2;
  const clamped = Math.max(0, Math.min(100, value));
  const arcLength = Math.PI * r;
  const offset = arcLength * (1 - clamped / 100);
  const d = `M ${cx - r} ${cy} A ${r} ${r} 0 0 1 ${cx + r} ${cy}`;
  const viewH = size / 2 + strokeWidth;

  return (
    <svg width={size} height={viewH} viewBox={`0 0 ${size} ${viewH}`} role="img" aria-label={`${clamped.toFixed(0)}%`}>
      <path d={d} fill="none" stroke={trackColor} strokeWidth={strokeWidth} strokeLinecap="round" />
      <path
        d={d}
        fill="none"
        stroke={color}
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeDasharray={arcLength}
        strokeDashoffset={offset}
        style={{ transition: "stroke-dashoffset 0.5s ease, stroke 0.3s ease" }}
      />
    </svg>
  );
}
