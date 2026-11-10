// lib/stuttr/desk/ledger.ts
//
// The Album Desk's job ledger: one record per piece of work, keyed by what it
// was done to and how (an idempotency key), so running anything twice does
// it once and paying twice is never an accident.
//
//   - A job that SUCCEEDED with the same key is skipped.
//   - A paid job that may have reached the provider without our hearing back
//     (a timeout, a dropped connection, a 5xx, or a crash mid-call that left it
//     RUNNING) becomes AMBIGUOUS and holds: nothing resubmits it until the
//     owner checks the provider's own history and resolves it (retry or
//     abandon). A clear refusal (a 4xx) is FAILED and safe to retry.
//   - The ledger never stores secrets: inputs are hashes, errors are codes and
//     short messages with any key-like text removed.
// Pure except loadLedger and saveLedger.

import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

export const LEDGER_SCHEMA = "stuttr-job-ledger-1" as const;
export const JOB_STATUSES = ["RUNNING", "SUCCEEDED", "FAILED", "AMBIGUOUS", "ABANDONED"] as const;
export type JobStatus = (typeof JOB_STATUSES)[number];
export type Provider = "local" | "elevenlabs" | "kling";

export interface Job {
  jobId: string;
  idempotencyKey: string;
  stage: string;
  provider: Provider;
  trackId: string | null;
  inputHashes: string[];
  configHash: string;
  status: JobStatus;
  attempts: number;
  /** Provider units (e.g. ElevenLabs credits), estimated before the call; never a price. */
  costQuote?: { units: string; amount: number; source: string; at: string };
  usageActual?: { units: string; amount: number } | null;
  externalJobId?: string;
  lastErrorCode?: string;
  lastError?: string;
  /** Owner's note when resolving an ambiguous job. */
  resolution?: { action: "retry" | "abandon"; note: string; at: string };
  createdAt: string;
  updatedAt: string;
}

export interface Ledger {
  schemaVersion: typeof LEDGER_SCHEMA;
  jobs: Job[];
}

export const emptyLedger = (): Ledger => ({ schemaVersion: LEDGER_SCHEMA, jobs: [] });

export const sha256Text = (s: string) => createHash("sha256").update(s).digest("hex");

/** The same stage, track, inputs and settings always give the same key. */
export function idempotencyKey(stage: string, trackId: string | null, inputHashes: string[], config: unknown): { key: string; configHash: string } {
  const configHash = sha256Text(JSON.stringify(config ?? null));
  const key = sha256Text([stage, trackId ?? "-", ...[...inputHashes].sort(), configHash].join("\n"));
  return { key, configHash };
}

/** Strips anything that looks like a credential from an error before it is stored or shown. */
export function scrub(message: string): string {
  return message
    .replace(/\bbearer\s+[^\s"',;]+/gi, "Bearer [removed]")
    .replace(/(xi-api-key|api[_-]?key|authorization|token|secret)(["'\s:=]+)(?!bearer\b)[^\s"',;]+/gi, "$1$2[removed]")
    .replace(/\b(sk|key|tok)_[A-Za-z0-9]{8,}\b/g, "[removed]")
    .replace(/\b[A-Za-z0-9]{32,}\b/g, "[removed]")
    .slice(0, 300);
}

/**
 * How a failed paid call ends: FAILED when the provider clearly refused it
 * (a 4xx status, so nothing was done or charged), AMBIGUOUS otherwise.
 */
export function classifyFailure(e: unknown): { status: "FAILED" | "AMBIGUOUS"; code: string } {
  const msg = e instanceof Error ? e.message : String(e);
  const http = /\b(?:ElevenLabs|Kling|HTTP)\s+(\d{3})\b/.exec(msg);
  if (http) {
    const code = Number(http[1]);
    if (code >= 400 && code < 500) return { status: "FAILED", code: `HTTP_${code}` };
    return { status: "AMBIGUOUS", code: `HTTP_${code}` };
  }
  const name = e instanceof Error ? e.name : "";
  if (/abort|timeout/i.test(name) || /timed? ?out|ETIMEDOUT|ECONNRESET|socket hang up|fetch failed|network/i.test(msg)) return { status: "AMBIGUOUS", code: "NO_RESPONSE" };
  // Our own checks before or after the call (a missing stem, a cap) are not provider outcomes.
  return { status: "FAILED", code: "LOCAL_ERROR" };
}

export const findJob = (l: Ledger, key: string) => l.jobs.find((j) => j.idempotencyKey === key);

/** What may happen with a job of this key now. */
export function admit(l: Ledger, key: string, paid: boolean): { go: true; prior: Job | null } | { go: false; why: "done" | "ambiguous" | "abandoned"; job: Job } {
  const j = findJob(l, key);
  if (!j) return { go: true, prior: null };
  if (j.status === "SUCCEEDED") return { go: false, why: "done", job: j };
  if (j.status === "ABANDONED") return { go: false, why: "abandoned", job: j };
  if (j.status === "AMBIGUOUS" && !(j.resolution?.action === "retry")) return { go: false, why: "ambiguous", job: j };
  // A paid job left RUNNING means a crash mid-call: we can't know if it was charged.
  if (j.status === "RUNNING" && paid) return { go: false, why: "ambiguous", job: j };
  return { go: true, prior: j };
}

export function startJob(l: Ledger, o: { key: string; configHash: string; stage: string; provider: Provider; trackId: string | null; inputHashes: string[]; now: string; costQuote?: Job["costQuote"] }): Job {
  const prior = findJob(l, o.key);
  const job: Job = {
    jobId: o.key.slice(0, 12), idempotencyKey: o.key, stage: o.stage, provider: o.provider, trackId: o.trackId, inputHashes: [...o.inputHashes].sort(),
    configHash: o.configHash, status: "RUNNING", attempts: (prior?.attempts ?? 0) + 1, ...(o.costQuote ? { costQuote: o.costQuote } : {}),
    createdAt: prior?.createdAt ?? o.now, updatedAt: o.now,
  };
  l.jobs = [...l.jobs.filter((j) => j.idempotencyKey !== o.key), job];
  return job;
}

export function finishJob(l: Ledger, key: string, now: string, outcome: { status: "SUCCEEDED" } | { status: "FAILED" | "AMBIGUOUS"; code: string; error: string }, usage?: Job["usageActual"]): Job {
  const j = findJob(l, key);
  if (!j) throw new Error(`no job ${key.slice(0, 12)} in the ledger`);
  j.status = outcome.status;
  j.updatedAt = now;
  if (usage !== undefined) j.usageActual = usage;
  if (outcome.status === "SUCCEEDED") { delete j.lastErrorCode; delete j.lastError; delete j.resolution; }
  else { j.lastErrorCode = outcome.code; j.lastError = scrub(outcome.error); }
  return j;
}

/** The owner's decision on an ambiguous job, after checking the provider's history. */
export function resolveJob(l: Ledger, jobId: string, action: "retry" | "abandon", note: string, now: string): Job {
  const j = l.jobs.find((x) => x.jobId === jobId || x.idempotencyKey === jobId);
  if (!j) throw new Error(`no job ${jobId} in the ledger`);
  if (j.status !== "AMBIGUOUS" && !(j.status === "RUNNING" && j.provider !== "local")) throw new Error(`job ${j.jobId} is ${j.status}; only an ambiguous job is resolved by hand`);
  if (!note.trim()) throw new Error("say what you checked (for example: \"not in the ElevenLabs history\")");
  j.status = action === "retry" ? "AMBIGUOUS" : "ABANDONED";
  if (j.status === "AMBIGUOUS" && j.lastErrorCode === undefined) j.lastErrorCode = "NO_RESPONSE";
  j.resolution = { action, note: scrub(note), at: now };
  j.updatedAt = now;
  return j;
}

export function loadLedger(path: string): Ledger {
  if (!existsSync(path)) return emptyLedger();
  const l = JSON.parse(readFileSync(path, "utf8")) as Ledger;
  if (l.schemaVersion !== LEDGER_SCHEMA || !Array.isArray(l.jobs)) throw new Error(`${path} is not a ${LEDGER_SCHEMA} ledger`);
  return l;
}

/** Whole-file write through a temp file and a rename, so a crash never leaves half a ledger. */
export function saveLedger(path: string, l: Ledger): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(`${path}.tmp`, JSON.stringify(l, null, 2) + "\n");
  renameSync(`${path}.tmp`, path);
}
