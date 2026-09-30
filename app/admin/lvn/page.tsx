import type { Metadata } from "next";
import Link from "next/link";
import type { ReactNode } from "react";
import s from "./lvn.module.css";

export const metadata: Metadata = { title: "LVN Network · Admin · PropOps8", robots: { index: false } };

/* ── EDIT HERE ────────────────────────────────────────────────
   Gate status: "open" | "pending" | "blocked" | "unknown".
   Set labUrl / boardUrl to real routes or files (e.g. "/nodes/eon.pdf"). null = disabled button. */
type Gate = "open" | "pending" | "blocked" | "unknown";
type Node = {
  id: string; name: string; lab: string; glyph: string; empty?: boolean;
  location: string; season: string; role: string; tags: string[];
  gates: [string, Gate][]; note: string; labUrl: string | null; boardUrl: string | null;
};

const NODES: Node[] = [
  {
    id: "LVN-01", name: "Eon", lab: "Eon Lab", glyph: "E",
    location: "Twentynine Palms, CA · 0.26-acre city lot", season: "Spring · experimentation · build",
    role: "Single-level desert house + lab at field-station scale. Campus functions move to a future site.",
    tags: ["29! V2", "Solar Bloom", "EDO Droid Phase 0", "Local-first"],
    gates: [["Zoning", "unknown"], ["Septic", "unknown"], ["Earn-It (revenue)", "pending"]],
    note: "Compute is bounded by real roof, energy and site conditions.",
    labUrl: "/admin/lvn/eon", boardUrl: null,
  },
  {
    id: "LVN-02", name: "Lumen", lab: "Lumen Lab", glyph: "L",
    location: "Crestline, CA · two steep lots", season: "Winter · intimacy · depth",
    role: "Modest two-level seasonal reset cabin, WUI-resilient. Not a compute node under CL V2.",
    tags: ["CL V2", "WUI", "Outage mode", "One calm AIM wall"],
    gates: [["Access", "unknown"], ["Septic / OWTS", "unknown"], ["Lot merge", "unknown"]],
    note: "Title, survey and OWTS feasibility come before any design spend.",
    labUrl: "/admin/lvn/lumen", boardUrl: null,
  },
  {
    id: "LVN-03", name: "Transect", lab: "Digital Nomad Node", glyph: "T",
    location: "No fixed site · seasonal circuit", season: "Year-round · scouting · in transit",
    role: "Summers at Crestline, winters at Twentynine Palms, Airbnb in between scouting BRRRR / AIM-B5R land across Kern and Fresno Counties.",
    tags: ["Land-survey circuit", "BRRRR / AIM-B5R scouting"],
    gates: [["Circuit defined", "open"], ["BRRRR / AIM-B5R site (Kern/Fresno)", "pending"]],
    note: "No design or acquisition commitment before the site and business gates clear (Canon 12).",
    labUrl: "/admin/lvn/transect", boardUrl: null,
  },
];

function Btn({ href, children, primary }: { href: string | null; children: ReactNode; primary?: boolean }) {
  const cls = `${s.btn} ${primary ? s.primary : ""}`;
  return href ? <Link className={cls} href={href}>{children}</Link> : <span className={`${cls} ${s.off}`} aria-disabled>{children}</span>;
}

export default function LvnNetwork() {
  return (
    <main className={s.page}>
      <div className={s.wrap}>
        <header className={s.head}>
          <div>
            <p className={s.kicker}>PropOps8 · Admin · Live-Work Node Network</p>
            <h1 className={s.h1}>LVN <span>Network</span></h1>
            <p className={s.sub}>Climate-node field sites and labs: current authoritative board, open gates, quick access to each lab.</p>
          </div>
          <ul className={s.legend}>
            <li><i style={{ background: "var(--cyan)" }} />Gate clear</li>
            <li><i style={{ background: "var(--muted)" }} />Pending</li>
            <li><i style={{ background: "var(--magenta)" }} />Blocked</li>
            <li><i style={{ background: "var(--slate)" }} />Unknown</li>
          </ul>
        </header>

        <div className={s.grid}>
          {NODES.map((n) => (
            <article key={n.id} className={`${s.node} ${n.empty ? s.empty : ""}`}>
              <div className={s.glyph}>
                <svg viewBox="0 0 100 100" aria-hidden>
                  <circle cx="50" cy="50" r="44" fill="none" stroke="#5C6478" strokeWidth="1" />
                  <polygon points="50,8 88,72 12,72" fill="none" stroke="#5C6478" strokeWidth="1" opacity=".6" />
                  <text x="50" y="64" textAnchor="middle" fontFamily="Inter, system-ui, sans-serif" fontWeight={700} fontSize="44" fill={n.empty ? "#5C6478" : "#3DDCE8"}>{n.glyph}</text>
                </svg>
              </div>
              <div className={s.body}>
                <div className={s.idrow}><h2>{n.name}</h2><span className={s.nid}>{n.id}</span></div>
                <p className={s.loc}>{n.location}<br />{n.season}</p>
                <p className={s.role}>{n.role}</p>
                <div className={s.chips}>{n.tags.map((t) => <span key={t} className={s.chip}>{t}</span>)}</div>
                <ul className={s.gates}>
                  {n.gates.map(([g, st]) => (<li key={g}><span>{g}</span><span className={`${s.st} ${s[st]}`}>{st}</span></li>))}
                </ul>
                <p className={s.note}>{n.note}</p>
                <div className={s.actions}>
                  <Btn href={n.labUrl} primary>Open {n.lab}</Btn>
                  <Btn href={n.boardUrl}>Site board</Btn>
                </div>
              </div>
            </article>
          ))}
        </div>

        <footer className={s.foot}>
          AIM / PropOps8 — LVN Network · California · Internal admin view · Rev 1 · 27 Sep 2026<br />
          Illustrative design concepts. Not construction documents. Site facts governed by 29_v2 and CL_v2 (21 Sep 2026). No approvals, entitlements or engineering implied.
        </footer>
      </div>
    </main>
  );
}
