// lib/dance8/motion/countSheet.ts
//
// The CHOIR8 plan as a count sheet a person can rehearse or film from: per
// cue, the eight counts with their times, the move and what each role does.
// Pure: no files.

import type { BeatFeel } from "./beatFeel";
import { FLOW_RULES, LANDING_TEXT } from "./landing";
import type { CuePlan, PerformerMove, PlannedCount, Role } from "./rhythm";

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const ROLES: Role[] = ["soloist", "choir", "breaker", "skater"];
const LABEL: Record<Role, string> = { soloist: "Soloist", choir: "Choir", breaker: "Breaker", skater: "Skater" };
const RELATION: Record<CuePlan["relationship"], string> = {
  unison: "Unison: everyone on the same count, each at their own size.",
  wave: "Wave: the choir's front row starts, the middle row one count later, the back row two counts later.",
  call_response: "Call and response: the soloist moves on counts 1 to 4, the choir answers on 5 to 8.",
};
const cell = (m: PerformerMove | undefined) => (m ? `${m.active ? "" : '<span class="hold">'}${esc(m.doing)}${m.active ? "" : "</span>"}` : "");
const t = (s: number) => `${Math.floor(s / 60)}:${(s % 60).toFixed(1).padStart(4, "0")}`;

/** What the music does on a count where it departs from its own rhythm. */
export function musicText(f: BeatFeel): string {
  switch (f.kind) {
    case "push": return `the hit comes ${Math.abs(f.shiftMs ?? 0)} ms early`;
    case "drag": return `the hit comes ${f.shiftMs ?? 0} ms late`;
    case "syncopated": return "the accent moves to the and";
    case "dropped": return "the beat drops out";
    default: return f.kind;
  }
}

const landingCell = (m: PerformerMove, f: BeatFeel) => {
  if (!m.active || !m.landing) return '<span class="hold">rests</span>';
  const txt = LANDING_TEXT[m.landing] + (m.landing === "with" && f.shiftMs !== null ? ` (${f.shiftMs > 0 ? "+" : "−"}${Math.abs(f.shiftMs)} ms)` : "");
  return m.landing === "on" ? esc(txt) : `<b>${esc(txt)}</b>`;
};

/** The counts where the song departs from its own rhythm, and where each dancer landed. */
function feelTable(p: CuePlan): string {
  const odd = p.counts.filter((c): c is PlannedCount & { feel: BeatFeel } => !!c.feel && c.feel.kind !== "steady" && c.feel.kind !== "unknown");
  if (!odd.length) return "";
  const rows = odd.map((c) => {
    const of = (r: Role) => c.moves.filter((m) => m.role === r);
    const cellFor = (r: Role) => of(r).map((m) => (of(r).length > 1 ? `${esc(m.row ?? m.id)}: ` : "") + landingCell(m, c.feel)).join("<br>");
    return `<tr><td class="n">${t(c.timeSec)}</td><td class="n">${c.count}${c.count === 1 ? " (the one)" : ""} <span class="mut">phrase ${c.phrase + 1}</span></td><td>${esc(musicText(c.feel))}</td>${ROLES.map((r) => `<td>${cellFor(r)}</td>`).join("")}</tr>`;
  }).join("\n");
  return `<details class="feel"><summary>Beat feel: ${odd.length} count${odd.length === 1 ? "" : "s"} where the rhythm shifts, and where each dancer lands</summary>
<div class="wrap"><table><tr><th>Time</th><th>Count</th><th>The music</th>${ROLES.map((r) => `<th>${LABEL[r]}</th>`).join("")}</tr>
${rows}
</table></div></details>`;
}

export interface SheetOptions {
  /** Which set of beat choices the plan carries. */
  variation?: number;
  /** One sentence on where the beat feel came from. */
  feelNote?: string;
}

export function countSheetHtml(title: string, plans: CuePlan[], opts: SheetOptions = {}): string {
  const sections = plans.map((p) => {
    const first = p.counts.filter((c) => c.phrase === 0);
    const phrases = p.counts.length ? p.counts[p.counts.length - 1].phrase + 1 : 0;
    const rows = first.map((c) => {
      const by = (r: Role) => c.moves.find((m) => m.role === r);
      const lead = c.moves[0];
      return `<tr><td class="n">${c.count}</td><td class="n">${t(c.timeSec)}</td><td><span class="arrow">${esc(lead.arrow === "·" ? (by("choir")?.arrow ?? "·") : lead.arrow)}</span> ${esc(c.moves.find((m) => m.active)?.intent ?? lead.intent)}</td>${ROLES.map((r) => `<td>${cell(by(r))}</td>`).join("")}</tr>`;
    }).join("\n");
    return `<section class="cue">
<h2>${esc(p.cueId)} <span class="mut">${esc(p.section)} · ${t(p.startSec)} to ${t(p.endSec)} · ${p.bpm} BPM${p.beatsPerCount === 2 ? " (half time: a count is two beats)" : ""}</span></h2>
${p.gate === "execute" ? "" : `<p class="defer">DEFER: ${esc(p.reason)}.</p>`}
<p>${esc(RELATION[p.relationship])} ${phrases > 1 ? `${phrases} phrases; every second one is mirrored (left and right swap).` : ""}</p>
<div class="wrap"><table><tr><th>Count</th><th>Time</th><th>Move</th>${ROLES.map((r) => `<th>${LABEL[r]}</th>`).join("")}</tr>
${rows}
</table></div>
${feelTable(p)}
</section>`;
  }).join("\n");
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)} · CHOIR8 count sheet</title>
<style>
:root{--bg:#f6f5f2;--fg:#1d1d1f;--mut:#6b6b70;--card:#fff;--line:#dedcd6;--warn:#a5530a;--acc:#3a4fa0}
@media (prefers-color-scheme:dark){:root{--bg:#141416;--fg:#ececef;--mut:#9a9aa2;--card:#1d1d21;--line:#2f2f35;--warn:#e3a35a;--acc:#9fb0f0}}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--fg);font:15px/1.45 -apple-system,system-ui,sans-serif}
main{max-width:1080px;margin:0 auto;padding:24px 16px 64px}h1{font-size:22px;margin:0 0 4px}h2{font-size:17px;margin:0 0 6px}
.mut{color:var(--mut);font-weight:400;font-size:14px}.cue{background:var(--card);border:1px solid var(--line);border-radius:8px;padding:14px 16px;margin:14px 0}
.wrap{overflow-x:auto}table{border-collapse:collapse;width:100%;min-width:720px;font-size:14px}td,th{border-top:1px solid var(--line);padding:6px;text-align:left;vertical-align:top}
.n{white-space:nowrap;font-variant-numeric:tabular-nums}.arrow{font-size:18px;color:var(--acc)}.hold{color:var(--mut)}.defer{color:var(--warn);font-weight:600}
.feel{margin-top:10px}.feel summary{cursor:pointer;font-weight:600}.rules{margin:6px 0 0;padding-left:20px}
</style></head><body><main>
<h1>${esc(title)}: CHOIR8 count sheet</h1>
<p class="mut">The beat says when; the role says how. One eight-count phrase from the song's own beat grid, expressed by a soloist, the choir, a breaker and a skater. Skaters' tricks stay one per chord change (D8-16).</p>
${opts.feelNote ? `<p class="mut">${esc(opts.feelNote)} Where the rhythm shifts, each dancer chooses which hit to land on${opts.variation !== undefined ? ` (variation ${opts.variation}; another number gives another set of choices under the same rules)` : ""}:</p>
<ol class="rules mut">${FLOW_RULES.map((r) => `<li>${esc(r)}</li>`).join("")}</ol>` : ""}
${sections}
</main></body></html>
`;
}
