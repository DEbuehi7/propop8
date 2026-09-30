import Link from "next/link";
import type { ReactNode } from "react";
import s from "./LabDetail.module.css";

type Gate = "open" | "pending" | "blocked" | "unknown";

export type LabDetailProps = {
  kicker: string;
  glyph?: string;
  name: string;
  subtitle: string;
  location: string;
  seasonRole: string;
  summary: string;
  rows: { role: string; lesson: string }[];
  gates: [string, Gate][];
  supersedes?: string;
  source: string;
  /* Optional extra content rendered after Gates and before the source
     footer — e.g. a <ConceptPoster> for vision/precedent material that
     isn't part of the current authoritative board itself. */
  children?: ReactNode;
};

/* Shared layout for an individual LVN node's page. Content is data-in —
   see app/admin/lvn/eon, /lumen, /transect for what each node passes in. */
export default function LabDetail({
  kicker, name, subtitle, location, seasonRole, summary, rows, gates, supersedes, source, children,
}: LabDetailProps) {
  return (
    <main className={s.page}>
      <div className={s.wrap}>
        <Link className={s.back} href="/admin/lvn">← LVN Network</Link>

        <header className={s.head}>
          <p className={s.kicker}>{kicker}</p>
          <div className={s.titlerow}>
            <h1 className={s.h1}>{name}</h1>
            <span className={s.subtitle}>{subtitle}</span>
          </div>
          <p className={s.loc}>{location}</p>
          <span className={s.seasonRole}>{seasonRole}</span>
          <p className={s.summary}>{summary}</p>
          {supersedes && <p className={s.supersedes}>{supersedes}</p>}
        </header>

        <h2 className={s.h2}>Current role → canonical lesson</h2>
        <table className={s.table}>
          <thead><tr><th>Current role</th><th>Canonical lesson</th></tr></thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.role}><td>{r.role}</td><td>{r.lesson}</td></tr>
            ))}
          </tbody>
        </table>

        <h2 className={s.h2}>Gates</h2>
        <ul className={s.gates}>
          {gates.map(([g, st]) => (
            <li key={g}><span>{g}</span><span className={`${s.st} ${s[st]}`}>{st}</span></li>
          ))}
        </ul>

        {children}

        <p className={s.source}>{source}<br />Illustrative design concept. Not a construction document. No approvals, entitlements or engineering implied.</p>
      </div>
    </main>
  );
}
