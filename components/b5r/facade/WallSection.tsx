/**
 * Simplified wall section (study section 5.1): the relationships a planar
 * screen must respect. Illustrative only; it is not a construction detail
 * and shows no product, dimension or rating.
 */
const LAYERS = [
  { x: 40, w: 40, fill: "#d9d2c5", label: "Interior finish" },
  { x: 80, w: 90, fill: "#7a6656", label: "Existing host wall (verify first)" },
  { x: 170, w: 14, fill: "#3DDCE8", label: "Moisture / weather interface (keep drainage and flashing)" },
  { x: 184, w: 22, fill: "#5C6478", label: "Subframe (engineered attachment path, FG2)" },
  { x: 206, w: 46, fill: "#1B243D", label: "Service gap (cleaning and inspection reach, FG6)" },
  { x: 252, w: 10, fill: "#d9dee8", label: "Optional planar screen or panel (F2 / F3)" },
];

export default function WallSection() {
  return (
    <svg viewBox="0 0 760 330" role="img" aria-label="Illustrative wall section: interior finish, host wall, moisture interface, subframe, service gap and optional planar screen">
      <rect width={760} height={330} fill="#141b2e" />
      {LAYERS.map((l) => <rect key={l.label} x={l.x} y={30} width={l.w} height={250} fill={l.fill} stroke="#0b1220" />)}
      {LAYERS.map((l, i) => (
        <g key={l.label}>
          <line x1={l.x + l.w / 2} y1={60 + i * 34} x2={330} y2={60 + i * 34} stroke="#e9ebef" strokeWidth={1} opacity={0.7} />
          <circle cx={l.x + l.w / 2} cy={60 + i * 34} r={3.5} fill="#e9ebef" stroke="#0b1220" />
          <text x={338} y={64 + i * 34} fontSize={13} fill="#e9ebef">{l.label}</text>
        </g>
      ))}
      <path d="M262 250 q20 10 6 30" stroke="#3DDCE8" strokeWidth={2} fill="none" />
      <text x={276} y={300} fontSize={11} fill="#3DDCE8">water out, never trapped (FG3)</text>
      <text x={40} y={318} fontSize={11} fill="#A3A9B8">Illustrative relationships only, not an approved construction detail. A qualified architect or engineer checks any assembly.</text>
    </svg>
  );
}
