/**
 * Phase 0D: default deny for the API. Every route handler under app/api must
 * check the admin session as its first statement, unless the route is on the
 * PUBLIC list below with a reason. (Reading the cookie store on the line
 * before the check is allowed; nothing else may come first.) A new route is therefore denied by default
 * until someone decides, in this file, that it is public.
 *
 * Static on purpose: the handlers read the cookie through next/headers, which
 * only works inside a live request. tests/securityGuards.test.ts covers the
 * cookie itself (forged, tampered, expired) and the Tally signature.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync, existsSync } from "node:fs";
import { join, relative } from "node:path";
import ts from "typescript";

const ROOT = join(__dirname, "..");
const METHODS = new Set(["GET", "POST", "PUT", "PATCH", "DELETE"]);

/** Routes that are public by decision. Each needs its own guard and a reason. */
const PUBLIC: Record<string, string> = {
  "app/api/admin/login/route.ts": "Login itself; rate-limited by lib/loginThrottle.ts",
  "app/api/admin/logout/route.ts": "Clears the cookie; reads nothing",
  "app/api/health/route.ts": "Health check; returns project ref and engine version, no data",
  "app/api/tally-webhook/route.ts": "Tally calls it; HMAC signature checked first (securityGuards.test.ts)",
  "app/api/upload/[token]/route.ts": "Client upload; scoped by an expiring, revocable token",
  "app/api/rss/route.ts": "Feed proxy for the Plate rig; every hop SSRF-checked by lib/safeFetch.ts",
  "app/api/yt/route.ts": "OPEN FINDING L2: public, spends the YouTube quota. Gate once Slate8 handles sign-in",
};

function routes(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) routes(p, out);
    else if (name === "route.ts") out.push(relative(ROOT, p).split("\\").join("/"));
  }
  return out;
}

/** Names that perform the admin check in this file: the guard helpers plus local wrappers around them. */
function authNames(sf: ts.SourceFile): Set<string> {
  const names = new Set(["denyUnlessAdmin", "verifySessionCookie"]);
  const visit = (n: ts.Node) => {
    if (ts.isFunctionDeclaration(n) && n.name && n.body && /verifySessionCookie\(|denyUnlessAdmin\(/.test(n.body.getText(sf))) {
      names.add(n.name.text);
    }
    ts.forEachChild(n, visit);
  };
  visit(sf);
  return names;
}

/** The text that must hold the check: the first statement, or the second when the first only reads the cookie store. */
function guardText(body: ts.Block | undefined, sf: ts.SourceFile): string {
  const [a, b] = body?.statements ?? [];
  const first = a?.getText(sf) ?? "";
  return /^const \w+ = await cookies\(\);$/.test(first) && b ? `${first}\n${b.getText(sf)}` : first;
}

function handlers(sf: ts.SourceFile): { name: string; first: string }[] {
  const out: { name: string; first: string }[] = [];
  for (const st of sf.statements) {
    const exported = ts.canHaveModifiers(st) && ts.getModifiers(st)?.some((m) => m.kind === ts.SyntaxKind.ExportKeyword);
    if (!exported) continue;
    if (ts.isFunctionDeclaration(st) && st.name && METHODS.has(st.name.text)) {
      out.push({ name: st.name.text, first: guardText(st.body, sf) });
    }
    if (ts.isVariableStatement(st)) {
      for (const d of st.declarationList.declarations) {
        if (!ts.isIdentifier(d.name) || !METHODS.has(d.name.text) || !d.initializer) continue;
        const fn = d.initializer;
        const body = (ts.isArrowFunction(fn) || ts.isFunctionExpression(fn)) && ts.isBlock(fn.body) ? fn.body : null;
        out.push({ name: d.name.text, first: guardText(body ?? undefined, sf) });
      }
    }
  }
  return out;
}

test("route auth: every public route on the list still exists", () => {
  for (const p of Object.keys(PUBLIC)) assert.ok(existsSync(join(ROOT, p)), `stale PUBLIC entry: ${p}`);
});

test("route auth: every non-public handler checks the admin session first", () => {
  const files = routes(join(ROOT, "app", "api")).filter((f) => !(f in PUBLIC));
  assert.ok(files.length >= 10, "expected the admin and send-report routes");
  for (const file of files) {
    const sf = ts.createSourceFile(file, readFileSync(join(ROOT, file), "utf8"), ts.ScriptTarget.Latest, true);
    const names = authNames(sf);
    const hs = handlers(sf);
    assert.ok(hs.length > 0, `${file}: no exported handlers found`);
    for (const h of hs) {
      const ok = [...names].some((n) => h.first.includes(`${n}(`));
      assert.ok(ok, `${file} ${h.name}: first statement must be the admin check, found: ${h.first.slice(0, 80)}`);
    }
  }
});

test("route auth: the check itself catches a handler that touches data first", () => {
  const src = [
    "async function authed() { return verifySessionCookie(x); }",
    "export async function GET() { const { data } = await supabase.from('t').select(); if (!(await authed())) return deny(); }",
    "export async function POST() { if (!(await authed())) return deny(); return ok(); }",
  ].join("\n");
  const sf = ts.createSourceFile("fake.ts", src, ts.ScriptTarget.Latest, true);
  const names = authNames(sf);
  const verdict = Object.fromEntries(handlers(sf).map((h) => [h.name, [...names].some((n) => h.first.includes(`${n}(`))]));
  assert.deepEqual(verdict, { GET: false, POST: true });
});
