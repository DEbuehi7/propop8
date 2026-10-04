import Link from "next/link";
import Image from "next/image";
import type { CSSProperties } from "react";
import HubSpokeDiagram, { type HubSpokeDiagramProps } from "./HubSpokeDiagram";
import s from "./LetNode.module.css";

type Gate = "open" | "pending" | "blocked" | "unknown";
type Item = { label: string; body: string };

export type LetSection =
  | { kind: "cards"; title: string; sub?: string; items: Item[] }
  | { kind: "tree"; title: string; sub?: string; trunk: string; items: Item[] }
  | { kind: "facts"; title: string; sub?: string; items: [string, string][] }
  | { kind: "layers"; title: string; sub?: string; groups: { name: string; layers: string[] }[] }
  | { kind: "hub"; title: string; sub?: string; hub: Omit<HubSpokeDiagramProps, "heading"> }
  | { kind: "stages"; title: string; sub?: string; items: { stage: string; name: string; size: string; body: string }[] }
  | { kind: "matrix"; title: string; sub?: string; columns: string[]; rows: { label: string; marks: boolean[] }[] }
  | { kind: "route"; title: string; sub?: string; stops: { name: string; role: string; tag: string }[] }
  | { kind: "list"; title: string; sub?: string; items: string[] };

export type LetNodeProps = {
  theme: "snow" | "desert" | "circuit";
  kicker: string;
  name: string;
  subtitle: string;
  tagline: string;
  location: string;
  seasonRole: string;
  stats: [string, string][];
  summary: string;
  supersedes?: string;
  rows: { role: string; lesson: string }[];
  gates: [string, Gate][];
  sections: LetSection[];
  poster: { src: string; alt: string; width: number; height: number; label: string };
  caveat: string;
  source: string;
};

function Section({ sec, n }: { sec: LetSection; n: number }) {
  return (
    <section className={s.sec} aria-labelledby={`sec-${n}`}>
      <header className={s.secHead}>
        <span className={s.num}>{String(n).padStart(2, "0")}</span>
        <div>
          <h2 id={`sec-${n}`} className={s.secTitle}>{sec.title}</h2>
          {sec.sub && <p className={s.secSub}>{sec.sub}</p>}
        </div>
      </header>

      {sec.kind === "cards" && (
        <div className={s.cards}>
          {sec.items.map((it) => (
            <div key={it.label} className={s.card}><h3>{it.label}</h3><p>{it.body}</p></div>
          ))}
        </div>
      )}

      {sec.kind === "tree" && (
        <div className={s.tree}>
          <div className={s.trunk}><span>{sec.trunk}</span></div>
          <ol className={s.leaves}>
            {sec.items.map((it, i) => (
              <li key={it.label} className={`${s.leaf} ${i % 2 ? s.right : s.left}`}>
                <h3>{it.label}</h3><p>{it.body}</p>
              </li>
            ))}
          </ol>
        </div>
      )}

      {sec.kind === "facts" && (
        <dl className={s.facts}>
          {sec.items.map(([k, v]) => (
            <div key={k}><dt>{k}</dt><dd>{v}</dd></div>
          ))}
        </dl>
      )}

      {sec.kind === "layers" && (
        <div className={s.layerGrid}>
          {sec.groups.map((g) => (
            <div key={g.name} className={s.layerCard}>
              <h3>{g.name}</h3>
              <ol>{g.layers.map((l, i) => <li key={l} style={{ "--i": i } as CSSProperties}>{l}</li>)}</ol>
              <span className={s.out}>exterior → interior</span>
            </div>
          ))}
        </div>
      )}

      {sec.kind === "hub" && <div className={s.hubWrap}><HubSpokeDiagram {...sec.hub} /></div>}

      {sec.kind === "stages" && (
        <ol className={s.stages}>
          {sec.items.map((st) => (
            <li key={st.stage}>
              <span className={s.stageTag}>{st.stage}</span>
              <h3>{st.name}</h3>
              <strong>{st.size}</strong>
              <p>{st.body}</p>
            </li>
          ))}
        </ol>
      )}

      {sec.kind === "matrix" && (
        <div className={s.matrixScroll} role="region" aria-label={sec.title} tabIndex={0}>
          <table className={s.matrix}>
            <thead>
              <tr><th scope="col">Gear / tool</th>{sec.columns.map((c) => <th key={c} scope="col">{c}</th>)}</tr>
            </thead>
            <tbody>
              {sec.rows.map((r) => (
                <tr key={r.label}>
                  <th scope="row">{r.label}</th>
                  {r.marks.map((m, i) => (
                    <td key={i} className={m ? s.yes : s.no}>
                      <span aria-hidden>{m ? "●" : "–"}</span>
                      <span className={s.sr}>{m ? "yes" : "no"}</span>
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {sec.kind === "route" && (
        <ol className={s.route}>
          {sec.stops.map((st) => (
            <li key={st.name}><span className={s.pin} aria-hidden /><div><h3>{st.name}</h3><em>{st.tag}</em><p>{st.role}</p></div></li>
          ))}
        </ol>
      )}

      {sec.kind === "list" && (
        <ul className={s.list}>{sec.items.map((x) => <li key={x}>{x}</li>)}</ul>
      )}
    </section>
  );
}

/* Shared responsive infographic page for an individual LET node
   (Lumen · Eon · Transect). Live text replaces the poster image so it
   reads at any width; the original poster stays one tap away. */
export default function LetNode(p: LetNodeProps) {
  return (
    <main className={`${s.page} ${s[p.theme]}`}>
      <div className={s.wrap}>
        <Link className={s.back} href="/admin/let">← LET Network</Link>

        <header className={s.hero}>
          <p className={s.kicker}>{p.kicker}</p>
          <h1 className={s.h1}>{p.name}</h1>
          <p className={s.subtitle}>{p.subtitle}</p>
          <p className={s.tagline}>{p.tagline}</p>
          <p className={s.loc}>{p.location}</p>
          <span className={s.pill}>{p.seasonRole}</span>
        </header>

        <ul className={s.stats}>
          {p.stats.map(([k, v]) => (<li key={k}><strong>{v}</strong><span>{k}</span></li>))}
        </ul>

        <section className={s.board} aria-labelledby="board">
          <h2 id="board" className={s.boardTitle}>Current board — authoritative</h2>
          <p className={s.summary}>{p.summary}</p>
          {p.supersedes && <p className={s.supersedes}>{p.supersedes}</p>}
          <div className={s.boardGrid}>
            <div className={s.rows}>
              {p.rows.map((r) => (
                <div key={r.role} className={s.row}><h3>{r.role}</h3><p>{r.lesson}</p></div>
              ))}
            </div>
            <div className={s.gateBox}>
              <h3>Gates</h3>
              <ul>{p.gates.map(([g, st]) => (<li key={g}><span>{g}</span><span className={`${s.st} ${s[st]}`}>{st}</span></li>))}</ul>
            </div>
          </div>
        </section>

        <p className={s.vision}>Concept / vision reference — drawn from the poster, not the current board</p>
        {p.sections.map((sec, i) => <Section key={sec.title} sec={sec} n={i + 1} />)}

        <details className={s.poster}>
          <summary>{p.poster.label}</summary>
          <Image src={p.poster.src} alt={p.poster.alt} width={p.poster.width} height={p.poster.height} sizes="(max-width: 700px) 100vw, 760px" />
          <a href={p.poster.src} target="_blank" rel="noreferrer">Open full-size poster ↗</a>
        </details>

        <p className={s.caveat}>{p.caveat}</p>
        <p className={s.source}>{p.source}<br />Illustrative design concept. Not a construction document. No approvals, entitlements or engineering implied.</p>
      </div>
    </main>
  );
}
