// lib/b5r/screen/report.ts
//
// Turns validated observations into the screen report. Every gate, label,
// order and next step here is fixed code (GOV-14): the model's words appear
// only as quoted observations, each tied to its photos. A photo screen is the
// first look of ASSESS (B5R-01). It holds no money, scores nothing (B5R-05)
// and passes no gate: every gate stays HOLD until its own evidence exists
// (dataset contract G0-G6; missing evidence is HOLD, never FAIL). Pure.

import { EVIDENCE_AXES } from "../../canon/vocab";
import { HAZARDS, OPPORTUNITY_STEPS, type Observations, type OpportunityStep, type SetAside } from "./contract";

export const SCREEN_VERSION = "aim-b5r-photo-screen-1";

export interface PhotoRecord {
  n: number;
  /** The original file name (no folders). */
  original: string;
  /** SHA-256 of the original file. */
  sha256: string;
  /** The resized copy sent to the model, relative to the report. */
  file: string;
  width: number;
  height: number;
}

export interface ScreenMeta {
  title: string;
  createdAt: string;
  intent: string | null;
  model: string;
  usage: { inputTokens: number; outputTokens: number } | null;
  costUsd: number | null;
  priceSource: string;
  photos: PhotoRecord[];
}

export interface GateRow {
  gate: string;
  question: string;
  status: (typeof EVIDENCE_AXES.gateOutcome)[number];
  why: string;
  next: string[];
}

export interface ScreenReport {
  version: typeof SCREEN_VERSION;
  meta: ScreenMeta;
  scene: Observations["scene"];
  building: Observations["building"];
  photos: Observations["photos"];
  keep: (Observations["features"][number] & { state: string })[];
  conditions: (Observations["conditions"][number] & { state: string })[];
  hazards: (Observations["hazards"][number] & { state: string; gate: string; next: string })[];
  /** In ladder order, least intervention first (B5R-18); each a concept to investigate. */
  opportunities: { step: OpportunityStep; items: (Observations["opportunities"][number] & { state: string; proof: string })[] }[];
  limits: string[];
  gates: GateRow[];
  notices: string[];
  setAside: SetAside[];
  peopleOrPlatesVisible: boolean;
}

/** OBSERVED or INFERRED, from the canon's truth hierarchy. */
const stateOf = (basis: "observed" | "inferred") => (basis === "observed" ? EVIDENCE_AXES.truthHierarchy[0] : EVIDENCE_AXES.truthHierarchy[1]);

export function buildReport(obs: Observations, setAside: SetAside[], meta: ScreenMeta): ScreenReport {
  const hazards = obs.hazards.map((h) => ({ ...h, state: stateOf(h.basis), gate: HAZARDS[h.code].gate, next: HAZARDS[h.code].next }));
  const forGate = (g: string) => [...new Set(hazards.filter((h) => h.gate === g).map((h) => h.next))];
  const majors = obs.conditions.filter((c) => c.severity === "major").length;
  const gates: GateRow[] = [
    { gate: "G0 Identity", question: "Is this parcel real and in scope?", status: "HOLD", why: "Photos can't establish the parcel (B5R-06).", next: ["Official APN, county and city boundary, and a situs match (the Phase 1 gate)."] },
    { gate: "G1 Entitlement and residents", question: "Is the use legal, and who is protected?", status: "HOLD", why: "Zoning, legal units and residents' protections aren't visible in photos.", next: ["Zoning, legal unit count and permit history. Hotel rooms are not dwelling units; for an SRO, its resident evidence comes first (HOLD_SRO)."] },
    { gate: "G2 Hazards and insurance", question: "Is it insurable and safe?", status: "HOLD", why: hazards.some((h) => h.gate === "G2") ? "The photos raise site hazards to check." : "No parcel hazard extracts yet.", next: [...forGate("G2"), "FEMA, CGS and CAL FIRE parcel extracts and a written insurance indication."] },
    { gate: "G3 Infrastructure", question: "Can it be served?", status: "HOLD", why: "Services aren't visible in photos.", next: [...forGate("G3"), "Sewer will-serve or OWTS approval, water and stormwater."] },
    { gate: "G4 Structure and capex", question: "What will it really cost?", status: "HOLD", why: majors ? `${majors} major condition issue(s) seen; costs need licensed reports.` : "Costs need licensed reports and written bids.", next: [...forGate("G4"), "Licensed condition reports and written bids before any cost is used."] },
    { gate: "G5 Economics", question: "Does it pencil on real inputs?", status: "HOLD", why: "A photo screen holds no money figures (GOV-17).", next: ["A rent roll or supported rents, lender terms and operating costs, run through the underwriting engine."] },
    { gate: "G6 Approval", question: "Will the owner commit?", status: "HOLD", why: "Nothing to decide until G0 to G5 have evidence.", next: ["The owner's signed buy, conditional, no-buy or hold, with reasons."] },
  ];
  const proof = EVIDENCE_AXES.proofTag[0]; // CONCEPTUAL
  const opportunities = OPPORTUNITY_STEPS
    .map((step) => ({ step, items: obs.opportunities.filter((o) => o.step === step).map((o) => ({ ...o, state: stateOf(o.basis), proof })) }))
    .filter((g) => g.items.length);
  const notices = [
    "A first look from photos (ASSESS, B5R-01): every opportunity is a concept to investigate, not a plan, a price or a score (B5R-05).",
    "Missing evidence is HOLD, never FAIL. Every gate below is HOLD until its own evidence exists.",
    "Adaptive reuse is the default: the least intervention that meets the decision contract comes first (B5R-18). AIM-B5R is residential only (B5R-33).",
    "The model described the photos; this report's gates, labels and order are fixed code (GOV-14).",
    ...(obs.peopleOrPlatesVisible ? ["People or licence plates are visible in at least one photo: crop or blur them before sharing this report."] : []),
  ];
  return {
    version: SCREEN_VERSION, meta, scene: obs.scene, building: obs.building, photos: obs.photos,
    keep: obs.features.map((f) => ({ ...f, state: stateOf(f.basis) })),
    conditions: obs.conditions.map((c) => ({ ...c, state: stateOf(c.basis) })),
    hazards, opportunities, limits: obs.limits, gates, notices, setAside, peopleOrPlatesVisible: obs.peopleOrPlatesVisible,
  };
}

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const cites = (ns: number[]) => ns.map((n) => `<a href="#p${n}">${n}</a>`).join(", ");

/** The report as one local page: photos, gates, then what to keep, fix and investigate. All model text is escaped. */
export function reportHtml(r: ScreenReport): string {
  const m = r.meta;
  const tag = (t: string) => `<span class="tag t-${esc(t.toLowerCase())}">${esc(t)}</span>`;
  const list = <T,>(items: T[], row: (x: T) => string, empty: string) => (items.length ? `<ul>${items.map((x) => `<li>${row(x)}</li>`).join("")}</ul>` : `<p class="mut">${empty}</p>`);
  const b = r.building;
  const facts = b ? [
    b.storiesVisible !== null ? `${b.storiesVisible} stor${b.storiesVisible === 1 ? "y" : "ies"} visible` : null,
    b.construction, b.apparentUse ? `apparent use: ${b.apparentUse}` : null, b.apparentEra,
  ].filter((x): x is string => !!x) : [];
  const cost = m.usage ? `${m.usage.inputTokens.toLocaleString("en-US")} input and ${m.usage.outputTokens.toLocaleString("en-US")} output tokens${m.costUsd !== null ? `, about $${m.costUsd.toFixed(2)}` : ""}` : "not sent (dry run)";
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(m.title)} · AIM-B5R photo screen</title>
<style>
:root{--bg:#f5f6f8;--fg:#1b243d;--mut:#5c6478;--card:#fff;--line:#dfe2e8;--hold:#a5530a;--acc:#1b7f8c}
@media (prefers-color-scheme:dark){:root{--bg:#0f1420;--fg:#e9ebef;--mut:#9aa1b2;--card:#171e2e;--line:#2a3348;--hold:#e3a35a;--acc:#3ddce8}}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--fg);font:15px/1.5 -apple-system,system-ui,sans-serif}
main{max-width:980px;margin:0 auto;padding:24px 16px 64px}h1{font-size:22px;margin:0 0 4px}h2{font-size:17px;margin:28px 0 8px}
.mut{color:var(--mut)}.card{background:var(--card);border:1px solid var(--line);border-radius:8px;padding:12px 16px;margin:10px 0}
.notice{border-left:4px solid var(--hold)}ul{padding-left:20px;margin:6px 0}li{margin:4px 0}
.tag{font-size:11px;letter-spacing:.04em;padding:1px 7px;border-radius:10px;border:1px solid var(--line);margin-left:6px;white-space:nowrap}
.t-hold{color:var(--hold);border-color:var(--hold)}.t-observed{color:var(--acc);border-color:var(--acc)}
table{width:100%;border-collapse:collapse;font-size:14px}td,th{border-top:1px solid var(--line);padding:8px 6px;text-align:left;vertical-align:top}
.photos{display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:10px}.photos figure{margin:0}
.photos img{width:100%;height:auto;border-radius:6px;border:1px solid var(--line)}figcaption{font-size:12px;color:var(--mut)}
a{color:var(--acc)}td,li,figcaption,p{overflow-wrap:anywhere}
</style></head><body><main>
<h1>${esc(m.title)}</h1>
<p class="mut">AIM-B5R photo screen · ${esc(m.createdAt.slice(0, 10))} · ${m.photos.length} photo${m.photos.length === 1 ? "" : "s"}${m.intent ? ` · intent: ${esc(m.intent)}` : ""}</p>
<div class="card notice">${r.notices.map((n) => `<p>${esc(n)}</p>`).join("")}</div>

<h2>What the photos show</h2>
<div class="card"><p>${esc(r.scene.summary)}</p>${facts.length ? `<p class="mut">${esc(facts.join(" · "))}</p>` : ""}</div>
<div class="photos">${m.photos.map((p) => {
    const said = r.photos.find((x) => x.photo === p.n)?.shows;
    return `<figure id="p${p.n}"><img src="${esc(p.file)}" alt="Photo ${p.n}"><figcaption><b>${p.n}</b> ${esc(p.original)}${said ? `: ${esc(said)}` : ""}</figcaption></figure>`;
  }).join("")}</div>

<h2>Gates</h2>
<div class="card"><table><tr><th>Gate</th><th>Status</th><th>Why</th><th>Next evidence</th></tr>
${r.gates.map((g) => `<tr><td><b>${esc(g.gate)}</b><br><span class="mut">${esc(g.question)}</span></td><td>${tag(g.status)}</td><td>${esc(g.why)}</td><td>${list(g.next, (x) => esc(x), "")}</td></tr>`).join("\n")}
</table></div>

<h2>Safety and hazards to check</h2>
<div class="card">${list(r.hazards, (h) => `${esc(h.note || h.code.replace(/_/g, " "))}${tag(h.state)} <span class="mut">(photos ${cites(h.photos)}; ${esc(h.gate)})</span><br>Next: ${esc(h.next)}`, "None raised by the photos. That is not a clearance: the gates above still need their evidence.")}</div>

<h2>Worth keeping</h2>
<div class="card">${list(r.keep, (f) => `${esc(f.what)}${tag(f.state)} <span class="mut">(photos ${cites(f.photos)})</span>`, "Nothing named.")}</div>

<h2>Condition</h2>
<div class="card">${list(r.conditions, (c) => `${esc(c.what)} <span class="mut">(${esc(c.severity)}; photos ${cites(c.photos)})</span>${tag(c.state)}`, "No condition issues named.")}</div>

<h2>Development potential: ideas to investigate</h2>
<p class="mut">Least intervention first. Each is ${esc(EVIDENCE_AXES.proofTag[0])}: an idea tied to the photos, with no cost, value or return.</p>
${r.opportunities.length ? r.opportunities.map((g) => `<div class="card"><b>${esc(g.step)}</b>${list(g.items, (o) => `<b>${esc(o.title)}</b>${tag(o.proof)}${tag(o.state)}<br>${esc(o.why)} <span class="mut">(photos ${cites(o.photos)})</span>`, "")}</div>`).join("\n") : `<div class="card"><p class="mut">No ideas the photos support.</p></div>`}

<h2>What the photos can't show</h2>
<div class="card">${list(r.limits, (l) => esc(l), "Not stated.")}</div>
${r.setAside.length ? `<h2>Set aside</h2><div class="card"><p class="mut">The model said these, and the screen's rules kept them out:</p>${list(r.setAside, (s) => `${esc(s.text)} <span class="mut">(${esc(s.where)}: ${esc(s.reason)})</span>`, "")}</div>` : ""}

<p class="mut">Model ${esc(m.model)}: ${esc(cost)}. Prices: ${esc(m.priceSource)}. Photos were resized and their location data removed before sending. Report ${esc(r.version)}.</p>
</main></body></html>
`;
}
