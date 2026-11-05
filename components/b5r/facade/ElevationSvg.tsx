"use client";

/**
 * Schematic elevation for FIS-Flat v0.1: one SVG, drawn only from the
 * project data (GOV-01: visuals render state, never create it). Cells are
 * buttons; masks, room use, survey state and maintenance access are
 * switchable overlays, each with a letter or label as well as a colour.
 * Not to scale unless every bay and floor has a measured size.
 */
import { useId, type KeyboardEvent } from "react";
import { masksOf, moduleAt, type FacadeCell, type FacadeMask, type FacadeOption, type FacadeProject, type ModuleId } from "@/lib/b5r/facade";
import s from "./facade.module.css";

export interface Overlays {
  masks: boolean;
  rooms: boolean;
  geometry: boolean;
  maintenance: boolean;
}

interface Props {
  project: FacadeProject;
  elevationId: string;
  option: FacadeOption;
  conflictCells: Set<string>;
  selected: string | null;
  night: boolean;
  overlays: Overlays;
  onCell: (cellId: string) => void;
}

export const ROOM_SHORT: Record<string, string> = {
  bedroom: "BED", living: "LIV", studio: "STU", sro_room: "SRO", kitchen: "KIT", bathroom: "BATH", corridor: "CORR", stair: "STAIR",
  lobby: "LOBBY", mail_delivery: "MAIL", laundry: "LAUN", resident_amenity: "AMEN", mechanical: "MECH", parking: "PARK", unknown: "?",
};
export const MASK_LETTER: Record<FacadeMask["kind"], string> = { window: "W", egress: "E", utility: "U", historic: "H", maintenance_access: "M" };
export const MODULE_SWATCH: Record<ModuleId, string> = {
  F0: "#7a6656", F1: "#c3964a", F2: "#8c96a8", F3: "#d9dee8", F4: "#3DDCE8", F5: "#F2A33A", F6: "#b8c2d4", F7: "#5C6478",
};

const W = 760;
const TOP = 26;
const GROUND = 30;

export function layoutOf(p: FacadeProject, elevationId: string) {
  const e = p.elevations.find((x) => x.id === elevationId) ?? p.elevations[0];
  const measured = e.bayWidthsMm.every((v) => v !== null) && e.floorHeightsMm.every((v) => v !== null);
  const widths = measured ? (e.bayWidthsMm as number[]) : e.schematicBayWidths;
  const total = widths.reduce((t, v) => t + v, 0);
  const bw = widths.map((v) => (v / total) * W);
  const bx = bw.map((_, i) => bw.slice(0, i).reduce((t, v) => t + v, 0));
  const fh = measured ? (e.floorHeightsMm as number[]).map((v) => (v / total) * W) : Array(e.floors).fill(92);
  const height = fh.reduce((t: number, v: number) => t + v, 0);
  const fy = fh.map((_: number, f: number) => TOP + fh.slice(f + 1).reduce((t: number, v: number) => t + v, 0));
  return { e, measured, bw, bx, fh, fy, height, H: TOP + height + GROUND };
}

function rectOf(cell: { x: number; y: number; w: number; h: number }, r: FacadeMask["rect"]) {
  return { x: cell.x + r.x * cell.w, y: cell.y + r.y * cell.h, w: r.w * cell.w, h: r.h * cell.h };
}

export default function ElevationSvg({ project, elevationId, option, conflictCells, selected, night, overlays, onCell }: Props) {
  const uid = useId().replace(/[^a-zA-Z0-9]/g, "");
  const id = (n: string) => `${uid}-${n}`;
  const L = layoutOf(project, elevationId);
  const cells = project.cells.filter((c) => c.elevationId === L.e.id);
  const wall = night ? "#2b303d" : "#7a6656";
  const glass = night ? "#f0c674" : "#a9d4e4";

  const onKey = (cellId: string) => (ev: KeyboardEvent) => {
    if (ev.key === "Enter" || ev.key === " ") { ev.preventDefault(); onCell(cellId); }
  };

  const fillFor = (m: ModuleId) =>
    m === "F1" ? `url(#${id("mural")})` : m === "F2" ? `url(#${id("panel")})` : `url(#${id(night ? "brickN" : "brick")})`;

  const drawCell = (c: FacadeCell) => {
    const box = { x: L.bx[c.bay], y: L.fy[c.floor], w: L.bw[c.bay], h: L.fh[c.floor] };
    const mod = moduleAt(option, c.id);
    const masks = masksOf(project, c.id);
    const label = `Floor ${c.floor}, bay ${c.bay}, ${c.roomUse.replace("_", " ")}${masks.length ? `, ${masks.map((m) => m.kind.replace("_", " ")).join(", ")}` : ", solid wall"}; ${mod}${c.geometryState === "UNMEASURED" ? "; needs survey" : ""}${conflictCells.has(c.id) ? "; breaks a rule" : ""}`;
    const dim = overlays.maintenance && !masks.some((m) => m.kind === "utility" || m.kind === "maintenance_access") && mod !== "F5";
    return (
      <g key={c.id} className={s.cell} role="button" tabIndex={0} aria-label={label} aria-pressed={selected === c.id}
        onClick={() => onCell(c.id)} onKeyDown={onKey(c.id)} opacity={dim ? 0.35 : 1}>
        <rect x={box.x} y={box.y} width={box.w} height={box.h} fill={fillFor(mod)} />
        {masks.map((m) => {
          const r = rectOf(box, m.rect);
          if (m.kind === "window") return <g key={m.id}><rect x={r.x} y={r.y} width={r.w} height={r.h} fill={glass} stroke="#e9ebef" strokeWidth={2} /><line x1={r.x + r.w / 2} y1={r.y} x2={r.x + r.w / 2} y2={r.y + r.h} stroke="#e9ebef" strokeWidth={1.2} /></g>;
          if (m.kind === "egress") {
            const door = m.rect.y + m.rect.h >= 0.99 && m.rect.w < 0.9;
            return door
              ? <rect key={m.id} x={r.x} y={r.y} width={r.w} height={r.h} fill={night ? "#3a2f22" : "#3b3027"} stroke="#c9a06a" strokeWidth={1.5} />
              : <g key={m.id}><rect x={r.x} y={r.y} width={r.w} height={r.h} fill={`url(#${id("rail")})`} /><line x1={r.x} y1={r.y + r.h} x2={r.x + r.w} y2={r.y + r.h} stroke="#1c1f26" strokeWidth={2.5} /></g>;
          }
          if (m.kind === "utility") return <rect key={m.id} x={r.x} y={r.y} width={r.w} height={r.h} fill="#5d6470" stroke="#30343c" strokeWidth={1} />;
          if (m.kind === "historic") return <rect key={m.id} x={r.x} y={r.y} width={r.w} height={r.h} fill={`url(#${id("cornice")})`} />;
          return null;
        })}
        {mod === "F3" && <rect x={box.x + 2} y={box.y + 2} width={box.w - 4} height={box.h - 4} fill={`url(#${id("perf")})`} stroke="#d9dee8" strokeWidth={1.5} />}
        {mod === "F6" && Array.from({ length: 4 }, (_, i) => <rect key={i} x={box.x + ((i + 0.5) * box.w) / 4 - 2} y={box.y + 3} width={4} height={box.h - 6} fill="#b8c2d4" />)}
        {mod === "F4" && <g><rect x={box.x + box.w * 0.15} y={box.y + box.h * 0.3} width={box.w * 0.7} height={box.h * 0.22} rx={3} fill="#0f1626" stroke="#3DDCE8" strokeWidth={1.5} /><text x={box.x + box.w / 2} y={box.y + box.h * 0.3 + box.h * 0.15} textAnchor="middle" fontSize={11} fill="#3DDCE8" fontFamily="ui-monospace,Menlo,monospace">ADDR</text></g>}
        {mod === "F5" && masks.filter((m) => m.kind === "utility" || m.kind === "maintenance_access").map((m) => {
          const r = rectOf(box, m.rect);
          return <rect key={`f5-${m.id}`} x={r.x - 3} y={r.y - 3} width={r.w + 6} height={r.h + 6} fill="none" stroke="#F2A33A" strokeWidth={2.5} strokeDasharray="6 3" />;
        })}
        {overlays.masks && masks.map((m) => {
          const r = rectOf(box, m.rect);
          const color = { window: "#7fd3ff", egress: "#ff8a5c", utility: "#ffd166", historic: "#D9B35B", maintenance_access: "#3DDCE8" }[m.kind];
          return (
            <g key={`o-${m.id}`} pointerEvents="none">
              <rect x={r.x + 1} y={r.y + 1} width={Math.max(0, r.w - 2)} height={Math.max(0, r.h - 2)} fill="none" stroke={color} strokeWidth={1.6} strokeDasharray="4 2" />
              <text x={r.x + 4} y={r.y + 12} fontSize={10} fontWeight={700} fill={color} fontFamily="ui-monospace,Menlo,monospace">{MASK_LETTER[m.kind]}</text>
            </g>
          );
        })}
        {overlays.geometry && c.geometryState === "UNMEASURED" && <rect x={box.x} y={box.y} width={box.w} height={box.h} fill={`url(#${id("hatch")})`} pointerEvents="none" />}
        {overlays.geometry && c.geometryState === "SURVEY_VERIFIED" && <text x={box.x + box.w - 4} y={box.y + 12} textAnchor="end" fontSize={9} fill="#4FD69C" fontFamily="ui-monospace,Menlo,monospace">SV</text>}
        {overlays.rooms && <text x={box.x + box.w / 2} y={box.y + box.h - 5} textAnchor="middle" fontSize={9} fill={night ? "#cfd4de" : "#f4efe6"} fontFamily="ui-monospace,Menlo,monospace" pointerEvents="none">{ROOM_SHORT[c.roomUse] ?? "?"}</text>}
        {mod !== "F0" && <text x={box.x + box.w - 4} y={box.y + box.h - 5} textAnchor="end" fontSize={9.5} fontWeight={700} fill="#0b1220" stroke="#e9ebef" strokeWidth={2.5} paintOrder="stroke" fontFamily="ui-monospace,Menlo,monospace" pointerEvents="none">{mod}</text>}
        {conflictCells.has(c.id) && <rect x={box.x + 2} y={box.y + 2} width={box.w - 4} height={box.h - 4} fill="none" stroke="#E92AD6" strokeWidth={3} pointerEvents="none" />}
        {selected === c.id && <rect x={box.x + 1} y={box.y + 1} width={box.w - 2} height={box.h - 2} fill="none" stroke="#3DDCE8" strokeWidth={3} pointerEvents="none" />}
        <rect className={s.hit} x={box.x} y={box.y} width={box.w} height={box.h} fill="transparent" stroke="rgba(11,18,32,.55)" strokeWidth={1} />
      </g>
    );
  };

  const unmeasuredFloors = [...new Set(cells.filter((c) => c.geometryState === "UNMEASURED").map((c) => c.floor))];

  return (
    <svg viewBox={`0 0 ${W} ${L.H}`} role="group" aria-label={`${L.e.name}, ${L.e.orientation}-facing, ${L.e.floors} floors by ${L.e.bays} bays, ${L.measured ? "measured" : "schematic, not to scale"}`}>
      <defs>
        <pattern id={id("brick")} width={18} height={9} patternUnits="userSpaceOnUse"><rect width={18} height={9} fill="#7a6656" /><path d="M0 8.5H18M9 0V4.5M0 4.5H18M4 4.5V9" stroke="rgba(0,0,0,.16)" strokeWidth={1} /></pattern>
        <pattern id={id("brickN")} width={18} height={9} patternUnits="userSpaceOnUse"><rect width={18} height={9} fill={wall} /><path d="M0 8.5H18M9 0V4.5M0 4.5H18M4 4.5V9" stroke="rgba(0,0,0,.25)" strokeWidth={1} /></pattern>
        <pattern id={id("mural")} width={14} height={14} patternUnits="userSpaceOnUse" patternTransform="rotate(35)"><rect width={14} height={14} fill={night ? "#6b5530" : "#c3964a"} /><rect width={7} height={14} fill={night ? "#5a4728" : "#a87d39"} /></pattern>
        <pattern id={id("panel")} width={30} height={46} patternUnits="userSpaceOnUse"><rect width={30} height={46} fill={night ? "#4a5060" : "#8c96a8"} /><path d="M29.5 0V46M0 45.5H30" stroke="rgba(0,0,0,.28)" strokeWidth={1} /></pattern>
        <pattern id={id("perf")} width={7} height={7} patternUnits="userSpaceOnUse"><rect width={7} height={7} fill="rgba(217,222,232,.78)" /><circle cx={3.5} cy={3.5} r={1.7} fill="rgba(20,27,46,.85)" /></pattern>
        <pattern id={id("rail")} width={12} height={12} patternUnits="userSpaceOnUse"><path d="M0 12L12 0M-3 3L3 -3M9 15L15 9" stroke="#1c1f26" strokeWidth={1.4} /><path d="M0 0.75H12" stroke="#1c1f26" strokeWidth={1.5} /></pattern>
        <pattern id={id("cornice")} width={10} height={20} patternUnits="userSpaceOnUse"><rect width={10} height={20} fill={night ? "#5b5446" : "#b9a37a"} /><rect x={2} y={12} width={6} height={6} fill={night ? "#474035" : "#9c8661"} /></pattern>
        <pattern id={id("hatch")} width={8} height={8} patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width={8} height={8} fill="rgba(11,18,32,.25)" /><rect width={2} height={8} fill="rgba(233,235,239,.35)" /></pattern>
      </defs>
      <rect x={0} y={0} width={W} height={TOP + L.height} fill={night ? "#0b1020" : "#1d2740"} />
      <rect x={0} y={TOP - 6} width={W} height={6} fill={night ? "#3a3f4c" : "#5a4a3e"} />
      {cells.map(drawCell)}
      <rect x={0} y={TOP + L.height} width={W} height={GROUND} fill={night ? "#1a1d24" : "#4a4f5a"} />
      <rect x={0} y={TOP + L.height + GROUND - 6} width={W} height={6} fill={night ? "#2c2f37" : "#9aa0aa"} />
      <text x={8} y={TOP + L.height + 19} fontSize={10} fill="#cfd4de" fontFamily="ui-monospace,Menlo,monospace">SIDEWALK · {L.e.orientation}-FACING · {L.measured ? "MEASURED" : "SCHEMATIC, NOT TO SCALE"}</text>
      {overlays.geometry && unmeasuredFloors.map((f) => (
        <text key={f} x={W / 2} y={L.fy[f] + L.fh[f] / 2 + 4} textAnchor="middle" fontSize={13} fontWeight={700} fill="#e9ebef" stroke="#0b1220" strokeWidth={3} paintOrder="stroke" fontFamily="ui-monospace,Menlo,monospace" pointerEvents="none">NEEDS SURVEY</text>
      ))}
    </svg>
  );
}
