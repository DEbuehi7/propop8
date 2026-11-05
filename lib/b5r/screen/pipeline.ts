// lib/b5r/screen/pipeline.ts
//
// File side of the AIM-B5R photo screen, run on the owner's computer:
//   npm run b5r -- screen <photo or folder ...> [--intent "..."] [--name x] [--dry]
// 1. Reads up to 20 photos (JPEG, PNG, WebP, GIF; HEIC through macOS sips),
//    fingerprints each original, and makes a resized JPEG copy without its
//    location data (about 1.15 megapixels, the vision docs' advice).
// 2. Stops if a name on the owner's private blocked-names list appears in the
//    intent or a photo's path (canon GOV-16: no employer worksites).
// 3. Shows the cost before anything is sent; --dry stops there.
// 4. Sends the copies to Claude once (./claude), checks the answer by fixed
//    rules (./contract) and writes report.html and report.json (./report).
// Everything goes to ~/AIMScenes/<date>-<name>/, never into this repository,
// which is public.

import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { basename, extname, isAbsolute, join, relative, resolve } from "node:path";
import { askClaude, costUsd, DEFAULT_MODEL, imageTokens, KEY_ENV, MAX_OUTPUT_TOKENS, MODEL_PRICES, PRICE_SOURCE, requestBody, type Fetch, type ScreenPhoto } from "./claude";
import { SYSTEM_PROMPT, TOOL, validateObservations } from "./contract";
import { buildReport, reportHtml, type PhotoRecord, type ScreenReport } from "./report";

export const MAX_PHOTOS = 20;
export const TARGET_PIXELS = 1_150_000;
export const MAX_EDGE = 1568;
export const SCREENS_DIR = join(homedir(), "AIMScenes");
/** One name per line (# comments); the owner keeps it on his computer, never in the repo. */
export const BLOCKED_NAMES_FILE = "blocked-names.txt";

const IMAGE_EXT = new Set([".jpg", ".jpeg", ".png", ".webp", ".gif", ".heic", ".heif"]);

export interface ScreenOptions {
  intent?: string;
  name?: string;
  model?: string;
  dry?: boolean;
  /** Where screens are written (default ~/AIMScenes). */
  root?: string;
  /** The repository, which output must never be inside. */
  repo?: string;
  key?: string;
  fetch?: Fetch;
  now?: () => string;
  log?: (line: string) => void;
}

/** The photo files named: files as given, folders' image files in name order. */
export function collectPhotos(paths: string[]): string[] {
  const out: string[] = [];
  for (const p of paths) {
    const abs = resolve(p);
    if (!existsSync(abs)) throw new Error(`${p} does not exist`);
    if (statSync(abs).isDirectory()) {
      for (const n of readdirSync(abs).sort()) if (!n.startsWith(".") && IMAGE_EXT.has(extname(n).toLowerCase())) out.push(join(abs, n));
    } else if (IMAGE_EXT.has(extname(abs).toLowerCase())) out.push(abs);
    else throw new Error(`${p} is not a photo (JPEG, PNG, WebP, GIF or HEIC)`);
  }
  const unique = [...new Set(out)];
  if (!unique.length) throw new Error("no photos found");
  if (unique.length > MAX_PHOTOS) throw new Error(`${unique.length} photos; a screen takes up to ${MAX_PHOTOS}: pick the ones that show the most`);
  return unique;
}

/** Names on the private blocked list that appear in the text (whole words, any case). */
export function blockedHits(text: string, names: string[]): string[] {
  const t = text.toLowerCase();
  return names.filter((n) => {
    const k = n.trim().toLowerCase();
    return k && new RegExp(`(^|[^a-z0-9])${k.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}($|[^a-z0-9])`).test(t);
  });
}

export function readBlockedNames(root: string): string[] | null {
  const f = join(root, BLOCKED_NAMES_FILE);
  if (!existsSync(f)) return null;
  return readFileSync(f, "utf8").split(/\r?\n/).map((l) => l.trim()).filter((l) => l && !l.startsWith("#"));
}

const slug = (s: string) => s.normalize("NFKD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40) || "screen";

/** Size that fits both limits, keeping the shape. */
export function fitSize(w: number, h: number): { width: number; height: number } {
  const s = Math.min(1, MAX_EDGE / Math.max(w, h), Math.sqrt(TARGET_PIXELS / (w * h)));
  return { width: Math.max(1, Math.round(w * s)), height: Math.max(1, Math.round(h * s)) };
}

/** sharp 0.35 ships ES-module types: the callable is the default export. */
async function loadSharp(): Promise<(typeof import("sharp"))["default"]> {
  try {
    return (await import("sharp")).default;
  } catch {
    throw new Error("the image library (sharp) isn't installed; run npm install in the repository");
  }
}

/** A HEIC photo as a temporary JPEG via macOS sips; elsewhere, ask for a JPEG. */
function heicToJpeg(file: string, tmp: string): string {
  const out = join(tmp, `${basename(file, extname(file))}.jpg`);
  const r = spawnSync("sips", ["-s", "format", "jpeg", file, "--out", out], { encoding: "utf8" });
  if (r.status !== 0 || !existsSync(out)) throw new Error(`${basename(file)}: HEIC needs macOS (sips); export it as JPEG instead`);
  return out;
}

export async function screenPhotos(paths: string[], o: ScreenOptions = {}): Promise<{ dir: string; report: ScreenReport | null; estimateUsd: { likely: number | null; most: number | null } }> {
  const log = o.log ?? ((l: string) => console.log(l));
  const model = o.model ?? DEFAULT_MODEL;
  if (!(model in MODEL_PRICES)) throw new Error(`unknown model "${model}"; one of: ${Object.keys(MODEL_PRICES).join(", ")}`);
  const root = resolve(o.root ?? SCREENS_DIR);
  const repo = o.repo ? resolve(o.repo) : null;
  if (repo) {
    const r = relative(repo, root);
    if (!r.startsWith("..") && !isAbsolute(r)) throw new Error("screens hold real photos, so they can't be written inside the repository (it is public)");
  }
  const files = collectPhotos(paths);
  const intent = o.intent?.trim() || null;

  // GOV-16: the owner's private list of employer names and worksites.
  const blocked = readBlockedNames(root);
  if (blocked === null) log(`note: no ${join(root, BLOCKED_NAMES_FILE)} yet; add your employers' building names to it (one per line) so a screen stops on them (canon GOV-16)`);
  const hits = blockedHits([intent ?? "", ...files].join("\n"), blocked ?? []);
  if (hits.length) throw new Error(`stopped: "${hits[0]}" is on your blocked-names list. No employer worksite or imagery without written clearance (canon GOV-16)`);

  const sharp = await loadSharp();
  const now = o.now ? o.now() : new Date().toISOString();
  const name = slug(o.name ?? (intent ? intent.split(/\s+/).slice(0, 4).join(" ") : basename(files[0], extname(files[0]))));
  let dir = join(root, `${now.slice(0, 10)}-${name}`);
  for (let i = 2; existsSync(dir); i++) dir = join(root, `${now.slice(0, 10)}-${name}-${i}`);
  mkdirSync(join(dir, "photos"), { recursive: true });

  const tmp = mkdtempSync(join(tmpdir(), "aim-screen-"));
  const records: PhotoRecord[] = [];
  const sent: ScreenPhoto[] = [];
  try {
    for (const [i, file] of files.entries()) {
      const n = i + 1;
      const original = readFileSync(file);
      const ext = extname(file).toLowerCase();
      const src = ext === ".heic" || ext === ".heif" ? heicToJpeg(file, tmp) : file;
      const img = sharp(src).rotate(); // upright by its EXIF orientation; the copy keeps no metadata
      const meta = await img.metadata();
      const w0 = meta.autoOrient?.width ?? meta.width ?? 0;
      const h0 = meta.autoOrient?.height ?? meta.height ?? 0;
      if (!w0 || !h0) throw new Error(`${basename(file)}: can't read its size`);
      const { width, height } = fitSize(w0, h0);
      const data = await img.resize(width, height).jpeg({ quality: 85 }).toBuffer();
      const rel = `photos/${String(n).padStart(2, "0")}.jpg`;
      writeFileSync(join(dir, rel), data);
      records.push({ n, original: basename(file), sha256: createHash("sha256").update(original).digest("hex"), file: rel, width, height });
      sent.push({ n, mediaType: "image/jpeg", data });
    }
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }

  // The cost, before anything is sent: image tokens by the docs' formula, text at about 3.5 characters a token.
  const textTokens = Math.ceil((SYSTEM_PROMPT.length + JSON.stringify(TOOL).length + (intent?.length ?? 0) + 200) / 3.5);
  const inTokens = records.reduce((s, p) => s + imageTokens(p.width, p.height), 0) + textTokens;
  const estimateUsd = { likely: costUsd(model, inTokens, 2500), most: costUsd(model, inTokens, MAX_OUTPUT_TOKENS) };
  log(`${records.length} photo(s) ready in ${dir}`);
  log(estimateUsd.most === null
    ? `cost: ${model}'s price isn't published, so the cost is unknown (about ${inTokens.toLocaleString("en-US")} input tokens)`
    : `cost: about $${estimateUsd.likely!.toFixed(2)}, at most $${estimateUsd.most.toFixed(2)} (${model}, about ${inTokens.toLocaleString("en-US")} input tokens)`);

  const meta = { title: o.name ?? (intent ? `Screen: ${intent.slice(0, 60)}` : `Screen: ${records[0].original}`), createdAt: now, intent, model, priceSource: PRICE_SOURCE, photos: records };
  if (o.dry) {
    writeFileSync(join(dir, "request.json"), JSON.stringify({ model, photos: records, intent, estimatedInputTokens: inTokens, estimateUsd, maxOutputTokens: MAX_OUTPUT_TOKENS }, null, 2) + "\n");
    log("dry run: nothing was sent. Run again without --dry to screen them.");
    return { dir, report: null, estimateUsd };
  }

  const key = o.key ?? process.env[KEY_ENV];
  if (!key) throw new Error(`set ${KEY_ENV} in your shell first (the key is read by name and never saved)`);
  const answer = await askClaude(key, o.fetch ?? fetch, requestBody(model, sent, intent));
  const { obs, setAside } = validateObservations(answer.input, records.length);
  const report = buildReport(obs, setAside, {
    ...meta, model: answer.model, usage: answer.usage, costUsd: costUsd(model, answer.usage.inputTokens, answer.usage.outputTokens),
  });
  writeFileSync(join(dir, "report.json"), JSON.stringify({ report, modelAnswer: answer.input }, null, 2) + "\n");
  writeFileSync(join(dir, "report.html"), reportHtml(report));
  log(`report: ${join(dir, "report.html")}`);
  log(`${report.hazards.length} hazard(s) to check, ${report.opportunities.reduce((s, g) => s + g.items.length, 0)} idea(s) to investigate, ${setAside.length} item(s) set aside; every gate HOLD`);
  if (report.meta.costUsd !== null) log(`cost: $${report.meta.costUsd.toFixed(2)} (${answer.usage.inputTokens} in, ${answer.usage.outputTokens} out)`);
  log(`open it: open "${join(dir, "report.html")}"`);
  return { dir, report, estimateUsd };
}
