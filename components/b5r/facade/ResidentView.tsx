"use client";

/**
 * The two-sided façade, from inside (study section 5.2): what a resident
 * sees from one window, seated or standing, with this option's module in
 * front of it. Schematic only: no daylight, glare or view model is run, and
 * a screen's open area stays "unknown" until a product is chosen.
 */
import { masksOf, moduleAt, moduleOf, type FacadeCell, type FacadeOption, type FacadeProject } from "@/lib/b5r/facade";
import { useId } from "react";

interface Props {
  project: FacadeProject;
  cell: FacadeCell | null;
  option: FacadeOption;
  posture: "seated" | "standing";
  night: boolean;
}

export default function ResidentView({ project, cell, option, posture, night }: Props) {
  const uid = useId().replace(/[^a-zA-Z0-9]/g, "");
  const win = cell ? masksOf(project, cell.id).find((m) => m.kind === "window") : undefined;
  if (!cell || !win) {
    return (
      <svg viewBox="0 0 600 220" role="img" aria-label="Pick a window cell to see the view from inside">
        <rect width={600} height={220} fill="#141b2e" />
        <text x={300} y={104} textAnchor="middle" fontSize={15} fill="#e9ebef">Select a cell with a window (W) on the elevation</text>
        <text x={300} y={128} textAnchor="middle" fontSize={12} fill="#A3A9B8">then this shows the schematic view from inside, seated or standing</text>
      </svg>
    );
  }
  const mod = moduleAt(option, cell.id);
  const m = moduleOf(mod);
  // Window opening scaled into the room wall, keeping the mask's proportions.
  const ow = 300;
  const oh = Math.min(240, (ow * win.rect.h) / win.rect.w * 0.75);
  const ox = 150;
  const oy = posture === "seated" ? 70 : 52;
  const horizon = oy + oh * (posture === "seated" ? 0.62 : 0.45);
  const sky = night ? "#0b1020" : "#9cc9e6";
  const street = night ? "#1a1d24" : "#59606c";
  const across = night ? "#262b36" : "#8a7b6c";
  const blocked = mod !== "F0" && mod !== "F3";
  const verdict: [string, string] = mod === "F0"
    ? ["Clear: this option leaves the window as it is.", ""]
    : mod === "F3"
      ? ["F3 screen in front: open area unknown (no product chosen).", "View, daylight and air loss must be tested (FG4)."]
      : [`${mod} ${m.name} over a window breaks a protected mask.`, "The option fails FG4."];
  return (
    <svg viewBox="0 0 600 380" role="img" aria-label={`View from inside ${cell.id}, ${posture}: ${verdict.join(" ")}`}>
      <defs>
        <clipPath id={`${uid}-win`}><rect x={ox} y={oy} width={ow} height={oh} /></clipPath>
      </defs>
      <rect width={600} height={380} fill={night ? "#2a2a30" : "#d9d2c5"} />
      <g clipPath={`url(#${uid}-win)`}>
        <rect x={ox} y={oy} width={ow} height={horizon - oy} fill={sky} />
        <rect x={ox} y={horizon} width={ow} height={oy + oh - horizon} fill={street} />
        <rect x={ox + 20} y={horizon - 90} width={110} height={90} fill={across} />
        <rect x={ox + 150} y={horizon - 60} width={140} height={60} fill={across} opacity={0.85} />
        {night && [0, 1, 2].map((i) => <rect key={i} x={ox + 40 + i * 30} y={horizon - 70} width={14} height={18} fill="#f0c674" opacity={0.7} />)}
        <line x1={ox} y1={horizon} x2={ox + ow} y2={horizon} stroke="#e9ebef" strokeDasharray="5 4" strokeWidth={1} opacity={0.7} />
        {mod === "F3" && Array.from({ length: Math.ceil(oh / 9) * Math.ceil(ow / 9) }, (_, k) => {
          const cols = Math.ceil(ow / 9);
          const x = ox + (k % cols) * 9;
          const y = oy + Math.floor(k / cols) * 9;
          return <path key={k} d={`M${x} ${y}h9v9h-9z M${x + 4.5} ${y + 2.2}a2.3 2.3 0 1 0 0.01 0z`} fill="rgba(217,222,232,.82)" fillRule="evenodd" />;
        })}
        {blocked && <rect x={ox} y={oy} width={ow} height={oh} fill="#8c96a8" />}
      </g>
      <rect x={ox} y={oy} width={ow} height={oh} fill="none" stroke="#f4efe6" strokeWidth={8} />
      <line x1={ox + ow / 2} y1={oy} x2={ox + ow / 2} y2={oy + oh} stroke="#f4efe6" strokeWidth={4} />
      <rect x={ox - 14} y={oy + oh + 4} width={ow + 28} height={10} fill={night ? "#3a3a40" : "#c4baa9"} />
      <text x={ox + ow + 8} y={horizon + 4} fontSize={11} fill={night ? "#cfd4de" : "#3b3027"} fontFamily="ui-monospace,Menlo,monospace">eye level ({posture})</text>
      <text x={300} y={330} textAnchor="middle" fontSize={13} fill={night ? "#e9ebef" : "#1B243D"}>{verdict[0]}</text>
      {verdict[1] && <text x={300} y={348} textAnchor="middle" fontSize={13} fill={night ? "#e9ebef" : "#1B243D"}>{verdict[1]}</text>}
      <text x={300} y={370} textAnchor="middle" fontSize={11} fill={night ? "#A3A9B8" : "#5C6478"}>Schematic from {cell.id} ({cell.roomUse.replace("_", " ")}); not a daylight, glare or view study.</text>
    </svg>
  );
}
