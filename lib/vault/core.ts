/**
 * AIM Vault — pure helpers shared by the vault command-line tool and its
 * tests. No network, no Supabase client here.
 */
import { createHash } from "node:crypto";

export const ENTITIES = ["aim-llc", "sbi-inc", "aura8-inc"] as const;
export type EntityId = (typeof ENTITIES)[number];

export const CATEGORIES = [
  "filing", "governance", "ip_protection", "contract", "financial", "tax", "plan", "image",
  "audio", "video", "dataset", "schedule", "brand", "correspondence", "other",
] as const;
export type Category = (typeof CATEGORIES)[number];

/** 0 shareable · 1 internal · 2 confidential · 3 restricted (encrypted before upload). */
export type Tier = 0 | 1 | 2 | 3;

export const bucketFor = (e: EntityId) => `vault-${e}`;

export function sha256(buf: Buffer): string {
  return createHash("sha256").update(buf).digest("hex");
}

/** Safe, readable object key: <category>/<year>/<sha8>-<name>. */
export function objectPath(category: Category, fileName: string, sha: string, year: number): string {
  const base = fileName.split(/[\\/]/).pop() ?? "file";
  const safe = base.normalize("NFKD").replace(/[^\w.\-]+/g, "_").replace(/_+/g, "_").slice(-120) || "file";
  return `${category}/${year}/${sha.slice(0, 8)}-${safe}`;
}

/** True when the bytes are an age-encrypted file (binary or armored). */
export function isAgeEncrypted(head: Buffer): boolean {
  const s = head.subarray(0, 64).toString("latin1");
  return s.startsWith("age-encryption.org/v1\n") || s.startsWith("-----BEGIN AGE ENCRYPTED FILE-----");
}

/**
 * Refuse any key that bypasses row-level security. The vault tool must sign
 * in as the owner; a secret / service-role key would skip every rule.
 */
export function isPrivilegedKey(key: string): boolean {
  if (key.startsWith("sb_secret_")) return true;
  const parts = key.split(".");
  if (parts.length !== 3) return false;
  try {
    const payload = JSON.parse(Buffer.from(parts[1], "base64url").toString("utf8")) as { role?: string };
    return payload.role === "service_role";
  } catch {
    return false;
  }
}

export interface VaultConfig {
  url: string;
  key: string;
}

/** Accepts the project URL as the dashboard shows it (with or without /rest/v1/). */
export function normalizeProjectUrl(raw: string): string {
  return raw.trim().replace(/\/+$/, "").replace(/\/rest\/v1$/, "");
}

/** Problem with a project URL / key pair, or null when it is usable. */
export function checkVaultConfig(url: string, key: string): string | null {
  if (!/^https:\/\/[a-z0-9-]+(\.[a-z0-9-]+)+$/i.test(url)) return "The project URL should start with https:// and end in .supabase.co.";
  if (isPrivilegedKey(key)) return "That is a secret / service-role key. The vault tool only accepts the publishable (anon) key.";
  if (!key.startsWith("sb_publishable_") && key.split(".").length !== 3) return "That does not look like a publishable (anon) key.";
  return null;
}

/**
 * Where the tool finds the vault project: environment variables first, then
 * the file `vault setup` saved. Returns the config or a message to show.
 */
export function resolveVaultConfig(
  env: { VAULT_SUPABASE_URL?: string; VAULT_SUPABASE_ANON_KEY?: string },
  saved: string | null,
): VaultConfig | { error: string } {
  let url = env.VAULT_SUPABASE_URL?.trim();
  let key = env.VAULT_SUPABASE_ANON_KEY?.trim();
  if ((!url || !key) && saved) {
    try {
      const j = JSON.parse(saved) as Partial<VaultConfig>;
      url ||= j.url;
      key ||= j.key;
    } catch {
      return { error: "The saved setup is unreadable. Run: vault setup" };
    }
  }
  if (!url || !key) return { error: "Not set up on this computer yet. Run: vault setup" };
  url = normalizeProjectUrl(url);
  const problem = checkVaultConfig(url, key);
  return problem ? { error: problem } : { url, key };
}

const IMAGE = /\.(png|jpe?g|tiff?|bmp|heic|webp)$/i;
const LOSSLESS_AUDIO = /\.(wav|aiff?|flac)$/i;

export type DerivativeRole = "preview" | "listen";
export interface DerivativePlan {
  role: DerivativeRole;
  ext: string;
  mime: string;
  tool: "sharp" | "ffmpeg";
}

/** Light copies to make next to the original. Restricted items get none. */
export function planDerivatives(fileName: string, tier: Tier): DerivativePlan[] {
  if (tier === 3) return [];
  if (IMAGE.test(fileName) && !/\.webp$/i.test(fileName)) {
    return [{ role: "preview", ext: ".webp", mime: "image/webp", tool: "sharp" }];
  }
  if (LOSSLESS_AUDIO.test(fileName)) {
    return [{ role: "listen", ext: ".m4a", mime: "audio/mp4", tool: "ffmpeg" }];
  }
  return [];
}

const MIME: Record<string, string> = {
  pdf: "application/pdf", png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", webp: "image/webp",
  gif: "image/gif", tif: "image/tiff", tiff: "image/tiff", heic: "image/heic", svg: "image/svg+xml",
  mp3: "audio/mpeg", m4a: "audio/mp4", wav: "audio/wav", flac: "audio/flac", aif: "audio/aiff", aiff: "audio/aiff",
  mp4: "video/mp4", mov: "video/quicktime", csv: "text/csv", json: "application/json", parquet: "application/vnd.apache.parquet",
  txt: "text/plain", md: "text/markdown", docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", zip: "application/zip", age: "application/octet-stream",
};
export function mimeFor(fileName: string): string {
  const ext = (fileName.split(".").pop() ?? "").toLowerCase();
  return MIME[ext] ?? "application/octet-stream";
}

export interface AddInput {
  entity: string;
  category: string;
  title: string;
  tier: number;
  fileName: string;
  head: Buffer;
}

/** Problems that stop an upload before anything leaves the machine. */
export function checkAdd(a: AddInput): string[] {
  const issues: string[] = [];
  if (!ENTITIES.includes(a.entity as EntityId)) issues.push(`--entity must be one of ${ENTITIES.join(", ")}`);
  if (!CATEGORIES.includes(a.category as Category)) issues.push(`--category must be one of ${CATEGORIES.join(", ")}`);
  if (!a.title.trim()) issues.push("--title is required");
  if (![0, 1, 2, 3].includes(a.tier)) issues.push("--tier must be 0, 1, 2 or 3");
  if (a.tier === 3) {
    if (!/\.age$/i.test(a.fileName)) issues.push("tier 3 files must be encrypted first: age -p -o file.pdf.age file.pdf");
    else if (!isAgeEncrypted(a.head)) issues.push("file ends in .age but is not age-encrypted");
  } else if (isAgeEncrypted(a.head)) {
    issues.push("this file is age-encrypted; file it as --tier 3");
  }
  return issues;
}

export interface CatalogRow {
  id: string;
  entity_id: string;
  category: string;
  title: string;
  doc_date: string | null;
  expires_on: string | null;
  status: string;
  tier: number;
  tags: string[];
  projects: string[];
}
export interface DeadlineRow {
  entity_id: string;
  title: string;
  due_on: string;
  recurrence: string;
  status: string;
}

/**
 * What Pure AI may see: tier 0-1 catalog lines and open deadlines. Titles and
 * dates only, never file contents, paths or tier 2-3 items.
 */
export function pureExport(items: CatalogRow[], deadlines: DeadlineRow[], asOf: string): string {
  const shareable = items.filter((i) => i.tier <= 1 && i.status !== "archived")
    .sort((a, b) => a.entity_id.localeCompare(b.entity_id) || (b.doc_date ?? "").localeCompare(a.doc_date ?? "") || a.title.localeCompare(b.title));
  const open = deadlines.filter((d) => d.status === "open").sort((a, b) => a.due_on.localeCompare(b.due_on));
  const lines = [
    `# AIM Vault — shareable catalog (as of ${asOf})`,
    "",
    "Tier 0-1 items only. Confidential and restricted items, file contents and storage paths are never exported.",
    "",
    "| Entity | Category | Title | Date | Status | Tags |",
    "| --- | --- | --- | --- | --- | --- |",
    ...shareable.map((i) => `| ${i.entity_id} | ${i.category} | ${i.title.replace(/\|/g, "/")} | ${i.doc_date ?? ""} | ${i.status} | ${i.tags.join(", ")} |`),
    "",
    "## Open deadlines",
    "",
    "| Due | Entity | What | Repeats |",
    "| --- | --- | --- | --- |",
    ...open.map((d) => `| ${d.due_on} | ${d.entity_id} | ${d.title.replace(/\|/g, "/")} | ${d.recurrence} |`),
    "",
  ];
  return lines.join("\n");
}
