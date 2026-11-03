// lib/late8/load.ts
//
// Reads the published audiobook manifest from the URL in LATE8_AUDIOBOOK_URL
// (the audiobook.json on Cloudflare R2; not a secret). Server side only, so
// the bucket needs no CORS rule. The manifest is checked before anything
// plays (validateManifest), and every file path is made absolute against it.

import { validateManifest, withAbsoluteUrls, type AudiobookManifest } from "./audiobook";

export const AUDIOBOOK_URL_ENV = "LATE8_AUDIOBOOK_URL";
/** How long a fetched manifest is reused before R2 is asked again. */
export const MANIFEST_REVALIDATE_SEC = 300;

export type AudiobookState =
  | { state: "not_configured" }
  | { state: "unavailable"; reason: string }
  | { state: "ok"; manifest: AudiobookManifest; issues: string[] };

type Fetcher = (url: string, init?: RequestInit & { next?: { revalidate?: number } }) => Promise<Response>;

export async function loadAudiobook(url: string | undefined, f: Fetcher = fetch as Fetcher): Promise<AudiobookState> {
  if (!url?.trim()) return { state: "not_configured" };
  let target: URL;
  try {
    target = new URL(url.trim());
  } catch {
    return { state: "unavailable", reason: `${AUDIOBOOK_URL_ENV} is not a URL` };
  }
  if (target.protocol !== "https:") return { state: "unavailable", reason: `${AUDIOBOOK_URL_ENV} must be https` };
  let raw: unknown;
  try {
    const r = await f(target.toString(), { next: { revalidate: MANIFEST_REVALIDATE_SEC }, signal: AbortSignal.timeout(8000) });
    if (!r.ok) return { state: "unavailable", reason: `the manifest answered ${r.status}` };
    raw = await r.json();
  } catch (e) {
    return { state: "unavailable", reason: `the manifest could not be read (${(e as Error).name})` };
  }
  const { manifest, issues } = validateManifest(raw);
  if (!manifest) return { state: "unavailable", reason: `the manifest can't be played: ${issues.join("; ")}` };
  return { state: "ok", manifest: withAbsoluteUrls(manifest, target.toString()), issues };
}
