/**
 * PROJECT_STATE (canon GOV-18): a machine-derived snapshot of the repo, so a
 * person or an agent reads the current state instead of stale prompt text.
 *
 * Built only from files in the repo and the canon data: framework versions,
 * module versions, routes and who can reach them, environment variable NAMES
 * (never values), migrations and RLS, npm scripts, canon build status and the
 * AIM-B5R pilot gates. Deterministic: no clock, no network, no secrets, so
 * tests/projectState.test.ts can fail when docs/PROJECT_STATE.md is stale.
 *
 * Regenerate: npm run state (or UPDATE_GOLDEN=1 on that test).
 */
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { CANON_REGISTER, CANON_VERSION, STUDIES } from "../canon";

const posix = (p: string) => p.split("\\").join("/");

function walk(root: string, dir: string, keep: (rel: string) => boolean, out: string[] = []): string[] {
  const abs = join(root, dir);
  if (!existsSync(abs)) return out;
  for (const name of readdirSync(abs).sort()) {
    if (name === "node_modules" || name.startsWith(".")) continue;
    const rel = posix(join(dir, name));
    if (statSync(join(root, rel)).isDirectory()) walk(root, rel, keep, out);
    else if (keep(rel)) out.push(rel);
  }
  return out;
}

const read = (root: string, rel: string) => readFileSync(join(root, rel), "utf8");
const cell = (s: string) => s.replace(/\|/g, "\\|");

/** URL path of an app-router file: route groups dropped, dynamic segments kept. */
export function routePath(rel: string): string {
  const parts = rel.replace(/^app\//, "").split("/").slice(0, -1).filter((p) => !/^\(.*\)$/.test(p));
  return `/${parts.join("/")}`;
}

/** Environment variable names the code reads, and which top-level folders read them. */
export function envNames(root: string): Map<string, Set<string>> {
  const files = ["app", "lib", "scripts", "components"].flatMap((d) => walk(root, d, (r) => /\.(ts|tsx|js|jsx|mjs)$/.test(r)));
  if (existsSync(join(root, "proxy.ts"))) files.push("proxy.ts");
  const out = new Map<string, Set<string>>();
  const add = (name: string, rel: string) => {
    const area = rel.includes("/") ? rel.split("/").slice(0, 2).join("/") : rel;
    out.set(name, new Set([...(out.get(name) ?? []), area]));
  };
  for (const rel of files) {
    const text = read(root, rel);
    for (const m of text.matchAll(/process\.env\.([A-Z][A-Z0-9_]+)|process\.env\[\s*["']([A-Z][A-Z0-9_]+)["']\s*\]/g)) add(m[1] ?? m[2], rel);
    for (const m of text.matchAll(/\b[A-Z0-9_]*_ENV\s*=\s*"([A-Z][A-Z0-9_]+)"/g)) add(m[1], rel);
  }
  return new Map([...out].sort(([a], [b]) => a.localeCompare(b)));
}

export function renderProjectState(root: string): string {
  const L: string[] = [];
  const pkg = JSON.parse(read(root, "package.json")) as { dependencies: Record<string, string>; devDependencies: Record<string, string>; scripts: Record<string, string> };
  const dep = (n: string) => pkg.dependencies[n] ?? pkg.devDependencies[n] ?? "not installed";
  const node = /NODE_VERSION\s*=\s*"([^"]+)"/.exec(existsSync(join(root, "netlify.toml")) ? read(root, "netlify.toml") : "")?.[1] ?? "not set";

  L.push("# PROJECT_STATE", "");
  L.push("Machine-made by `lib/state/projectState.ts` (canon GOV-18). Do not edit by hand: run `npm run state`.");
  L.push("`tests/projectState.test.ts` fails when this file no longer matches the repo.", "");

  L.push("## Stack and conventions", "");
  L.push("| | |", "|---|---|");
  L.push(`| Next.js | ${dep("next")} |`, `| React | ${dep("react")} |`, `| TypeScript | ${dep("typescript")} |`, `| Node on Netlify | ${node} |`);
  L.push("| Deploy | Netlify site `propops8` builds `main` (`netlify.toml`); `/admin/*` sits behind the login in `proxy.ts` |");
  L.push("| Branches | Work on a feature branch, open a pull request, the owner merges; never force-push `main` |");
  L.push("| Verify | `npm run verify` (typecheck, lint, tests) before any merge or deploy |");
  L.push("| Rules | `CLAUDE.md` stop rules and the canon (`docs/canon/README.md`) |", "");

  L.push("## Module versions", "");
  L.push("Every `export const …VERSION… = \"…\"` in `lib/`.", "");
  L.push("| Constant | Value | File |", "|---|---|---|");
  for (const rel of walk(root, "lib", (r) => r.endsWith(".ts"))) {
    for (const m of read(root, rel).matchAll(/export const ([A-Z0-9_]*VERSION[A-Z0-9_]*)\s*=\s*"([^"]+)"/g)) L.push(`| \`${m[1]}\` | ${m[2]} | \`${rel}\` |`);
  }
  L.push("");

  L.push("## Pages", "");
  L.push("| Path | Who can open it |", "|---|---|");
  for (const rel of walk(root, "app", (r) => /\/page\.(tsx|jsx|ts|js)$/.test(r))) {
    const path = routePath(rel);
    const who = path === "/admin/login" ? "anyone (the login page)"
      : path.startsWith("/admin") ? "admin login"
        : path.startsWith("/upload/") ? "anyone holding an expiring upload link"
          : "public";
    L.push(`| \`${path}\` | ${who} |`);
  }
  L.push("");

  L.push("## API routes", "");
  const authTest = existsSync(join(root, "tests/routeAuth.test.ts")) ? read(root, "tests/routeAuth.test.ts") : "";
  const pub = new Set([...authTest.matchAll(/"(app\/api\/[^"]+\/route\.ts)":/g)].map((m) => m[1]));
  L.push("Denied by default: a route is public only if `tests/routeAuth.test.ts` lists it, with its reason.", "");
  L.push("| Path | Access |", "|---|---|");
  for (const rel of walk(root, "app/api", (r) => r.endsWith("/route.ts"))) L.push(`| \`${routePath(rel)}\` | ${pub.has(rel) ? "public by decision" : "admin session"} |`);
  L.push("");

  L.push("## Environment variable names", "");
  L.push("Names only, never values (CLAUDE.md rule 2). Where each one is read:", "");
  L.push("| Name | Read in |", "|---|---|");
  for (const [name, areas] of envNames(root)) L.push(`| \`${name}\` | ${[...areas].sort().map((a) => `\`${a}\``).join(", ")} |`);
  L.push("");

  L.push("## Database migrations", "");
  L.push("| File | Tables created | Tables with RLS enabled |", "|---|---|---|");
  for (const rel of [...walk(root, "migrations", (r) => r.endsWith(".sql")), ...walk(root, "supabase/migrations", (r) => r.endsWith(".sql"))]) {
    const sql = read(root, rel);
    L.push(`| \`${rel}\` | ${(sql.match(/create table/gi) ?? []).length} | ${(sql.match(/enable row level security/gi) ?? []).length} |`);
  }
  L.push("");

  L.push("## npm scripts", "");
  L.push(Object.keys(pkg.scripts).sort().map((s) => `\`${s}\``).join(" · "), "");

  L.push("## Canon", "");
  const by = (f: (e: (typeof CANON_REGISTER)[number]) => string) => {
    const c: Record<string, number> = {};
    for (const e of CANON_REGISTER) c[f(e)] = (c[f(e)] ?? 0) + 1;
    return Object.entries(c).sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => `${k} ${v}`).join(" · ");
  };
  L.push(`Version ${CANON_VERSION}: ${STUDIES.length} studies, ${CANON_REGISTER.length} entries.`, "");
  L.push(`- By status: ${by((e) => e.status)}`);
  L.push(`- By build state: ${by((e) => e.impl)}`, "");
  L.push("Locked or specified, but not fully built (what is still missing):", "");
  L.push("| Domain | Not built | Partly built |", "|---|---|---|");
  const domains = [...new Set(CANON_REGISTER.map((e) => e.domain))].sort();
  for (const d of domains) {
    const es = CANON_REGISTER.filter((e) => e.domain === d && (e.status === "LOCKED" || e.status === "SPEC"));
    const nb = es.filter((e) => e.impl === "not_built").map((e) => e.id);
    const pb = es.filter((e) => e.impl === "partial").map((e) => e.id);
    if (nb.length || pb.length) L.push(`| ${d} | ${nb.join(", ") || "none"} | ${pb.join(", ") || "none"} |`);
  }
  const unchecked = CANON_REGISTER.filter((e) => e.impl === "unchecked").map((e) => e.id);
  L.push("", `Not yet checked against the code: ${unchecked.join(", ") || "none"}.`, "");

  L.push("## AIM-B5R pilot gates (Phase 1, G0 identity)", "");
  const gates = "data/aim-b5r/phase1/out/gate_decisions.csv";
  if (existsSync(join(root, gates))) {
    const [head, ...rows] = read(root, gates).trim().split(/\r?\n/);
    const cols = head.split(",");
    const at = (r: string[], k: string) => r[cols.indexOf(k)] ?? "";
    L.push("| Lead | Proposed | Final | Signed |", "|---|---|---|---|");
    for (const line of rows) {
      const r = [...line.matchAll(/("([^"]|"")*"|[^,]*)(,|$)/g)].map((m) => m[1].replace(/^"|"$/g, "")).slice(0, cols.length);
      L.push(`| ${cell(at(r, "lead_id"))} | ${cell(at(r, "proposed_gate"))} | ${cell(at(r, "final_gate")) || "—"} | ${at(r, "signed_at") ? "yes" : "no"} |`);
    }
    L.push("", `From \`${gates}\`. G1–G6 have rules (\`docs/aim-dataset/CONTRACT.md\`) but no evidence kit yet.`);
  } else L.push("No Phase 1 gate file.");
  L.push("");
  return `${L.join("\n")}\n`;
}
