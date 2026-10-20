// The helper clips registered for a page (lib/helpers/registry.ts). Renders
// nothing when the page has none, so a page can include it before its clips
// exist. Add or re-cut clips in the registry, not here.

import { helperFiles, helperSize, helpersFor } from "@/lib/helpers/registry";
import HelperCard from "./HelperCard";
import s from "./helpers.module.css";

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

/** "2026-10-04" -> "October 2026" (no locale or time zone involved). */
function monthOf(isoDate: string): string {
  const [y, m] = isoDate.split("-").map(Number);
  return `${MONTHS[m - 1]} ${y}`;
}

interface Props {
  route: string;
  /** Section heading. Leave it out when the page supplies its own. */
  heading?: string;
  /** Centre the block at this width with page gutters (for pages without a content wrapper). */
  width?: number;
}

export default function HelperClips({ route, heading, width }: Props) {
  const list = helpersFor(route);
  if (list.length === 0) return null;
  const months = [...new Set(list.map((h) => monthOf(h.recorded)))].join(" and ");
  const allExample = list.every((h) => h.kind === "task" && h.exampleData);
  const Wrap = heading ? "section" : "div";
  const headingId = `helpers${route.replace(/[^a-z0-9]+/gi, "-")}`;

  return (
    <Wrap
      className={s.section}
      aria-labelledby={heading ? headingId : undefined}
      style={width ? { maxWidth: width, margin: "0 auto 72px", padding: "0 20px" } : undefined}
    >
      {heading && <h2 id={headingId} className={s.heading}>{heading}</h2>}
      <div className={list.length === 1 ? s.single : s.row}>
        {list.map((h) => (
          <HelperCard
            key={h.id}
            title={h.title}
            kind={h.kind}
            exampleData={h.exampleData}
            files={helperFiles(h.id)}
            size={helperSize(h)}
            steps={h.captions}
          />
        ))}
      </div>
      {allExample && (
        <p className={s.note}>
          Recorded on a phone from the live tool in {months}. The names and numbers are example data, not a real
          household or property.
        </p>
      )}
    </Wrap>
  );
}
