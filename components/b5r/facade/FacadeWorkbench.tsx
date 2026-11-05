"use client";

/**
 * AIM-B5R Façade Intelligence workbench (FIS-Flat v0.2).
 *
 * Everything shown is computed by lib/b5r/facade from the project file in
 * memory: the page places modules only where canPlace() allows, records
 * gate reviews, and exports a hashed Decision Contract. Nothing is sent
 * anywhere: files are read and saved in the browser. No AI runs here
 * (GOV-14), and nothing reaches underwriting.
 */
import { useMemo, useState, type ChangeEvent } from "react";
import {
  CATALOGUE, CRITERIA, DRIVERS, FACADE_GATES, GATE_STATES, LIMITS, MODULE_IDS,
  buildContract, canPlace, cellById, evaluateProject, masksOf, moduleAt, recommend, validateProject, weightProblems,
  type FacadeGateId, type FacadeOption, type FacadeProject, type GateRecord, type GateState, type Issue, type ModuleId, type ReviewOutcome,
} from "@/lib/b5r/facade";
import { SYNTHETIC_PROJECT } from "@/lib/b5r/facade/fixture";
import ElevationSvg, { MASK_LETTER, MODULE_SWATCH, type Overlays } from "./ElevationSvg";
import ResidentView from "./ResidentView";
import WallSection from "./WallSection";
import s from "./facade.module.css";

type View = "elevation" | "sidewalk" | "street" | "resident" | "night" | "section";
const VIEWS: { id: View; label: string; caption: string }[] = [
  { id: "elevation", label: "Elevation", caption: "Straight-on schematic elevation. Pick a module, then a cell; or inspect a cell." },
  { id: "sidewalk", label: "Sidewalk 45°", caption: "The same elevation turned as if approaching along the sidewalk: a projection of the schematic, not a render." },
  { id: "street", label: "Street, eye level", caption: "Looking up from across the street: a projection of the schematic, not a render." },
  { id: "resident", label: "Resident window", caption: "The view out of one window, seated or standing. Pick a window cell on the elevation below." },
  { id: "night", label: "Night", caption: "Lit windows only: FIS-Flat has no façade lighting or displays (F7 is disabled), so nothing shines into bedrooms." },
  { id: "section", label: "Wall section", caption: "How a planar screen relates to the existing wall. Illustrative only." },
];
const TRANSFORM: Partial<Record<View, string>> = {
  sidewalk: "perspective(1100px) rotateY(-32deg)",
  street: "perspective(760px) rotateX(18deg)",
};
const OUTCOMES: { id: ReviewOutcome; label: string }[] = [
  { id: "accepted", label: "Accept the call" },
  { id: "revisions_requested", label: "Request revisions" },
  { id: "rejected", label: "Reject" },
];

const usd = (n: number | null) => (n === null ? "unknown" : `${n < 0 ? "−" : ""}$${Math.abs(Math.round(n)).toLocaleString("en-US")}`);
const clone = <T,>(x: T): T => JSON.parse(JSON.stringify(x)) as T;
const today = () => new Date().toISOString().slice(0, 10);

function download(name: string, data: unknown) {
  const blob = new Blob([`${JSON.stringify(data, null, 2)}\n`], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

interface GateForm {
  gate: FacadeGateId;
  state: GateState;
  reason: string;
  reviewer: string;
  date: string;
  sourceId: string;
  scope: "option" | "project";
}

export default function FacadeWorkbench() {
  const [project, setProject] = useState<FacadeProject>(() => clone(SYNTHETIC_PROJECT));
  const [edited, setEdited] = useState(false);
  const [optionId, setOptionId] = useState<string>(SYNTHETIC_PROJECT.options[0].id);
  const [tool, setTool] = useState<ModuleId | "inspect">("inspect");
  const [selected, setSelected] = useState<string | null>(null);
  const [view, setView] = useState<View>("elevation");
  const [posture, setPosture] = useState<"seated" | "standing">("standing");
  const [overlays, setOverlays] = useState<Overlays>({ masks: true, rooms: true, geometry: true, maintenance: false });
  const [msg, setMsg] = useState<{ ok: boolean | null; text: string }>({ ok: null, text: "Pick a module, then a cell. A protected cell refuses and says why." });
  const [loadIssues, setLoadIssues] = useState<Issue[] | null>(null);
  const [gateForm, setGateForm] = useState<GateForm | null>(null);
  const [just, setJust] = useState({ reason: "", sourceId: "" });
  const [review, setReview] = useState<{ reviewer: string; outcome: ReviewOutcome | ""; note: string }>({ reviewer: "", outcome: "", note: "" });
  const [sealed, setSealed] = useState<string | null>(null);

  const ev = useMemo(() => evaluateProject(project), [project]);
  const option = project.options.find((o) => o.id === optionId) ?? project.options[0];
  const oev = ev.options.find((o) => o.optionId === option?.id);
  const conflictCells = useMemo(() => new Set((oev?.conflicts ?? []).map((c) => c.cellId)), [oev]);
  const cell = selected ? cellById(project, selected) ?? null : null;
  const elevationId = project.elevations[0]?.id ?? "";
  const rec = useMemo(() => recommend(project, ev), [project, ev]);
  const synthetic = project.dataStatus === "SYNTHETIC" || project.dataStatus === "MOCK";
  const errors = ev.issues.filter((i) => i.severity === "error");
  const warnings = ev.issues.filter((i) => i.severity === "warning");

  const change = (fn: (p: FacadeProject) => FacadeProject) => {
    setProject(fn);
    setEdited(true);
    setSealed(null);
  };
  const changeOption = (fn: (o: FacadeOption) => FacadeOption) =>
    change((p) => ({ ...p, options: p.options.map((o) => (o.id === option.id ? fn(o) : o)) }));

  function onCell(cellId: string) {
    setSelected(cellId);
    setJust({ reason: "", sourceId: "" });
    if (tool === "inspect") { setMsg({ ok: null, text: `${cellId} selected.` }); return; }
    const c = cellById(project, cellId);
    if (!c) return;
    const r = canPlace(project, c, tool, option);
    if (!r.ok) { setMsg({ ok: false, text: `Refused ${tool} on ${cellId}. ${r.reason}.` }); return; }
    changeOption((o) => {
      const a = { ...o.assignments };
      if (tool === "F0") delete a[cellId];
      else a[cellId] = tool;
      return { ...o, assignments: a };
    });
    setMsg({ ok: true, text: `${tool} placed on ${cellId}.${r.notes.length ? ` ${r.notes.join(". ")}.` : ""}` });
  }

  function saveGate(f: GateForm) {
    const record: GateRecord = {
      gate: f.gate, state: f.state, reason: f.reason.trim(), reviewer: f.reviewer.trim(), date: f.date,
      sourceIds: f.sourceId ? [f.sourceId] : [], ...(f.scope === "option" ? { optionId: option.id } : {}),
    };
    change((p) => ({
      ...p,
      gateRecords: [...p.gateRecords.filter((r) => !(r.gate === f.gate && (f.scope === "option" ? r.optionId === option.id : r.optionId === undefined))), record],
    }));
    setGateForm(null);
  }
  function removeGate(gate: FacadeGateId, optionScoped: boolean) {
    change((p) => ({ ...p, gateRecords: p.gateRecords.filter((r) => !(r.gate === gate && (optionScoped ? r.optionId === option.id : r.optionId === undefined))) }));
  }

  async function exportContract() {
    const at = new Date().toISOString();
    const r = review.reviewer.trim() && review.outcome ? { reviewer: review.reviewer.trim(), outcome: review.outcome, note: review.note.trim(), at } : null;
    const c = await buildContract(project, ev, { generatedAt: at, review: r });
    download(`aim-fis-decision-${project.id}-r${project.revision}.json`, c);
    setSealed(c.sha256);
  }
  function exportProject() {
    const out = edited ? { ...project, revision: project.revision + 1 } : project;
    setProject(out);
    setEdited(false);
    download(`aim-fis-project-${out.id}-r${out.revision}.json`, out);
  }
  async function importProject(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    let issues: Issue[];
    let parsed: FacadeProject;
    try {
      parsed = JSON.parse(await file.text()) as FacadeProject;
      issues = validateProject(parsed);
    } catch (x) {
      setLoadIssues([{ severity: "error", where: file.name, message: `not a FIS project file (${x instanceof Error ? x.message : "unreadable"})` }]);
      return;
    }
    if (issues.some((i) => i.severity === "error")) { setLoadIssues(issues); return; }
    setProject(parsed);
    setOptionId(parsed.options[0].id);
    setSelected(null);
    setEdited(false);
    setSealed(null);
    setLoadIssues(issues.length ? issues : null);
    setMsg({ ok: true, text: `Loaded ${parsed.name} (revision ${parsed.revision}).` });
  }
  function reset() {
    setProject(clone(SYNTHETIC_PROJECT));
    setOptionId(SYNTHETIC_PROJECT.options[0].id);
    setSelected(null);
    setEdited(false);
    setSealed(null);
    setLoadIssues(null);
    setMsg({ ok: null, text: "Back to the synthetic fixture." });
  }

  if (!option || !oev || !elevationId) {
    return (
      <main className={s.page}><div className={s.wrap}>
        <p className={`${s.banner} ${s.err}`}><b>PROJECT FILE</b> has no elevation or no option. <button className={s.btn} onClick={reset}>Reset to the synthetic fixture</button></p>
      </div></main>
    );
  }

  const windowMask = cell ? masksOf(project, cell.id).find((m) => m.kind === "window") : undefined;
  const cellJust = cell ? option.justifications.find((j) => j.cellId === cell.id) : undefined;
  const weightIssues = weightProblems(project.weights);
  const weightSum = CRITERIA.reduce((t, c) => t + (Number(project.weights.values[c.id]) || 0), 0);
  const elevation = (
    <ElevationSvg project={project} elevationId={elevationId} option={option} conflictCells={conflictCells} selected={selected}
      night={view === "night"} overlays={overlays} onCell={onCell} />
  );

  return (
    <main className={s.page}>
      <div className={s.wrap}>
        <p className={s.kicker}>AIM-B5R · Façade Intelligence · FIS-Flat v0.2</p>
        <h1 className={s.h1}>Façade <span>Intelligence</span></h1>
        <p className={s.sub}>Every cell of the wall is checked against windows, exits, utilities, historic fabric and maintenance access, then seven hard gates. Preference scores come after and never change a call.</p>
        <p className={s.rule}>Program → Constraints → Performance → Geometry → Material → Expression</p>

        <p className={s.banner}>
          <b>{project.dataStatus}</b>{" "}
          {synthetic
            ? "Software fixture: not a real building, parcel or employer site. Nothing is priced, surveyed or reviewed, so no option can EXECUTE. "
            : "Project file loaded in this browser only. "}
          Drawings are schematic (AI_CONCEPT). EXECUTE would mean licensed design next, never construction approval.
        </p>
        {(errors.length > 0 || warnings.length > 0) && (
          <div className={`${s.banner} ${errors.length ? s.err : ""}`} role="status">
            <b>{errors.length ? "PROJECT FILE ERRORS" : "WARNINGS"}</b>
            <ul className={s.reasons}>{[...errors, ...warnings].slice(0, 12).map((i, k) => <li key={k}>{i.where}: {i.message}</li>)}</ul>
          </div>
        )}
        {loadIssues && (
          <div className={`${s.banner} ${loadIssues.some((i) => i.severity === "error") ? s.err : ""}`} role="alert">
            <b>{loadIssues.some((i) => i.severity === "error") ? "FILE NOT LOADED" : "LOADED WITH WARNINGS"}</b>
            <ul className={s.reasons}>{loadIssues.slice(0, 12).map((i, k) => <li key={k}>{i.where}: {i.message}</li>)}</ul>
          </div>
        )}

        <div className={s.bar} role="group" aria-label="Options">
          <span className={s.label}>Option</span>
          <div className={s.tabs}>
            {ev.options.map((o) => (
              <button key={o.optionId} className={s.tab} aria-pressed={o.optionId === option.id} onClick={() => { setOptionId(o.optionId); setGateForm(null); }}>
                {o.name} <span className={`${s.chip} ${s[o.call]}`}>{o.call}</span>
              </button>
            ))}
          </div>
        </div>

        <div className={s.layout}>
          <div className={s.stack}>
            <section className={s.panel} aria-labelledby="fis-view">
              <h2 id="fis-view">{project.elevations[0].name} · {option.name}</h2>
              <div className={s.tabs} role="group" aria-label="Viewpoint">
                {VIEWS.map((v) => <button key={v.id} className={s.tab} aria-pressed={view === v.id} onClick={() => setView(v.id)}>{v.label}</button>)}
              </div>
              <div className={s.stage} style={{ marginTop: 10 }}>
                {view === "section" ? <WallSection /> : view === "resident" ? (
                  <>
                    <ResidentView project={project} cell={cell} option={option} posture={posture} night={false} />
                    <div className={s.row} style={{ margin: "8px 0" }}>
                      {(["standing", "seated"] as const).map((p) => <button key={p} className={s.tab} aria-pressed={posture === p} onClick={() => setPosture(p)}>{p}</button>)}
                    </div>
                    {elevation}
                  </>
                ) : (
                  <div style={{ transform: TRANSFORM[view], transformOrigin: view === "street" ? "50% 100%" : "0 50%" }}>{elevation}</div>
                )}
              </div>
              <p className={s.caption}>{VIEWS.find((v) => v.id === view)?.caption}</p>
              {view !== "section" && (
                <>
                  <div className={s.palette} role="group" aria-label="Module to place">
                    <button className={s.tool} aria-pressed={tool === "inspect"} onClick={() => setTool("inspect")}>Inspect</button>
                    {CATALOGUE.map((m) => (
                      <button key={m.id} className={s.tool} aria-pressed={tool === m.id} aria-disabled={m.status === "disabled"}
                        title={`${m.purpose}. Eligible: ${m.eligible}. ${m.procurement}.`}
                        onClick={() => (m.status === "disabled" ? setMsg({ ok: false, text: `${m.id} ${m.name} is disabled: ${m.procurement}.` }) : setTool(m.id))}>
                        <span className={s.swatch} style={{ background: MODULE_SWATCH[m.id] }} />{m.id} {m.name}{m.status !== "available" ? ` (${m.status})` : ""}
                      </button>
                    ))}
                  </div>
                  <p className={`${s.msg} ${msg.ok === true ? s.msgOk : msg.ok === false ? s.msgNo : ""}`} role="status" aria-live="polite">{msg.text}</p>
                  <div className={s.toggles} role="group" aria-label="Overlays">
                    {([["masks", "Protected masks"], ["rooms", "Room use"], ["geometry", "Survey state"], ["maintenance", "Maintenance access"]] as const).map(([k, l]) => (
                      <label key={k}><input type="checkbox" checked={overlays[k]} onChange={(e) => setOverlays({ ...overlays, [k]: e.target.checked })} />{l}</label>
                    ))}
                    <label title="Needs a validated solar workflow (study S3); not run"><input type="checkbox" disabled />Daylight (not modeled)</label>
                  </div>
                  <div className={s.legend} aria-label="Legend">
                    {Object.entries(MASK_LETTER).map(([k, l]) => <span key={k}><b className={s.mono}>{l}</b>{k.replace("_", " ")}</span>)}
                    <span><b className={s.mono}>SV</b>survey-verified</span>
                    <span><b className={s.mono}>▨</b>needs survey</span>
                    <span><b className={s.mono} style={{ color: "#E92AD6" }}>▢</b>breaks a rule</span>
                  </div>
                </>
              )}
            </section>

            <section className={s.panel} aria-labelledby="fis-gates">
              <h2 id="fis-gates">Hard gates · {option.name}</h2>
              <p className={`${s.small} ${s.muted}`} style={{ marginTop: 0 }}>A missing review is UNKNOWN, and an UNKNOWN blocks. PASS needs a named reviewer and a real source; FG1–FG3 need a licensed professional.</p>
              <table className={s.table}>
                <thead><tr><th>Gate</th><th>State</th><th>Why</th></tr></thead>
                <tbody>
                  {oev.gates.map((g) => {
                    const def = FACADE_GATES.find((d) => d.id === g.gate);
                    return (
                      <tr key={g.gate}>
                        <td><b>{g.gate}</b> {g.name}{g.triggeredBy.length > 0 && <div className={`${s.small} ${s.muted}`}>by {g.triggeredBy.join(", ")}</div>}</td>
                        <td><span className={`${s.chip} ${s[g.state]}`}>{g.state === "NOT_APPLICABLE" ? "N/A" : g.state}</span></td>
                        <td>
                          <ul className={s.reasons} style={{ margin: 0 }}>{g.reasons.slice(0, 4).map((r, k) => <li key={k}>{r}</li>)}{g.reasons.length > 4 && <li>…and {g.reasons.length - 4} more</li>}</ul>
                          <div className={`${s.small} ${s.muted}`}>Stops on: {def?.stop}</div>
                          <div className={s.row} style={{ marginTop: 4 }}>
                            <button className={`${s.btn} ${s.ghost}`} onClick={() => setGateForm({ gate: g.gate, state: g.record?.state ?? "UNKNOWN", reason: g.record?.reason ?? "", reviewer: g.record?.reviewer ?? "", date: today(), sourceId: g.record?.sourceIds[0] ?? "", scope: g.record?.optionId ? "option" : "project" })}>Record review</button>
                            {g.record && <button className={`${s.btn} ${s.ghost}`} onClick={() => removeGate(g.gate, g.record?.optionId !== undefined)}>Remove record</button>}
                          </div>
                          {gateForm?.gate === g.gate && (
                            <form className={s.form} onSubmit={(e) => { e.preventDefault(); saveGate(gateForm); }}>
                              <label>State<select value={gateForm.state} onChange={(e) => setGateForm({ ...gateForm, state: e.target.value as GateState })}>{GATE_STATES.map((x) => <option key={x}>{x}</option>)}</select></label>
                              <label>Reason (what was checked, or why it does not apply)<textarea rows={2} value={gateForm.reason} onChange={(e) => setGateForm({ ...gateForm, reason: e.target.value })} /></label>
                              <label>Reviewer{def?.professional ? " (licensed professional)" : ""}<input value={gateForm.reviewer} onChange={(e) => setGateForm({ ...gateForm, reviewer: e.target.value })} /></label>
                              <label>Date<input type="date" value={gateForm.date} onChange={(e) => setGateForm({ ...gateForm, date: e.target.value })} /></label>
                              <label>Source<select value={gateForm.sourceId} onChange={(e) => setGateForm({ ...gateForm, sourceId: e.target.value })}><option value="">(none)</option>{project.sources.map((x) => <option key={x.id} value={x.id}>{x.title} [{x.type}]</option>)}</select></label>
                              <label>Covers<select value={gateForm.scope} onChange={(e) => setGateForm({ ...gateForm, scope: e.target.value as GateForm["scope"] })}><option value="option">This option only</option><option value="project">Every option</option></select></label>
                              <div className={s.row}><button type="submit" className={`${s.btn} ${s.primary}`}>Save review</button><button type="button" className={s.btn} onClick={() => setGateForm(null)}>Cancel</button></div>
                            </form>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </section>
          </div>

          <div className={s.stack}>
            <section className={s.panel} aria-labelledby="fis-cell">
              <h2 id="fis-cell">Cell</h2>
              {!cell ? <p className={`${s.small} ${s.muted}`}>Select a cell on the elevation (Inspect, or click any cell).</p> : (
                <>
                  <dl className={s.kv}>
                    <dt>Cell</dt><dd className={s.mono}>{cell.id} · floor {cell.floor}, bay {cell.bay}</dd>
                    <dt>Room behind</dt><dd>{cell.roomUse.replace("_", " ")}</dd>
                    <dt>Geometry</dt><dd><span className={`${s.chip} ${cell.geometryState === "SURVEY_VERIFIED" ? s.PASS : cell.geometryState === "FIELD_OBSERVED" ? s.provisional : s.UNKNOWN}`}>{cell.geometryState.replace("_", " ")}</span></dd>
                    <dt>Module</dt><dd>{moduleAt(option, cell.id)} {CATALOGUE.find((m) => m.id === moduleAt(option, cell.id))?.name}</dd>
                    {cell.note && <><dt>Note</dt><dd>{cell.note}</dd></>}
                  </dl>
                  <h3>Protected masks</h3>
                  {masksOf(project, cell.id).length === 0 ? <p className={`${s.small} ${s.muted}`}>None: solid wall.</p> : (
                    <ul className={s.reasons}>{masksOf(project, cell.id).map((m) => <li key={m.id}><b className={s.mono}>{MASK_LETTER[m.kind]}</b> {m.kind.replace("_", " ")} · <span className={s[m.state]}>{m.state}</span>{m.note ? ` · ${m.note}` : ""}</li>)}</ul>
                  )}
                  <h3>What can go here ({option.name.split(" · ")[0]})</h3>
                  <ul className={s.reasons}>
                    {MODULE_IDS.map((id) => {
                      const r = canPlace(project, cell, id, option);
                      return <li key={id}>{r.ok ? "✓" : "✗"} <b>{id}</b>{r.ok ? (r.notes.length ? `: ${r.notes.join("; ")}` : "") : `: ${r.reason}`}</li>;
                    })}
                  </ul>
                  {windowMask && (
                    <>
                      <h3>Window screen justification</h3>
                      {cellJust ? (
                        <div className={s.small}>
                          <p style={{ margin: "0 0 6px" }}>{cellJust.reason} <span className={s.muted}>({cellJust.sourceIds.join(", ")})</span></p>
                          <button className={`${s.btn} ${s.ghost}`} onClick={() => changeOption((o) => ({ ...o, justifications: o.justifications.filter((j) => j.cellId !== cell.id) }))}>Remove justification</button>
                        </div>
                      ) : (
                        <form className={s.form} onSubmit={(e) => {
                          e.preventDefault();
                          if (!just.reason.trim() || !just.sourceId) { setMsg({ ok: false, text: "A justification needs a written reason and a source." }); return; }
                          changeOption((o) => ({ ...o, justifications: [...o.justifications, { cellId: cell.id, maskKind: "window", reason: just.reason.trim(), sourceIds: [just.sourceId] }] }));
                          setJust({ reason: "", sourceId: "" });
                          setMsg({ ok: true, text: `Justification saved for ${cell.id}; F3 can now be placed there, and FG4 must review it.` });
                        }}>
                          <label>Why screen this window (sun, privacy, tested product)<textarea rows={2} value={just.reason} onChange={(e) => setJust({ ...just, reason: e.target.value })} /></label>
                          <label>Source<select value={just.sourceId} onChange={(e) => setJust({ ...just, sourceId: e.target.value })}><option value="">(choose)</option>{project.sources.map((x) => <option key={x.id} value={x.id}>{x.title} [{x.type}]</option>)}</select></label>
                          <button type="submit" className={s.btn}>Save justification</button>
                        </form>
                      )}
                    </>
                  )}
                  <h3>Design drivers</h3>
                  <table className={s.table}>
                    <tbody>
                      {DRIVERS.map((d) => {
                        const v = cell.drivers[d.id] ?? project.drivers[d.id];
                        return <tr key={d.id}><td>{d.label}</td><td>{v ? <>{v.value} <span className={`${s.chip} ${s[v.state]}`}>{v.state}</span></> : <span className={`${s.chip} ${s.missing}`}>missing</span>}</td></tr>;
                      })}
                    </tbody>
                  </table>
                  <h3>Sources</h3>
                  <ul className={s.reasons}>{cell.sourceIds.map((id) => { const x = project.sources.find((q) => q.id === id); return <li key={id}>{x ? `${x.title} · ${x.type} · permission ${x.permission}` : id}</li>; })}</ul>
                </>
              )}
            </section>

            <section className={s.panel} aria-labelledby="fis-decision">
              <h2 id="fis-decision">Decision</h2>
              <div className={s.cards}>
                {ev.options.map((o) => {
                  const r = ev.ranking.findIndex((x) => x.optionId === o.optionId);
                  return (
                    <button key={o.optionId} className={s.card} aria-pressed={o.optionId === option.id} onClick={() => setOptionId(o.optionId)}>
                      <span className={`${s.chip} ${s[o.call]}`}>{o.call}</span>
                      <strong>{o.name}</strong>
                      <span className={s.muted}>{o.maturity}</span><br />
                      Score {o.score.total ?? "—"}{r >= 0 ? ` · rank ${r + 1}` : o.call === "KILL" ? " · not ranked" : ""}<br />
                      Windows clear {o.windows.clear}/{o.windows.residentWindows}<br />
                      C_total {usd(o.capital.cTotal)}
                    </button>
                  );
                })}
              </div>
              <h3>Why {oev.call}</h3>
              <ul className={s.reasons}>{oev.reasons.slice(0, 10).map((r, k) => <li key={k}>{r}</li>)}{oev.reasons.length > 10 && <li>…and {oev.reasons.length - 10} more (see the contract)</li>}</ul>
              <h3>Capital (verified figures only)</h3>
              <dl className={s.kv}>
                <dt>C_total</dt><dd>{usd(oev.capital.cTotal)}</dd>
                <dt>Required work</dt><dd>{usd(oev.capital.cRequiredWork)}</dd>
                <dt>Contingency</dt><dd>{usd(oev.capital.cContingency)}</dd>
                <dt>B_approved</dt><dd>{usd(oev.capital.bApproved)}</dd>
                <dt>B_optional</dt><dd>{usd(oev.capital.bOptional)}</dd>
                <dt>Annual net benefit</dt><dd>{usd(oev.capital.annualNetBenefit)}</dd>
                <dt>NPV</dt><dd>{usd(oev.capital.npv)}</dd>
              </dl>
              {oev.capital.unpriced.length > 0 && <><p className={`${s.small} ${s.muted}`} style={{ margin: "8px 0 0" }}>Unknown because:</p><ul className={s.reasons}>{oev.capital.unpriced.slice(0, 6).map((u, k) => <li key={k}>{u}</li>)}{oev.capital.unpriced.length > 6 && <li>…and {oev.capital.unpriced.length - 6} more</li>}</ul></>}
              {oev.capital.excluded.length > 0 && <><p className={`${s.small} ${s.muted}`} style={{ margin: "8px 0 0" }}>Left out of every sum:</p><ul className={s.reasons}>{oev.capital.excluded.map((x) => <li key={x.id}>{x.label}: {x.why}</li>)}</ul></>}
              {oev.capital.nonFinancial.length > 0 && <><p className={`${s.small} ${s.muted}`} style={{ margin: "8px 0 0" }}>Non-financial (no dollar value given):</p><ul className={s.reasons}>{oev.capital.nonFinancial.map((x, k) => <li key={k}>{x}</li>)}</ul></>}
              <h3>Preference score{option.scores ? ` · by ${option.scores.scoredBy}` : ""}</h3>
              <table className={s.table}>
                <thead><tr><th>Criterion</th><th>0–5</th><th>Weight</th><th>Points</th></tr></thead>
                <tbody>{oev.score.parts.map((p) => <tr key={p.criterion}><td>{p.label}{p.note && <div className={`${s.small} ${s.muted}`}>{p.note}</div>}</td><td>{p.value ?? "—"}</td><td>{p.weight}</td><td>{p.points ?? "—"}</td></tr>)}</tbody>
              </table>
              {option.scores?.basis && <p className={`${s.small} ${s.muted}`}>{option.scores.basis}</p>}
              <h3>Weights (editable; must sum to 100)</h3>
              <div className={s.weights}>
                {CRITERIA.map((c) => (
                  <label key={c.id} style={{ display: "contents" }}>
                    <span>{c.label}</span>
                    <input type="number" min={0} max={100} step={1} value={project.weights.values[c.id]} aria-label={`${c.label} weight`}
                      onChange={(e) => change((p) => ({ ...p, weights: { ...p.weights, values: { ...p.weights.values, [c.id]: Number(e.target.value) } } }))} />
                  </label>
                ))}
              </div>
              <div className={s.form}>
                <label>Weights chosen by<input value={project.weights.chosenBy} onChange={(e) => change((p) => ({ ...p, weights: { ...p.weights, chosenBy: e.target.value } }))} /></label>
              </div>
              <p className={`${s.small} ${weightIssues.length ? "" : s.muted}`}>Sum {weightSum}{weightIssues.length ? ` · ${weightIssues.join("; ")}` : ""}</p>
              <p className={`${s.small} ${s.muted}`}>
                Sensitivity (each weight ±5): {ev.sensitivity.leader === null ? "no fully scored option" : ev.sensitivity.stable ? `the leader stays ${ev.sensitivity.leader}` : `the leader changes: ${ev.sensitivity.checks.filter((c) => c.leader !== ev.sensitivity.leader).map((c) => `${c.criterion} ${c.delta > 0 ? "+" : ""}${c.delta} → ${c.leader}`).join(", ")}`}
              </p>
              {rec && (
                <>
                  <h3>Carry forward</h3>
                  <p className={s.small} style={{ margin: 0 }}><b>{ev.options.find((o) => o.optionId === rec.optionId)?.name}</b> <span className={`${s.chip} ${s[rec.call]}`}>{rec.call}</span> {rec.why}</p>
                  <ul className={s.reasons}>{rec.nextEvidence.map((n, k) => <li key={k}>{n}</li>)}</ul>
                </>
              )}
            </section>

            <section className={s.panel} aria-labelledby="fis-contract">
              <h2 id="fis-contract">Decision contract and files</h2>
              <div className={s.form} style={{ marginTop: 0 }}>
                <label>Human reviewer<input value={review.reviewer} onChange={(e) => setReview({ ...review, reviewer: e.target.value })} /></label>
                <label>Review<select value={review.outcome} onChange={(e) => setReview({ ...review, outcome: e.target.value as ReviewOutcome | "" })}><option value="">Not reviewed yet</option>{OUTCOMES.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}</select></label>
                <label>Note<textarea rows={2} value={review.note} onChange={(e) => setReview({ ...review, note: e.target.value })} /></label>
              </div>
              <p className={`${s.small} ${s.muted}`}>The review is recorded beside the calls; it never changes them.</p>
              <div className={s.row}>
                <button className={`${s.btn} ${s.primary}`} onClick={exportContract}>Download decision contract</button>
                <button className={s.btn} onClick={exportProject}>Download project file{edited ? " (edited)" : ""}</button>
                <label className={s.btn} style={{ display: "inline-block" }}>Load project file<input type="file" accept="application/json,.json" className={s.vh} onChange={importProject} /></label>
                <button className={`${s.btn} ${s.ghost}`} onClick={reset}>Reset to fixture</button>
              </div>
              {sealed && <p className={`${s.small} ${s.mono}`}>Sealed: sha256 {sealed.slice(0, 16)}…</p>}
              <p className={`${s.small} ${s.muted}`}>Files stay in this browser. Contract {`aim-fis-decision-1`}, project revision {project.revision}{edited ? " (edited, not saved)" : ""}.</p>
            </section>
          </div>
        </div>

        <footer className={s.foot}>
          <ul className={s.reasons}>{LIMITS.map((l) => <li key={l}>{l}</li>)}</ul>
          <p>Source: AIM-B5R Façade Intelligence System Complete Study v1.0 (3 Nov 2026), a research draft. Rules, audit and what is still proposed: docs/aim-b5r/FACADE_INTELLIGENCE.md.</p>
        </footer>
      </div>
    </main>
  );
}
