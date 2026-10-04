import Link from "next/link";
import s from "./AdminLaunchpad.module.css";

/* One-row launcher for the /admin page. Add or remove tiles here. */
const TILES = [
  { href: "/admin/intakes", title: "Audit Intakes", sub: "Release held · resend links", accent: "#4FD69C" },
  { href: "/admin/review", title: "Ledger Review", sub: "Review findings · approve · send", accent: "#03edff" },
  { href: "/plate", title: "Plate8", sub: "Entertainment rig · 6 pages", accent: "#E92AD6" },
  { href: "/tools/recert", title: "Recert Flow Engine", sub: "AR form filler", accent: "#3DDCE8" },
  { href: "/admin/let", title: "LET Network", sub: "Eon · Lumen · Node 03", accent: "#4FD69C" },
  { href: "/brrrr", title: "BRRRR / AIM-B5R", sub: "Screen · Monte Carlo simulate", accent: "#F2A33A" },
  { href: "/admin/b5r", title: "B5R Pipeline", sub: "Saved deals · actuals · calibration", accent: "#F2A33A" },
  { href: "/infographics", title: "Infographics", sub: "Boards + visuals", accent: "#8B7CF6" },
  { href: "/audit", title: "Audit (public)", sub: "What clients see", accent: "#A3A9B8" },
  { href: "/ingest", title: "Ledger Screening (public)", sub: "Free CSV check", accent: "#A3A9B8" },
  { href: "/tools/vacancy-calculator", title: "Vacancy Calculator (public)", sub: "Free diagnostic", accent: "#A3A9B8" },
  { href: "/", title: "Public site", sub: "Home page", accent: "#A3A9B8" },
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
