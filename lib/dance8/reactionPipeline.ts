// lib/dance8/reactionPipeline.ts
//
// Renders the visual reaction layer (canon D8-25) to files: one silent overlay
// per window, a reduced-motion overlay beside it, and, when source footage is
// given, the footage excerpts, the composites and a preview page. Writes a
// manifest with every input and output hash and the checks it ran. Offline:
// no network, no paid service. Dance8 reads only the saved Stuttr feature file,
// never a master (D8-14); the footage is read, never written.

import { spawn, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename, join } from "node:path";
import { featuresSha256, readFeatures } from "../stuttr/visualFeatures";
import { REACTION_MANIFEST_SCHEMA, REACTION_RENDERER, type PlannedWindow, type ReactionTrack, type VerifiedEventInput } from "./reaction/contracts";
import { baseExcerptArgs, compositeArgs, concatArgs, overlayEncodeArgs } from "./reaction/ffmpeg";
import { parseWindows, planReactionTrack } from "./reaction/plan";
import { previewHtml, type PreviewWindow } from "./reaction/preview";
import { frameStream, maxFlashesPerSecond, renderWindow, tileLuma, type Features } from "./reaction/render";

const sha256File = (p: string) => createHash("sha256").update(readFileSync(p)).digest("hex");

interface Probe { width: number; height: number; fps: { num: number; den: number } | null; frames: number | null; audioStreams: number; videoStreams: number; durationSec: number }

export function probe(path: string): Probe {
  const r = spawnSync("ffprobe", ["-v", "error", "-show_entries", "stream=codec_type,width,height,r_frame_rate,nb_frames:format=duration", "-of", "json", path], { encoding: "utf8" });
  if (r.status !== 0) throw new Error(`ffprobe could not read ${basename(path)}`);
  const j = JSON.parse(r.stdout) as { streams: { codec_type: string; width?: number; height?: number; r_frame_rate?: string; nb_frames?: string }[]; format: { duration?: string } };
  const v = j.streams.find((s) => s.codec_type === "video");
  const [n, d] = (v?.r_frame_rate ?? "0/1").split("/").map(Number);
  return {
    width: v?.width ?? 0, height: v?.height ?? 0, fps: n > 0 && d > 0 ? { num: n, den: d } : null,
    frames: v?.nb_frames ? Number(v.nb_frames) : null,
    audioStreams: j.streams.filter((s) => s.codec_type === "audio").length,
    videoStreams: j.streams.filter((s) => s.codec_type === "video").length,
    durationSec: Number(j.format.duration ?? 0),
  };
}

function run(args: string[]): void {
  const r = spawnSync("ffmpeg", args, { encoding: "utf8" });
  if (r.status !== 0) throw new Error(`ffmpeg failed: ${r.stderr.trim().split("\n").slice(-2).join(" ")}`);
}

/** Streams the window's frames into ffmpeg; returns the raw-frame hash and the worst flash rate. */
async function encodeWindow(track: ReactionTrack, w: PlannedWindow, f: Features, size: { width: number; height: number }, outPath: string) {
  const ff = spawn("ffmpeg", overlayEncodeArgs({ ...size, fps: track.fps, outPath }), { stdio: ["pipe", "ignore", "pipe"] });
  let err = "";
  ff.stderr.on("data", (d) => { err += String(d); });
  const done = new Promise<void>((res, rej) => ff.on("close", (code) => (code === 0 ? res() : rej(new Error(`ffmpeg failed: ${err.trim().split("\n").pop()}`)))));
  const tiles: number[][] = [];
  const hash = createHash("sha256");
  let frames = 0;
  for (const rgb of frameStream(track, w, f, size)) {
    hash.update(rgb);
    tiles.push(tileLuma(rgb, size.width, size.height));
    frames++;
    if (!ff.stdin.write(rgb)) await new Promise<void>((r) => ff.stdin.once("drain", () => r()));
  }
  ff.stdin.end();
  await done;
  const rendered = { frames, framesSha256: hash.digest("hex") };
  const series = tiles[0] ? tiles[0].map((_, i) => Float64Array.from(tiles, (t) => t[i])) : [];
  return { ...rendered, flashes: maxFlashesPerSecond(series, track.fps.num / track.fps.den) };
}

export interface ReactionRunOptions {
  featuresPath: string;
  windowsPath: string;
  outDir: string;
  eventsPath?: string;
  basePath?: string;
  songId?: string;
  expectSourceSha256?: string;
  size?: { width: number; height: number };
  log?: (line: string) => void;
}

interface Check { name: string; pass: boolean; detail: string }

export async function renderReaction(o: ReactionRunOptions) {
  const log = o.log ?? (() => {});
  mkdirSync(o.outDir, { recursive: true });
  const featuresText = readFileSync(o.featuresPath, "utf8");
  const fSha = featuresSha256(featuresText);
  const windows = parseWindows(readFileSync(o.windowsPath, "utf8"), basename(o.windowsPath));
  const events = o.eventsPath ? (JSON.parse(readFileSync(o.eventsPath, "utf8")) as { events?: VerifiedEventInput[] }).events ?? [] : [];
  const songId = o.songId ?? (JSON.parse(featuresText) as { trackId?: string }).trackId ?? "song";
  const plan = (reducedMotion: boolean) => planReactionTrack({ songId, featuresText, featuresSha256: fSha, expectSourceSha256: o.expectSourceSha256, windows, events, reducedMotion });
  const normal = plan(false);
  const reduced = plan(true);
  const checks: Check[] = [];
  const check = (name: string, pass: boolean, detail: string) => { checks.push({ name, pass, detail }); log(`${pass ? "ok  " : "FAIL"} ${name}: ${detail}`); };

  const baseBefore = o.basePath ? sha256File(o.basePath) : null;
  const base = o.basePath ? probe(o.basePath) : null;
  const size = o.size ?? (base ? { width: base.width, height: base.height } : { width: 960, height: 540 });
  if (base && normal.features) {
    const same = base.fps && base.fps.num * normal.track.fps.den === normal.track.fps.num * base.fps.den;
    check("footage frame rate matches the feature track", !!same, `${base.fps ? `${base.fps.num}/${base.fps.den}` : "unknown"} vs ${normal.track.fps.num}/${normal.track.fps.den}`);
    if (!same) throw new Error("the footage's frame rate differs from the feature track's; measure the features at the footage's rate");
  }

  const outputs: { window: string; reducedMotion: boolean; file: string; sha256: string; framesSha256: string; frames: number; audioStreams: number; maxFlashesPerSecond: number }[] = [];
  const preview: PreviewWindow[] = [];
  const composites: string[] = [];
  const f = normal.features ? readFeatures(normal.features) : null;
  for (const [i, w] of normal.track.windows.entries()) {
    const stem = `${String(i + 1).padStart(2, "0")}-${w.family.toLowerCase().replace(/_/g, "-")}`;
    if (!w.renderable || !f) { log(`held  ${w.id}: nothing drawn; the edit keeps its source footage`); continue; }
    const rw = reduced.track.windows[i];
    const files = { overlay: `${stem}.overlay.mp4`, reduced: `${stem}.overlay-reduced.mp4`, base: `${stem}.original.mp4`, hybrid: `${stem}.hybrid.mp4` };
    for (const [trk, win, file, red] of [[normal.track, w, files.overlay, false], [reduced.track, rw, files.reduced, true]] as const) {
      const r = await encodeWindow(trk, win, f, size, join(o.outDir, file));
      const p = probe(join(o.outDir, file));
      outputs.push({ window: w.id, reducedMotion: red, file, sha256: sha256File(join(o.outDir, file)), framesSha256: r.framesSha256, frames: p.frames ?? 0, audioStreams: p.audioStreams, maxFlashesPerSecond: r.flashes });
      check(`${file}: ${win.frames} frames`, p.frames === win.frames, `${p.frames} encoded`);
      check(`${file}: silent`, p.audioStreams === 0, `${p.audioStreams} audio stream(s)`);
      check(`${file}: at most 3 flashes a second`, r.flashes <= 3, `${r.flashes}`);
      log(`wrote ${file}`);
    }
    if (o.basePath) {
      run(baseExcerptArgs({ basePath: o.basePath, startFrame: w.startFrame, frames: w.frames, fps: normal.track.fps, outPath: join(o.outDir, files.base) }));
      run(compositeArgs({ basePath: o.basePath, overlayPath: join(o.outDir, files.overlay), startFrame: w.startFrame, frames: w.frames, fps: normal.track.fps, outPath: join(o.outDir, files.hybrid) }));
      const hp = probe(join(o.outDir, files.hybrid));
      check(`${files.hybrid}: sound once`, hp.audioStreams === 1, `${hp.audioStreams} audio stream(s)`);
      check(`${files.hybrid}: ${w.frames} frames`, hp.frames === w.frames, `${hp.frames} encoded`);
      composites.push(files.hybrid);
      preview.push({ id: w.id, family: w.family, scene: w.scene, musicStartSec: w.startFrame * normal.track.fps.den / normal.track.fps.num, musicEndSec: (w.startFrame + w.frames) * normal.track.fps.den / normal.track.fps.num, base: files.base, overlay: files.overlay, reduced: files.reduced });
      log(`wrote ${files.base} and ${files.hybrid}`);
    }
  }
  // Repeatability: the first renderable window again, raw frames compared.
  const first = normal.track.windows.find((w) => w.renderable);
  if (first && f) {
    const again = renderWindow(normal.track, first, f, size).framesSha256;
    const before = outputs.find((x) => x.window === first.id && !x.reducedMotion)?.framesSha256;
    check("same inputs, same frames", again === before, `${first.id}: ${again.slice(0, 16)}…`);
  }
  let proof: { file: string; sha256: string; frames: number; audioStreams: number } | null = null;
  if (composites.length) {
    const list = join(o.outDir, "proof-parts.txt");
    writeFileSync(list, composites.map((c) => `file '${join(o.outDir, c).replace(/'/g, "'\\''")}'`).join("\n") + "\n");
    run(concatArgs(list, join(o.outDir, "proof.hybrid.mp4")));
    const p = probe(join(o.outDir, "proof.hybrid.mp4"));
    const want = normal.track.windows.filter((w) => w.renderable).reduce((s, w) => s + w.frames, 0);
    proof = { file: "proof.hybrid.mp4", sha256: sha256File(join(o.outDir, "proof.hybrid.mp4")), frames: p.frames ?? 0, audioStreams: p.audioStreams };
    check(`proof.hybrid.mp4: ${want} frames`, p.frames === want, `${p.frames} encoded`);
    check("proof.hybrid.mp4: sound once", p.audioStreams === 1, `${p.audioStreams} audio stream(s)`);
  }
  if (o.basePath) check("source footage unchanged", sha256File(o.basePath) === baseBefore, `${baseBefore?.slice(0, 16)}…`);

  // Captions stay a separate, editable file (GOV-23): window names and any verified move words.
  const srt = normal.track.windows.filter((w) => w.renderable).map((w, i) => {
    const t = (s: number) => new Date(s * 1000).toISOString().slice(11, 23).replace(".", ",");
    const s0 = w.startFrame * normal.track.fps.den / normal.track.fps.num;
    return `${i + 1}\n${t(s0)} --> ${t(s0 + 2.5)}\n${w.family.replace(/_/g, " ")}: audio-driven visual, not hardware\n`;
  }).join("\n");
  writeFileSync(join(o.outDir, "labels.draft.srt"), srt);
  const csv = ["window,family,scene,song_start_s,song_end_s,start_frame,frames,overlay,overlay_sha256,reduced_overlay,blend",
    ...normal.track.windows.filter((w) => w.renderable).map((w) => {
      const stem = `${String(normal.track.windows.indexOf(w) + 1).padStart(2, "0")}-${w.family.toLowerCase().replace(/_/g, "-")}`;
      const ov = outputs.find((x) => x.window === w.id && !x.reducedMotion);
      return [w.id, w.family, w.scene ?? "", (w.startFrame * normal.track.fps.den / normal.track.fps.num).toFixed(3), ((w.startFrame + w.frames) * normal.track.fps.den / normal.track.fps.num).toFixed(3), w.startFrame, w.frames, `${stem}.overlay.mp4`, ov?.sha256 ?? "", `${stem}.overlay-reduced.mp4`, "Screen"].join(",");
    })].join("\n") + "\n";
  writeFileSync(join(o.outDir, "placements.csv"), csv);
  if (preview.length) writeFileSync(join(o.outDir, "preview.html"), previewHtml(`${songId}: visual reaction layer (draft)`, preview, normal.track.limits));

  const manifest = {
    schema: REACTION_MANIFEST_SCHEMA, renderer: REACTION_RENDERER, songId,
    inputs: {
      features: { file: basename(o.featuresPath), sha256: fSha, audioSha256: normal.track.features.sourceSha256 },
      windows: { file: basename(o.windowsPath), sha256: sha256File(o.windowsPath) },
      events: o.eventsPath ? { file: basename(o.eventsPath), sha256: sha256File(o.eventsPath) } : null,
      footage: o.basePath ? { file: basename(o.basePath), sha256: baseBefore } : null,
    },
    size, track: normal.track, reducedTrack: { holds: reduced.track.holds, windows: reduced.track.windows.map((w) => ({ id: w.id, renderable: w.renderable })) },
    outputs, proof, checks,
    paidCalls: 0, network: "none",
    rollback: "Delete this folder, or leave the overlays off the timeline: the source footage and the music are untouched.",
  };
  writeFileSync(join(o.outDir, "reaction-manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`);
  return { manifest, held: normal.track.holds, failed: checks.filter((c) => !c.pass) };
}

export const reactionInputsExist = (paths: (string | undefined)[]) => paths.filter((p): p is string => !!p && !existsSync(p));
