"use client";

import { useState } from "react";
import s from "./HubSpokeDiagram.module.css";

export type HubSpokeNode = {
  id: string;
  label: string[];
  body: string;
};

export type HubSpokeDiagramProps = {
  items: HubSpokeNode[];
  /* Short label centered in the hub circle, e.g. "EON LABS" or "THE CABIN". */
  hubLabel: string;
  /* Accessible name for the whole diagram — describe what it shows, not just its parts. */
  ariaLabel: string;
  /* Optional heading rendered above the diagram. Omit when this component is nested
     inside a block that already renders its own title (e.g. ConceptPoster's `custom`
     block kind, as Eon uses it) — passing both would duplicate the heading. Provide it
     when the component is NOT nested in such a block (as Lumen uses it). */
  heading?: string;
};

const CENTER = 200;
const RADIUS = 150;

function pointOnCircle(index: number, total: number) {
  const angle = (Math.PI * 2 * index) / total - Math.PI / 2;
  return {
    x: CENTER + RADIUS * Math.cos(angle),
    y: CENTER + RADIUS * Math.sin(angle),
  };
}

/* A small hub-and-spoke SVG diagram: N items arranged around one center, connected by
   animated spokes, hover/focus-synced to a matching card grid below. Shared across LVN
   node pages (originally built for Eon as NeuralFieldDiagram, generalized here so Lumen
   can reuse the same proven interaction instead of a one-off rebuild) — this component
   only knows shapes; each page supplies its own content, hub label and heading. */
export default function HubSpokeDiagram({ items, hubLabel, ariaLabel, heading }: HubSpokeDiagramProps) {
  const [activeId, setActiveId] = useState<string | null>(null);

  return (
    <>
      {heading && <h3 className={s.heading}>{heading}</h3>}
      <div className={s.wrap}>
        <svg viewBox="0 0 400 400" className={s.svg} role="img" aria-label={ariaLabel}>
          {items.map((item, i) => {
            const { x, y } = pointOnCircle(i, items.length);
            const isActive = activeId === item.id;
            const labelBelow = y > CENTER;
            return (
              <g
                key={item.id}
                className={isActive ? `${s.spokeGroup} ${s.active}` : s.spokeGroup}
                tabIndex={0}
                onMouseEnter={() => setActiveId(item.id)}
                onMouseLeave={() => setActiveId(null)}
                onFocus={() => setActiveId(item.id)}
                onBlur={() => setActiveId(null)}
              >
                <line x1={CENTER} y1={CENTER} x2={x} y2={y} className={s.spoke} style={{ animationDelay: `${i * 0.12}s` }} />
                <circle cx={x} cy={y} r={7} className={s.node} />
                <text x={x} y={labelBelow ? y + 18 : y - 12} textAnchor="middle" className={s.nodeLabel}>
                  {item.label.map((line, li) => (
                    <tspan key={li} x={x} dy={li === 0 ? 0 : 11}>{line}</tspan>
                  ))}
                </text>
              </g>
            );
          })}
          <circle cx={CENTER} cy={CENTER} r={34} className={s.hub} />
          <text x={CENTER} y={CENTER + 4} textAnchor="middle" className={s.hubLabel}>{hubLabel}</text>
        </svg>
        <div className={s.cards}>
          {items.map((item) => (
            <div key={item.id} className={activeId === item.id ? `${s.card} ${s.cardActive}` : s.card}
              onMouseEnter={() => setActiveId(item.id)} onMouseLeave={() => setActiveId(null)}>
              <strong>{item.label.join(" ")}</strong>
              <span>{item.body}</span>
            </div>
          ))}
        </div>
      </div>
    </>
  );
}
