// lib/stuttr/elevenlabs.ts
//
// The two ElevenLabs calls the convert command needs: list your voices (no
// credits) and run the voice changer on one file (credits per minute).
// Rules:
//  - The API key comes from the ELEVENLABS_API_KEY environment variable and
//    is only ever sent in the xi-api-key header. It is never logged, saved,
//    or put into an error message.
//  - fetch is passed in, so tests run against a fake and never reach the API.

export const ELEVENLABS_API = "https://api.elevenlabs.io";
export const KEY_ENV = "ELEVENLABS_API_KEY";
/** The voice changer model (Eleven v4 is text to speech only). */
export const STS_MODEL = "eleven_multilingual_sts_v2";
/** MP3 formats only: the 192 kbps one needs the Creator plan or above; WAV/PCM output needs Pro. */
export const OUTPUT_FORMATS = ["mp3_44100_192", "mp3_44100_128"] as const;
export type OutputFormat = (typeof OUTPUT_FORMATS)[number];
export const UPLOAD_MAX_BYTES = 50 * 1024 * 1024;

export type Fetch = (url: string, init?: RequestInit) => Promise<Response>;

export interface ElevenVoice {
  voiceId: string;
  name: string;
}

async function errorText(r: Response): Promise<string> {
  let body = "";
  try { body = await r.text(); } catch { /* no body */ }
  let msg = body.slice(0, 300);
  try {
    const j = JSON.parse(body) as { detail?: unknown };
    const d = (j.detail ?? j) as string | { message?: string; status?: string };
    msg = typeof d === "string" ? d : d.message ?? d.status ?? JSON.stringify(d).slice(0, 300);
  } catch { /* not JSON */ }
  const hint =
    r.status === 401 || r.status === 403
      ? ` (check ${KEY_ENV}; a key with limited permissions needs voice changer and voices read access)`
      : r.status === 429 ? " (too many requests, or out of credits)" : "";
  return `ElevenLabs ${r.status}: ${msg || r.statusText}${hint}`;
}

export async function listVoices(key: string, f: Fetch): Promise<ElevenVoice[]> {
  const r = await f(`${ELEVENLABS_API}/v1/voices`, { headers: { "xi-api-key": key } });
  if (!r.ok) throw new Error(await errorText(r));
  const j = (await r.json()) as { voices?: { voice_id: string; name: string }[] };
  return (j.voices ?? []).map((v) => ({ voiceId: v.voice_id, name: v.name }));
}

/**
 * Finds a library voice name among your ElevenLabs voices: an exact name
 * (ignoring case) first, else the one voice whose name starts with it as a
 * whole word ("M" finds "M - Shenzhen Syndicate", never "Mo").
 */
export function matchVoice(voices: ElevenVoice[], name: string): ElevenVoice {
  const want = name.trim().toLowerCase();
  const norm = (v: ElevenVoice) => v.name.trim().toLowerCase();
  const exact = voices.filter((v) => norm(v) === want);
  const pool = exact.length > 0 ? exact : voices.filter((v) => norm(v).startsWith(want) && !/[\p{L}\p{N}]/u.test(norm(v).charAt(want.length)));
  if (pool.length === 1) return pool[0];
  if (pool.length > 1) {
    throw new Error(`${pool.length} ElevenLabs voices match "${name}" (${pool.map((v) => v.name).join(", ")}); rename them so one matches`);
  }
  const names = voices.map((v) => v.name).sort((a, b) => a.localeCompare(b));
  throw new Error(`no ElevenLabs voice named "${name}". Your voices: ${names.join(", ") || "(none)"}`);
}

/** Voice changer: one WAV in, the converted audio out (MP3 bytes). */
export async function convertSpeech(
  key: string, f: Fetch, voiceId: string, audio: Buffer, filename: string, format: OutputFormat,
): Promise<Buffer> {
  if (audio.length > UPLOAD_MAX_BYTES) throw new Error(`${filename} is ${(audio.length / 1e6).toFixed(1)} MB; the voice changer takes files under 50 MB`);
  const form = new FormData();
  form.append("audio", new Blob([new Uint8Array(audio)], { type: "audio/wav" }), filename);
  form.append("model_id", STS_MODEL);
  const url = `${ELEVENLABS_API}/v1/speech-to-speech/${encodeURIComponent(voiceId)}?output_format=${format}`;
  const r = await f(url, { method: "POST", headers: { "xi-api-key": key }, body: form });
  if (!r.ok) throw new Error(await errorText(r));
  const out = Buffer.from(await r.arrayBuffer());
  if (out.length === 0) throw new Error("ElevenLabs returned an empty file");
  return out;
}
