// lib/security/secretScan.ts
//
// Finds credentials in text without ever returning them. A finding carries
// the file, line, rule and a redacted preview (first four characters and the
// length), so a report can be pasted anywhere safely. Canon GOV-08, Phase 0D.
//
// A line can opt out with the marker `secret-scan: allow` plus a reason, for
// deliberate fakes in tests. Keep those rare and obviously fake.

export interface SecretRule {
  id: string;
  description: string;
  pattern: RegExp;
}

export interface SecretFinding {
  file: string;
  line: number;
  rule: string;
  /** e.g. "sk_l… (32 chars)". Never the value itself. */
  preview: string;
}

/** Credential shapes we refuse to track. Specific formats only, to keep false positives near zero. */
export const SECRET_RULES: readonly SecretRule[] = [
  { id: "private-key", description: "PEM private key block", pattern: /-----BEGIN (?:RSA |EC |DSA |OPENSSH |PGP |ENCRYPTED )?PRIVATE KEY-----/ },
  { id: "jwt", description: "JSON Web Token (Supabase anon/service keys are JWTs)", pattern: /\beyJ[A-Za-z0-9_-]{10,}\.eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/ },
  { id: "supabase-secret", description: "Supabase secret API key", pattern: /\bsb_secret_[A-Za-z0-9_-]{16,}/ },
  { id: "stripe-key", description: "Stripe secret or restricted key", pattern: /\b(?:sk|rk)_(?:live|test)_[A-Za-z0-9]{16,}/ },
  { id: "stripe-webhook", description: "Stripe webhook signing secret", pattern: /\bwhsec_[A-Za-z0-9]{20,}/ },
  { id: "resend-key", description: "Resend API key", pattern: /\bre_(?=[A-Za-z0-9_]*\d)(?=[A-Za-z0-9_]*[A-Z])[A-Za-z0-9_]{24,}\b/ },
  { id: "anthropic-key", description: "Anthropic API key", pattern: /\bsk-ant-[A-Za-z0-9_-]{20,}/ },
  { id: "openai-key", description: "OpenAI API key", pattern: /\bsk-(?:proj-)?(?!ant-)[A-Za-z0-9_-]{32,}/ },
  { id: "github-token", description: "GitHub token", pattern: /\b(?:gh[pousr]_[A-Za-z0-9]{36,}|github_pat_[A-Za-z0-9_]{50,})\b/ },
  { id: "aws-access-key", description: "AWS access key id", pattern: /\b(?:AKIA|ASIA)[0-9A-Z]{16}\b/ },
  { id: "google-api-key", description: "Google API key (YouTube, Maps)", pattern: /\bAIza[0-9A-Za-z_-]{35}\b/ },
  { id: "db-url-password", description: "Postgres URL with an inline password", pattern: /\bpostgres(?:ql)?:\/\/[^:\s/@]+:(?!\[|\$|<|password@|PASSWORD@)[^@\s]{6,}@/ },
];

const ALLOW_MARKER = "secret-scan: allow";

/** Files that hold real environment values must never be tracked. Templates are fine. */
export const ENV_FILE = /(?:^|\/)\.env(?:\.[A-Za-z0-9_-]+)*$/;
const ENV_TEMPLATE = /(?:^|\/)\.env(?:\.[A-Za-z0-9_-]+)*\.(?:example|sample|template)$/;

export function isForbiddenEnvFile(path: string): boolean {
  return ENV_FILE.test(path) && !ENV_TEMPLATE.test(path);
}

function redact(value: string): string {
  return `${value.slice(0, 4)}… (${value.length} chars)`;
}

/** Scan one file's text. Returns findings with redacted previews only. */
export function scanText(file: string, text: string): SecretFinding[] {
  const out: SecretFinding[] = [];
  const lines = text.split(/\r?\n/);
  lines.forEach((line, i) => {
    if (line.includes(ALLOW_MARKER)) return;
    for (const rule of SECRET_RULES) {
      const m = line.match(rule.pattern);
      if (m) out.push({ file, line: i + 1, rule: rule.id, preview: redact(m[0]) });
    }
  });
  return out;
}

/** True when the bytes look binary (a NUL in the first 8 KB). Binary files are skipped. */
export function looksBinary(buf: Uint8Array): boolean {
  const n = Math.min(buf.length, 8192);
  for (let i = 0; i < n; i++) if (buf[i] === 0) return true;
  return false;
}
