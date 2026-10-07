#!/usr/bin/env node
/**
 * scripts/e2e-audit.mjs — one SYNTHETIC intake, Tally webhook to delivered report.
 *
 *   BASE_URL=https://<your-site> node scripts/e2e-audit.mjs
 *   node scripts/e2e-audit.mjs --dry        (prints the plan, touches nothing)
 *
 * Reads two secrets from the ENVIRONMENT by name and never prints them:
 *   TALLY_SIGNING_SECRET   to sign the webhook exactly like Tally does
 *   ADMIN_PASSWORD         to log in to /admin like you do
 *
 * Synthetic data only: the customer is "E2E SYNTHETIC ..." at delivered@resend.dev
 * (Resend's own test inbox), and the "PDF" is a tiny fake file. The real review
 * page generates a real PDF; this checks the PIPELINE around it, step by step:
 *
 *   1 webhook creates the intake          5 review approval is saved
 *   2 admin sees it                       6 send emails the approved bytes
 *   3 release (if held) issues the link   7 a second send is refused (409)
 *   4 intake is paid                      8 history + Resend id are visible
 *
 * Clean up afterwards (events and reviews cascade):
 *   delete from audit_intakes where company like 'E2E SYNTHETIC%';
 */
import { createHmac, createHash } from "node:crypto";
import { readFileSync } from "node:fs";

const dry = process.argv.includes("--dry");
const base = (process.env.BASE_URL ?? "").replace(/\/$/, "");
const engineVersion = /ENGINE_VERSION = "([^"]+)"/.exec(readFileSync(new URL("../lib/engineVersion.ts", import.meta.url), "utf8"))?.[1];
const GATE_ITEMS = 4;

const results = [];
function step(name, ok, detail = "") {
  results.push(ok);
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
  if (!ok) { console.log("\nStopped at the first failure; later steps depend on it."); process.exit(1); }
}

if (dry) {
  console.log("DRY RUN — nothing is sent. Plan: 1 signed webhook, 2 admin login+list, 3 release if held, 4 check paid,");
  console.log("5 save approved review (synthetic PDF), 6 send-report, 7 second send must 409, 8 events + Resend id.");
  console.log(`engineVersion read from lib/engineVersion.ts: ${engineVersion}`);
  process.exit(0);
}

for (const v of ["BASE_URL", "TALLY_SIGNING_SECRET", "ADMIN_PASSWORD"]) {
  if (!process.env[v]) { console.error(`${v} is not set in the environment.`); process.exit(2); }
}
if (!engineVersion) { console.error("Could not read ENGINE_VERSION."); process.exit(2); }

const stamp = Date.now();
const company = `E2E SYNTHETIC ${stamp}`;
const email = "delivered@resend.dev";

/* 1 — signed webhook, same shape and signature Tally uses */
const payload = {
  eventId: `e2e-${stamp}`,
  eventType: "FORM_RESPONSE",
  data: {
    responseId: `e2e-resp-${stamp}`,
    formId: "e2e",
    fields: [
      { key: "name", label: "Your name", type: "INPUT_TEXT", value: "E2E Synthetic" },
      { key: "email", label: "Work email", type: "INPUT_EMAIL", value: email },
      { key: "company", label: "Business / portfolio", type: "INPUT_TEXT", value: company },
      { key: "portfolio_size", label: "Portfolio size", type: "INPUT_TEXT", value: "50-100 units" },
      { key: "primary_concern", label: "What's the problem you'd most want answered?", type: "INPUT_TEXT", value: "synthetic pipeline test" },
    ],
  },
};
const raw = JSON.stringify(payload);
const sig = createHmac("sha256", process.env.TALLY_SIGNING_SECRET).update(raw).digest("base64");
let res = await fetch(`${base}/api/tally-webhook`, { method: "POST", headers: { "content-type": "application/json", "tally-signature": sig }, body: raw });
step("1 webhook accepted the signed submission", res.ok, `HTTP ${res.status}`);

/* 2 — admin login and find the intake */
res = await fetch(`${base}/api/admin/login`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ password: process.env.ADMIN_PASSWORD }) });
const cookie = (res.headers.getSetCookie?.() ?? []).map((c) => c.split(";")[0]).join("; ");
step("2a admin login", res.ok && cookie.length > 0, `HTTP ${res.status}`);
const H = { "content-type": "application/json", cookie };

const list = async () => (await (await fetch(`${base}/api/admin/intakes`, { headers: H, cache: "no-store" })).json()).intakes ?? [];
let intake = (await list()).find((i) => i.company === company);
step("2b admin list shows the new intake", !!intake, intake ? `status ${intake.status}` : "not found");

/* 3 — release if held */
if (intake.status === "submitted") {
  res = await fetch(`${base}/api/admin/intakes`, { method: "POST", headers: H, body: JSON.stringify({ id: intake.id, action: "release" }) });
  step("3 release issued the upload link", res.ok, `HTTP ${res.status}`);
} else {
  step("3 release not needed (payment already confirmed)", true, intake.status);
}
intake = (await list()).find((i) => i.id === intake.id);
step("4 intake is paid", ["paid", "files_received", "in_analysis"].includes(intake?.status), intake?.status);

/* 5 — approved review, synthetic bytes */
const pdf = Buffer.from(`%PDF-1.4 synthetic e2e ${stamp}\n%%EOF\n`);
const sha = createHash("sha256").update(pdf).digest("hex");
const review = {
  intakeId: intake.id,
  engineVersion,
  engineOutput: { findings: [], spendTable: [], window: null, netLedger: 0, reviewTriggerCount: 0, droppedRows: 0, totalRows: 0, synthetic: true },
  reviewerEdits: { meta: { propertyName: "E2E Synthetic Court" }, findings: [], triggerCount: 0 },
  gateChecks: Array(GATE_ITEMS).fill(true),
  approved: true,
  pdfSha256: sha,
  pdfBase64: pdf.toString("base64"),
};
res = await fetch(`${base}/api/admin/reviews`, { method: "POST", headers: H, body: JSON.stringify(review) });
let body = await res.json().catch(() => ({}));
step("5 approved review saved", res.ok && body.stage === "approved", res.ok ? `review ${body.reviewId}` : `HTTP ${res.status} ${body.error ?? ""}`);

/* 6 — send exactly those bytes */
const sendBody = JSON.stringify({ intakeId: intake.id, pdfBase64: pdf.toString("base64"), propertyName: "E2E Synthetic Court", triggerCount: 0 });
res = await fetch(`${base}/api/send-report`, { method: "POST", headers: H, body: sendBody });
body = await res.json().catch(() => ({}));
step("6 report sent", res.ok && body.sent === true && !!body.messageId, res.ok ? `Resend id ${body.messageId}` : `HTTP ${res.status} ${body.error ?? ""}`);
const messageId = body.messageId;

/* 7 — double send refused */
res = await fetch(`${base}/api/send-report`, { method: "POST", headers: H, body: sendBody });
step("7 second send refused with 409", res.status === 409, `HTTP ${res.status}`);

/* 8 — visible in admin */
intake = (await list()).find((i) => i.id === intake.id);
step("8a intake shows delivered, stage sent, same Resend id", intake?.status === "delivered" && intake?.review_stage === "sent" && intake?.resend_message_id === messageId, `${intake?.status}/${intake?.review_stage}`);
res = await fetch(`${base}/api/admin/intakes/events?id=${intake.id}`, { headers: H, cache: "no-store" });
const events = ((await res.json().catch(() => ({}))).events ?? []).map((e) => e.event_type);
step("8b history has review_approved then report_sent", events.includes("review_approved") && events.includes("report_sent") && events.indexOf("review_approved") < events.indexOf("report_sent"), events.join(" → "));

console.log(`\nAll ${results.length} checks passed. Synthetic intake: ${company}`);
console.log("Clean up with:  delete from audit_intakes where company like 'E2E SYNTHETIC%';");
