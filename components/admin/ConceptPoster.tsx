import Image from "next/image";
import s from "./ConceptPoster.module.css";

export type ConceptBlock =
  | { kind: "cards"; title: string; items: { label: string; body: string }[] }
  | { kind: "list"; title: string; items: string[] }
  | { kind: "steps"; title: string; items: string[] }
  | { kind: "matrix"; title: string; columns: string[]; rows: { label: string; marks: boolean[] }[] };

export type ConceptPosterProps = {
  /* e.g. "Concept poster — vision precedent, not current board". Always say
     plainly what this section is and is not, the same way LabDetail's own
     `supersedes` field does. */
  label: string;
  title: string;
  tagline: string;
  /* Optional — the actual poster artwork. width/height are the file's real
     intrinsic pixel dimensions (required by next/image for a non-fill
     image); CSS scales it down responsively. Omit entirely for a
     text-only concept section. */
  image?: { src: string; alt: string; width: number; height: number };
  blocks: ConceptBlock[];
  /* Required, not optional — every concept-poster section needs to say in
     its own words what it's a precedent FOR and what it does NOT change. */
  caveat: string;
};

/* Renders vision/precedent material (design posters, gear kits, superseded
   programs) inside a LabDetail page, visually distinct from the current
   authoritative board above it. Pass as LabDetail's children. */
export default function ConceptPoster({ label, title, tagline, image, blocks, caveat }: ConceptPosterProps) {
  return (
    <section className={s.wrap}>
      <p className={s.label}>{label}</p>
      <h2 className={s.title}>{title}</h2>
      <p className={s.tagline}>{tagline}</p>

      {image && (
        <Image
          className={s.poster}
          src={image.src}
          alt={image.alt}
          width={image.width}
          height={image.height}
          sizes="(max-width: 700px) 100vw, 640px"
        />
      )}

      {blocks.map((b) => (
        <div className={s.block} key={b.title}>
          <h3 className={s.blockTitle}>{b.title}</h3>

          {b.kind === "cards" && (
            <div className={s.cards}>
              {b.items.map((it) => (
                <div className={s.card} key={it.label}>
                  <strong>{it.label}</strong>
                  <span>{it.body}</span>
                </div>
              ))}
            </div>
          )}

          {b.kind === "list" && (
            <ul className={s.list}>
              {b.items.map((it) => <li key={it}>{it}</li>)}
            </ul>
          )}

          {b.kind === "steps" && (
            <ol className={s.steps}>
              {b.items.map((it) => <li key={it}>{it}</li>)}
            </ol>
          )}

          {b.kind === "matrix" && (
            <table className={s.matrix}>
              <thead>
                <tr><th />{b.columns.map((c) => <th key={c}>{c}</th>)}</tr>
              </thead>
              <tbody>
                {b.rows.map((r) => (
                  <tr key={r.label}>
                    <td>{r.label}</td>
                    {r.marks.map((m, i) => <td key={i}>{m ? "✓" : "—"}</td>)}
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      ))}

      <p className={s.caveat}>{caveat}</p>
    </section>
  );
}
