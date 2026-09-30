import Link from "next/link";
import s from "./AdminLaunchpad.module.css";

/* One-row launcher for the /admin page. Add or remove tiles here. */
const TILES = [
  { href: "/plate", title: "Plate", sub: "Entertainment rig · 6 pages", accent: "#E92AD6" },
  { href: "/tools/recert", title: "Recert Flow Engine", sub: "AR form filler", accent: "#3DDCE8" },
  { href: "/admin/lvn", title: "LVN Network", sub: "Eon · Lumen · Node 03", accent: "#4FD69C" },
  { href: "/brrrr", title: "BRRRR / AIM-B5R", sub: "Phase 0 · Screen", accent: "#F2A33A" },
  { href: "/infographics", title: "Infographics", sub: "Boards + visuals", accent: "#8B7CF6" },
  { href: "/audit", title: "Audit (public)", sub: "What clients see", accent: "#A3A9B8" },
];

export default function AdminLaunchpad() {
  return (
    <nav className={s.pad} aria-label="Admin launchpad">
      {TILES.map((t) => (
        <Link key={t.href} href={t.href} className={s.tile} style={{ ["--a" as string]: t.accent }}>
          <span className={s.bar} aria-hidden />
          <strong>{t.title}</strong>
          <span>{t.sub}</span>
          <em aria-hidden>→</em>
        </Link>
      ))}
    </nav>
  );
}
