// lib/b5r/screen/claude.ts
//
// The one Claude API call the photo screen makes: the photos and the owner's
// intent in, the record_screen tool's input out. Rules:
//  - The key comes from ANTHROPIC_API_KEY and is only ever sent in the
//    x-api-key header. It is never logged, saved or put into an error message.
//  - fetch is passed in, so tests run against a fake and never reach the API.
//  - No retries: a second call is a second charge, so a failure stops here.

import { SYSTEM_PROMPT, TOOL, TOOL_NAME } from "./contract";

export const ANTHROPIC_API = "https://api.anthropic.com/v1/messages";
export const KEY_ENV = "ANTHROPIC_API_KEY";
export const API_VERSION = "2023-06-01";
export const DEFAULT_MODEL = "claude-sonnet-5-5";
/** Enough for a full screen of up to 20 photos; the cost ceiling is computed from it. */
export const MAX_OUTPUT_TOKENS = 6000;

/**
 * USD per million tokens (input, output), from the Claude models overview,
 * checked 2 Nov 2026. Haiku's price is published as "from", so it has no
 * entry and its cost shows as unknown.
 */
export const MODEL_PRICES: Record<string, { input: number; output: number } | null> = {
  "claude-sonnet-5-5": { input: 2, output: 10 },
  "claude-opus-5-5": { input: 4, output: 20 },
  "claude-fable-5-1": { input: 10, output: 50 },
  "claude-haiku-5-5": null,
};
export const PRICE_SOURCE = "platform.claude.com models overview, checked 2026-11-02";

export type Fetch = (url: string, init?: RequestInit) => Promise<Response>;

export interface ScreenPhoto {
  n: number;
  mediaType: "image/jpeg";
  data: Buffer;
}

export function requestBody(model: string, photos: ScreenPhoto[], intent: string | null) {
  const content: unknown[] = [];
  for (const p of photos) {
    content.push({ type: "text", text: `Photo ${p.n}` });
    content.push({ type: "image", source: { type: "base64", media_type: p.mediaType, data: p.data.toString("base64") } });
  }
  content.push({
    type: "text",
    text: intent
      ? `The owner's intent: ${intent}\nScreen these ${photos.length} photo(s) for residential development potential.`
      : `No intent given. Screen these ${photos.length} photo(s) for residential development potential.`,
  });
  return {
    model,
    max_tokens: MAX_OUTPUT_TOKENS,
    system: SYSTEM_PROMPT,
    tools: [TOOL],
    tool_choice: { type: "tool", name: TOOL_NAME },
    messages: [{ role: "user", content }],
  };
}

export interface ScreenAnswer {
  input: unknown;
  model: string;
  usage: { inputTokens: number; outputTokens: number };
}

async function errorText(r: Response): Promise<string> {
  let msg = "";
  try {
    const body = await r.text();
    try {
      const j = JSON.parse(body) as { error?: { message?: string } };
      msg = j.error?.message ?? body.slice(0, 300);
    } catch {
      msg = body.slice(0, 300);
    }
  } catch { /* no body */ }
  const hint = r.status === 401 || r.status === 403 ? ` (check ${KEY_ENV})`
    : r.status === 429 || r.status === 529 ? " (busy, rate-limited or out of credit; try again later)"
    : r.status === 413 ? " (too large: use fewer photos)" : "";
  return `Claude API ${r.status}: ${msg || r.statusText}${hint}`;
}

export async function askClaude(key: string, f: Fetch, body: ReturnType<typeof requestBody>): Promise<ScreenAnswer> {
  const r = await f(ANTHROPIC_API, {
    method: "POST",
    headers: { "x-api-key": key, "anthropic-version": API_VERSION, "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!r.ok) throw new Error(await errorText(r));
  const j = (await r.json()) as {
    model?: string; stop_reason?: string;
    content?: { type: string; name?: string; input?: unknown }[];
    usage?: { input_tokens?: number; output_tokens?: number };
  };
  if (j.stop_reason === "max_tokens") throw new Error("the answer was cut off at the output limit; screen fewer photos at a time");
  const call = (j.content ?? []).find((b) => b.type === "tool_use" && b.name === TOOL_NAME);
  if (!call) throw new Error(`the model did not call ${TOOL_NAME}`);
  return { input: call.input, model: j.model ?? body.model, usage: { inputTokens: j.usage?.input_tokens ?? 0, outputTokens: j.usage?.output_tokens ?? 0 } };
}

/** Image tokens as the vision docs estimate them: width x height / 750. */
export const imageTokens = (w: number, h: number) => Math.ceil((w * h) / 750);

/** USD for a token count, or null when the model's price isn't published. */
export function costUsd(model: string, inputTokens: number, outputTokens: number): number | null {
  const p = MODEL_PRICES[model];
  if (!p) return null;
  return Math.round(((inputTokens * p.input + outputTokens * p.output) / 1e6) * 10000) / 10000;
}
