// lib/dance8/klingTakesPipeline.ts
//
// Replaces the stand-in takes of a checked edit list with a generated character,
// in two commands and one round trip to Kling:
//
//   dance8 kling-takes <song> <edit.json> [--max 30]
//     cuts every part of each take the cut shows into pieces Kling can perform
//     (render/takeSegments.ts) and writes, per piece, the masked motion reference,
//     the singer's isolated voice for lip sync, and a card with the settings and
//     prompt. Nothing is uploaded or paid for here.
//   (you generate each piece in Kling: Motion Control, then Lip Sync for the singer,
//    and save the download as stuttr.mp4 in the piece's folder)
//   dance8 takes-assemble <song> <edit.json> [--matte u2net|none] [--model <onnx>]
//     puts the pieces back on the song clock (cross-fading where neighbours
//     overlap), mattes the result like the stand-ins, writes a side-by-side check
//     per piece, and writes "<edit id>-<character>.json": the same cut with the
//     generated takes in place. Render that with dance8 edit.
//
// The cells, crops, lyrics and timing of the cut stay exactly as checked: only the
// performer changes. The song clock is the one clock: a piece covers song seconds
// [songIn, songOut], cut from the stand-in at songIn + songAt0Sec, applied once.

import { createHash } from "node:crypto";
import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { basename, dirname, extname, join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { loadManifest, type Ctx } from "../stuttr/commands";
import { songPaths } from "./pipeline";
import { loadEdit } from "./editPipeline";
import { gridSec } from "./render/edit";
import { splitWindows, takeWindows, type TakeSegment } from "./render/takeSegments";
import { loadCharacter, refsRoot, takeFor } from "./klingPipeline";
import type { EditList } from "./contracts/edit";

export const TAKES_PLAN_SCHEMA = "dance8.kling-takes.v1";
/** The file name a piece's Kling download is saved as. */
export const DOWNLOAD = "stuttr.mp4";

export interface TakesPlan {
  schema: typeof TAKES_PLAN_SCHEMA;
  trackId: string;
  /** shown: the path as the owner types it (~/StuttrLibrary/... when the library is the default one). */
  edit: { id: string; file: string; shown: string; sha256: string };
  maxSec: number;
  orientation: "video" | "image";
  endSec: number;
  takes: Record<string, {
    role: "singer" | "dancer";
    character: string;
    /** The character image copied into the kit (relative to it), or null when the library has none yet. */
    image: string | null;
    /** Where the card tells the owner to take the character image from. */
    imageShown: string;
    voice: string | null;
    voiceSource: string | null;
    size: { w: number; h: number };
    aspect: "1:1" | "9:16" | "16:9";
    fps: number;
    pieces: (TakeSegment & { dir: string })[];
  }>;
}

const sha256File = (f: string) => createHash("sha256").update(readFileSync(f)).digest("hex");
const ff = (args: string[]) => {
  const r = spawnSync("ffmpeg", ["-v", "error", "-y", ...args], { encoding: "utf8", maxBuffer: 1 << 26 });
  if (r.status !== 0) throw new Error(`ffmpeg failed: ${(r.stderr || "").trim().split("\n").slice(-3).join(" | ")}`);
};
const probe = (f: string) => {
  const r = spawnSync("ffprobe", ["-v", "error", "-select_streams", "v:0", "-show_entries", "stream=width,height,r_frame_rate:format=duration", "-of", "json", f], { encoding: "utf8" });
  if (r.status !== 0) throw new Error(`ffprobe could not read ${f}`);
  const j = JSON.parse(r.stdout);
  const [n, d] = String(j.streams?.[0]?.r_frame_rate ?? "24/1").split("/").map(Number);
  return { w: Number(j.streams?.[0]?.width), h: Number(j.streams?.[0]?.height), fps: n / (d || 1), duration: Number(j.format?.duration) };
};
const aspectOf = (w: number, h: number): "1:1" | "9:16" | "16:9" => (Math.abs(w - h) / Math.max(w, h) < 0.1 ? "1:1" : h > w ? "9:16" : "16:9");
const t3 = (n: number) => n.toFixed(3);
const mmss = (s: number) => `${Math.floor(s / 60)}:${(s % 60).toFixed(1).padStart(4, "0")}`;

/** A library path as the owner types it: ~/StuttrLibrary/... for the default library, else as it is. */
function shownPath(c: Ctx, f: string): string {
  const def = join(homedir(), "StuttrLibrary");
  return resolve(c.library) === def && f.startsWith(def + "/") ? `~/StuttrLibrary/${f.slice(def.length + 1)}` : f;
}

export function takesDir(c: Ctx, trackId: string, editId: string) {
  return join(songPaths(c, trackId).dir, "kling", "takes", editId.replace(/[^A-Za-z0-9._-]/g, "_"));
}

/**
 * The Motion Control prompt. The character's look comes from its own
 * refs/cast/<character>/character.txt (look: ...), never from code, so one
 * template serves every character.
 */
export function promptFor(role: "singer" | "dancer", name: string, look: string | null): string {
  const as = look ? `${name} (${look})` : name;
  return role === "singer"
    ? `${as}, exactly as in the character image: same face, hair, clothes and accessories. No headphones, no microphone, nothing in front of the mouth. Transfer the reference's head movement, expression and timing exactly; keep the framing, the stable camera and a plain dark background. No extra people, no text, no logos.`
    : `${as}, exactly as in the character image, head to feet: same face, costume and proportions. Transfer the EXACT order, energy, steps, pauses, arm and torso movement and facing of the reference; foot contacts and held poses land on the same frames. Whole body in frame, stable camera, plain dark background. No added turns, jumps or spins, no extra limbs or people, no text, no logos.`;
}

/** kling-takes: the pieces to generate, each with its reference, voice and card. */
export function klingTakes(c: Ctx, trackId: string, editPath: string, o: { maxSec?: number } = {}): { dir: string; plan: TakesPlan } {
  const log = c.log ?? ((l: string) => console.log(l));
  const maxSec = o.maxSec ?? 30;
  if (!(maxSec >= 4 && maxSec <= 30)) throw new Error("--max takes 4 to 30 seconds (Kling Motion Control: 30 with video orientation, 10 with image orientation)");
  const { p, file, edit, lyrics, res } = loadEdit(c, trackId, editPath, { fps: 24, approved: false });
  if (!res.ok) throw new Error(`the edit list does not check out:\n${res.errors.map((e) => `  ${e.path}: ${e.message}`).join("\n")}`);
  const dir = takesDir(c, trackId, edit.id);
  mkdirSync(dir, { recursive: true });
  const track = loadManifest(c).tracks.find((x) => x.trackId === trackId)!;
  const plan: TakesPlan = {
    schema: TAKES_PLAN_SCHEMA, trackId, edit: { id: edit.id, file: basename(file), shown: shownPath(c, file), sha256: sha256File(file) },
    maxSec, orientation: maxSec > 10 ? "video" : "image", endSec: res.endSec, takes: {},
  };
  const lines = lyrics?.lines ?? [];
  const bars = Array.from({ length: Math.ceil(res.endSec / 2) }, (_, k) => gridSec(res, k, 0)).filter((s) => s <= res.endSec);
  for (const [id, tk] of Object.entries(edit.takes)) {
    if (!tk.standIn) { log(`take ${id}: not a stand-in, nothing to generate`); continue; }
    const character = tk.character ?? "stuttr";
    const ch = loadCharacter(join(refsRoot(c), "cast", character), character, character.charAt(0).toUpperCase() + character.slice(1));
    const image = tk.role === "singer" ? ch.face : ch.fullbody;
    const imageName = tk.role === "singer" ? "face.png" : "fullbody.png";
    // The character image travels with the kit, so every upload is in one folder.
    let imageShown = `${shownPath(c, join(ch.dir, imageName))} (not in this kit: upload it from there)`;
    if (image) {
      const kept = join(dir, "character", `${character}-${tk.role === "singer" ? "face" : "fullbody"}${extname(image)}`);
      mkdirSync(dirname(kept), { recursive: true });
      copyFileSync(image, kept);
      imageShown = `character/${basename(kept)} (in this kit; from ${shownPath(c, image)})`;
    } else log(`take ${id}: no ${imageName} in ${shownPath(c, ch.dir)} yet; the cards name it, add it before generating`);
    const windows = takeWindows(res, edit, id);
    if (!windows.length) { log(`take ${id}: never on screen`); continue; }
    // Cut long spans where a sung line starts or ends (singer) or on a downbeat (dancer).
    const cuts = tk.role === "singer" ? lines.flatMap((l) => [l.start, l.end]) : bars;
    const pieces = splitWindows(windows, id, tk.songAt0Sec, res.endSec, { maxSec, cuts });
    const src = join(p.dir, tk.file), z = probe(src), w = Math.floor(z.w / 2), h = z.h;
    let voiceFile: string | null = null, voiceSource: string | null = null;
    if (tk.role === "singer") {
      const vt = tk.voice ? takeFor(track, tk.voice, 0, res.endSec) : null;
      const stem = track.files.find((f) => f.role === "vocals");
      if (vt) { voiceFile = join(c.library, vt.path); voiceSource = `the approved ${tk.voice} take (${vt.path})`; }
      else if (stem) { voiceFile = join(c.library, stem.path); voiceSource = `the song's vocal stem (${stem.path})`; }
      else log(`take ${id}: no voice take or vocal stem in the library, so no lip-sync audio is cut`);
    }
    const out: TakesPlan["takes"][string]["pieces"] = [];
    for (const s of pieces) {
      const pd = join(dir, id, `${s.id}_${t3(s.songIn)}-${t3(s.songOut)}`);
      mkdirSync(pd, { recursive: true });
      // The motion reference: the stand-in alone on flat grey (its own matte), silent, exactly the piece's span.
      ff(["-ss", t3(s.takeIn), "-t", t3(s.lengthSec), "-i", src, "-filter_complex",
        `[0:v]crop=${w}:${h}:0:0[p];[0:v]crop=${w}:${h}:${w}:0,format=gray[m];[p][m]alphamerge[a];color=c=0x4a4a4a:s=${w}x${h}:r=${Math.round(z.fps)}[g];[g][a]overlay=shortest=1,format=yuv420p[v]`,
        "-map", "[v]", "-an", "-t", t3(s.lengthSec), "-c:v", "libx264", "-crf", "18", "-preset", "medium", "-movflags", "+faststart", join(pd, "reference.mp4")]);
      if (voiceFile) ff(["-ss", t3(s.songIn), "-t", t3(s.lengthSec), "-i", voiceFile, "-ac", "1", "-ar", "48000", "-c:a", "pcm_s16le", join(pd, "voice.wav")]);
      const sung = lines.filter((l) => l.start < s.songOut && l.end > s.songIn).map((l) => `  ${l.start.toFixed(2)}-${l.end.toFixed(2)} s  ${l.text}${l.timing === "aligned" ? "" : `  (${l.timing ?? "estimated"} timing)`}`);
      writeFileSync(join(pd, "CARD.txt"), [
        `${s.id}: song ${mmss(s.songIn)} to ${mmss(s.songOut)} (${s.lengthSec} s)${s.overlapSec ? `, sharing ${s.overlapSec} s with the piece before` : ""}`,
        "",
        "1. Kling, Motion Control",
        `   Character image: ${imageShown}${tk.role === "singer" ? ", head and shoulders, mouth fully visible" : ", head to feet"}`,
        "   Motion reference: reference.mp4 (this folder)",
        `   Orientation: ${plan.orientation === "video" ? "Video (follows the reference; up to 30 s)" : "Image (follows the character image; up to 10 s)"}`,
        `   Aspect ${aspectOf(w, h)}, 1080p (720p for a cheap test), sound off`,
        "   Prompt:",
        `   ${promptFor(tk.role, ch.name, ch.look)}`,
        ...(voiceFile ? ["", "2. Kling, Lip Sync on the video from step 1", "   Audio: voice.wav (this folder): the voice alone, exactly this piece's span", "   Sung here:", ...(sung.length ? sung : ["  (no sung line: Lip Sync can be skipped)"])] : []),
        "",
        `${voiceFile ? "3" : "2"}. Save the final download in this folder as ${DOWNLOAD}`,
        "",
        ...(tk.role === "singer"
          ? ["Reject and redo if: the mouth is more than 2 frames off the voice on b, p and m; the face, hair, glasses or clothes drift;",
            "anything covers the mouth; headphones or a microphone appear; text, a logo or a watermark appears; the clip is shorter than this piece."]
          : ["Reject and redo if: a step, pause or held pose lands more than 2 frames off the reference; a limb bends wrongly or vanishes;",
            "a foot slides while it should be planted; the face, costume or proportions drift; a turn, jump or spin appears that the",
            "reference does not have; text, a logo or a watermark appears; the clip is shorter than this piece."]),
      ].join("\n") + "\n");
      out.push({ ...s, dir: pd.slice(dir.length + 1) });
    }
    plan.takes[id] = { role: tk.role, character, image: image ? `character/${character}-${tk.role === "singer" ? "face" : "fullbody"}${extname(image)}` : null, imageShown, voice: tk.voice ?? null, voiceSource, size: { w, h }, aspect: aspectOf(w, h), fps: Math.round(z.fps), pieces: out };
    const secs = out.reduce((a, s) => a + s.lengthSec, 0);
    log(`take ${id} (${tk.role} -> ${character}): ${out.length} pieces, ${secs} s to generate, from ${windows.length} shown span${windows.length > 1 ? "s" : ""}`);
  }
  writeFileSync(join(dir, "plan.json"), JSON.stringify(plan, null, 1) + "\n");
  writeFileSync(join(dir, "README.md"), readme(plan));
  log(`${join(dir, "plan.json")}\nnext: generate each piece (its CARD.txt), save it as ${DOWNLOAD} in its folder, then: npm run dance8 -- takes-assemble ${trackId} ${plan.edit.shown}`);
  return { dir, plan };
}

function readme(plan: TakesPlan): string {
  const rows = Object.values(plan.takes).flatMap((tk) => tk.pieces.map((s) => `| ${s.id} | ${tk.role} | ${mmss(s.songIn)} to ${mmss(s.songOut)} | ${s.lengthSec} s | ${tk.voiceSource ? "yes" : "no"} | ${s.dir} |`));
  const n = Object.values(plan.takes).reduce((a, t) => a + t.pieces.length, 0);
  const ls = Object.values(plan.takes).filter((t) => t.role === "singer").reduce((a, t) => a + t.pieces.length, 0);
  return [
    `# ${plan.trackId}: the takes to generate for "${plan.edit.id}"`,
    "",
    `${n} pieces: ${n} Motion Control generations and ${ls} Lip Sync passes. Every piece is one continuous span of the song the cut shows,`,
    `at most ${plan.maxSec} s (${plan.orientation === "video" ? "Motion Control with video orientation" : "Motion Control with image orientation"}), and goes back at exactly that time.`,
    "",
    ...Object.values(plan.takes).map((t) => `${t.role === "singer" ? "Singer" : "Dancer"} character image: ${t.imageShown}`),
    "",
    "For each piece, in its folder:",
    "",
    "1. Open CARD.txt. In Kling, Motion Control: the character image it names, reference.mp4 as the motion, the settings and the prompt it gives.",
    "2. Singer pieces: run Lip Sync on that result with voice.wav (the voice alone, cut to the piece).",
    `3. Save the final download in the piece's folder as ${DOWNLOAD}.`,
    "",
    "Then, in the repo:",
    "",
    "```",
    `npm run dance8 -- takes-assemble ${plan.trackId} ${plan.edit.shown} --model ~/.u2net/u2net_human_seg.onnx`,
    "```",
    "",
    "It checks every download, puts the pieces back on the song clock, mattes them and writes the cut with the new takes",
    "in place, plus check.mp4 in each folder (your take beside the generated one, with the voice) for the 2-frame review.",
    "",
    "| Piece | Take | Song | Length | Lip Sync | Folder |",
    "| --- | --- | --- | --- | --- | --- |",
    ...rows,
    "",
  ].join("\n");
}

function findDownload(dir: string): string | null {
  const exact = join(dir, DOWNLOAD);
  if (existsSync(exact)) return exact;
  const mp4 = readdirSync(dir).filter((n) => /\.(mp4|mov)$/i.test(n) && !/^(reference|check)\.mp4$/i.test(n)).map((n) => join(dir, n));
  return mp4.sort((a, b) => statSync(b).mtimeMs - statSync(a).mtimeMs)[0] ?? null;
}

/** takes-assemble: the generated pieces back on the song clock, matted, and the cut that uses them. */
export function takesAssemble(c: Ctx, trackId: string, editPath: string, o: { matte?: "u2net" | "none"; model?: string; python?: string } = {}): { edit: string; takes: Record<string, string> } {
  const log = c.log ?? ((l: string) => console.log(l));
  const matte = o.matte ?? "u2net";
  const { p, file, edit } = loadEdit(c, trackId, editPath, { fps: 24, approved: false });
  const dir = takesDir(c, trackId, edit.id);
  const planFile = join(dir, "plan.json");
  if (!existsSync(planFile)) throw new Error(`no plan at ${planFile}; run: npm run dance8 -- kling-takes ${trackId} ${editPath}`);
  const plan = JSON.parse(readFileSync(planFile, "utf8")) as TakesPlan;
  if (plan.edit.sha256 !== sha256File(file)) log(`warning: ${basename(file)} changed since the plan was made; the pieces still cover the spans planned then`);
  if (matte === "u2net" && !(o.model && existsSync(o.model))) throw new Error("--model must name the u2net_human_seg.onnx file (scripts/dance8/alpha_pack.py says where it comes from), or use --matte none for a preview without mattes");
  // Every download first: a missing or short piece stops before anything is written.
  const problems: string[] = [];
  const downloads = new Map<string, string>();
  for (const tk of Object.values(plan.takes)) for (const s of tk.pieces) {
    const f = findDownload(join(dir, s.dir));
    if (!f) { problems.push(`${s.id}: no ${DOWNLOAD} in ${s.dir}`); continue; }
    const z = probe(f);
    if (!(z.duration >= s.lengthSec - 0.25)) problems.push(`${s.id}: ${basename(f)} runs ${z.duration.toFixed(2)} s, the piece needs ${s.lengthSec} s`);
    downloads.set(s.id, f);
  }
  if (problems.length) throw new Error(`not ready to assemble:\n${problems.map((x) => `  ${x}`).join("\n")}`);
  const out: Record<string, string> = {};
  const next: EditList = JSON.parse(JSON.stringify(edit));
  const takesOut = join(p.dir, "takes");
  mkdirSync(takesOut, { recursive: true });
  for (const [id, tk] of Object.entries(plan.takes)) {
    const { w, h } = tk.size, fps = 24;
    // One canvas the length of the song; each piece laid in at its song time, fading in over what it shares with the piece before.
    const inputs: string[] = [], chains: string[] = [];
    tk.pieces.forEach((s, i) => {
      inputs.push("-i", downloads.get(s.id)!);
      const fade = s.overlapSec > 0 ? `,fade=t=in:st=${t3(s.songIn)}:d=${t3(s.overlapSec)}:alpha=1` : "";
      chains.push(`[${i}:v]fps=${fps},scale=${w}:${h}:force_original_aspect_ratio=increase,crop=${w}:${h},trim=0:${t3(s.lengthSec)},setpts=PTS-STARTPTS+${t3(s.songIn)}/TB,format=yuva420p${fade}[p${i}]`);
    });
    const base = `color=c=black:s=${w}x${h}:r=${fps}:d=${t3(plan.endSec)}[b0]`;
    const overlays = tk.pieces.map((_, i) => `[b${i}][p${i}]overlay=eof_action=pass:repeatlast=0[b${i + 1}]`);
    const assembled = join(takesOut, `${edit.id}-${id}-${tk.character}.mp4`);
    ff([...inputs, "-filter_complex", [base, ...chains, ...overlays].join(";"), "-map", `[b${tk.pieces.length}]`, "-t", t3(plan.endSec), "-an", "-c:v", "libx264", "-crf", "16", "-preset", "medium", "-pix_fmt", "yuv420p", assembled]);
    const pack = join(takesOut, `${edit.id}-${id}-${tk.character}_pack.mp4`);
    if (matte === "u2net") {
      const py = o.python ?? "python3";
      const script = join(process.cwd(), "scripts", "dance8", "alpha_pack.py");
      if (!existsSync(script)) throw new Error(`run this from the repo root (no ${script})`);
      const r = spawnSync(py, ["-I", script, assembled, pack, o.model!, "--size", `${w}x${h}`, "--fps", String(fps)], { encoding: "utf8", stdio: ["ignore", "inherit", "pipe"] });
      if (r.status !== 0) throw new Error(`the matte failed: ${(r.stderr || "").trim().split("\n").slice(-2).join(" | ")}`);
    } else {
      // Preview only: a white matte (the whole picture counts as the performer).
      ff(["-i", assembled, "-filter_complex", `[0:v]split[a][b];[b]drawbox=c=white:t=fill[m];[a][m]hstack,format=yuv420p[v]`, "-map", "[v]", "-c:v", "libx264", "-crf", "16", "-preset", "medium", pack]);
    }
    // The 2-frame review: the stand-in reference beside the generated piece, with the voice when there is one.
    for (const s of tk.pieces) {
      const pd = join(dir, s.dir), ref = join(pd, "reference.mp4"), voice = join(pd, "voice.wav");
      const args = ["-i", ref, "-i", downloads.get(s.id)!, ...(existsSync(voice) ? ["-i", voice] : [])];
      ff([...args, "-filter_complex", `[1:v]scale=${w}:${h}:force_original_aspect_ratio=increase,crop=${w}:${h},setsar=1[g];[0:v]setsar=1[r];[r][g]hstack,format=yuv420p[v]`,
        "-map", "[v]", ...(existsSync(voice) ? ["-map", "2:a", "-c:a", "aac"] : ["-an"]), "-t", t3(s.lengthSec), "-c:v", "libx264", "-crf", "20", join(pd, "check.mp4")]);
    }
    const rel = pack.slice(p.dir.length + 1);
    next.takes[id] = { ...edit.takes[id], file: rel, songAt0Sec: 0, standIn: false, approved: false, generated: { plan: planFile.slice(p.dir.length + 1), planSha256: sha256File(planFile), pieces: tk.pieces.length } };
    out[id] = pack;
    log(`take ${id}: ${tk.pieces.length} pieces -> ${rel}${matte === "none" ? " (preview: no matte)" : ""}`);
  }
  next.id = `${edit.id}-${Object.values(plan.takes)[0]?.character ?? "generated"}`;
  const editOut = join(dirname(file), `${next.id}.json`);
  writeFileSync(editOut, JSON.stringify(next, null, 1) + "\n");
  const check = loadEdit(c, trackId, editOut, { fps: 24, approved: false }).res;
  if (!check.ok) throw new Error(`the new cut does not check out:\n${check.errors.map((e) => `  ${e.path}: ${e.message}`).join("\n")}`);
  log(`${editOut}\nnext: watch each piece's check.mp4, then render: npm run dance8 -- edit ${trackId} ${shownPath(c, editOut)}`);
  return { edit: editOut, takes: out };
}
