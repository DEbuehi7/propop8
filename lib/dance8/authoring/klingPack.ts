// lib/dance8/authoring/klingPack.ts
//
// The manual Kling pack (step 3 of the reviewed Producer plan): one upload
// card per shot in the song's shot list, each with the files to upload and a
// prompt compiled from a fixed template. The words come from Daniel's own
// reference folders: a scene.txt per set (place, light...) and a
// character.txt per character (name, look). Code only fills the template, so
// the same shot list and the same reference files always give the same
// prompts (GOV-14), and a prompt never mentions tempo, beats or sections: the
// edit puts every clip on the bar grid itself (D8-01). Pure: no files.
//
// Reference folders (private, in the Stuttr library; folder names decide what
// a file is, never AI):
//   refs/cast/<character>/face.png       the face, mouth fully visible (lip sync)
//   refs/cast/<character>/fullbody.png   head to feet, same costume (dance, wide shots)
//   refs/cast/<character>/character.txt  name: ... / look: ...
//   refs/scenes/<scene>/master.png       the set's first-frame image
//   refs/scenes/<scene>/dancer.png       optional: the scene's dancer standing in the set
//   refs/scenes/<scene>/scene.txt        place: ... / light: ... / hidden: ... / dancer: ... / skater: ... / cast: ...

import { voiceKey } from "../../stuttr/library";
import type { AspectRatio, CameraShot } from "../contracts/scene";
import type { ShotBrief } from "./shotBriefs";

export const SCENE_TEXT = "scene.txt";
export const CHARACTER_TEXT = "character.txt";
export const IMAGE_EXTS = ["png", "jpg", "jpeg", "webp"] as const;
/** Kling's prompt limit (characters). */
export const KLING_PROMPT_MAX = 2500;

/** Scene ids plan writes before Daniel names the places (intro, verse-1, chorus...). */
export const isPlaceholderScene = (id: string) => /^(intro|outro|chorus|build|break|unknown|verse-\d+)$/.test(id);

/** "key: value" lines; # starts a comment. Keys are lower case; an empty value counts as absent. */
export function parseFields(text: string): { fields: Record<string, string>; issues: string[] } {
  const fields: Record<string, string> = {};
  const issues: string[] = [];
  text.split(/\r?\n/).forEach((raw, i) => {
    const line = raw.trim();
    if (!line || line.startsWith("#")) return;
    const k = line.indexOf(":");
    if (k <= 0) { issues.push(`line ${i + 1} has no "key:" (${line.slice(0, 40)})`); return; }
    const key = line.slice(0, k).trim().toLowerCase();
    const value = line.slice(k + 1).trim();
    if (key in fields) issues.push(`"${key}" is given twice; the last one counts`);
    if (value) fields[key] = value;
    else delete fields[key];
  });
  return { fields, issues };
}

/** "Stuttr=brick-built-stuttr, Mo=mo" -> { stuttr: "brick-built-stuttr", mo: "mo" } (voice keys to character folders). */
export function parseCast(v: string | undefined): Record<string, string> {
  const out: Record<string, string> = {};
  for (const part of (v ?? "").split(",")) {
    const [voice, who] = part.split("=").map((s) => s.trim());
    if (voice && who) out[voiceKey(voice)] = voiceKey(who);
  }
  return out;
}

export interface CharacterRefs {
  id: string;
  name: string;
  look: string | null;
  face: string | null;
  fullbody: string | null;
  dir: string;
}

export interface SceneRefs {
  id: string;
  place: string | null;
  light: string | null;
  hidden: string | null;
  /** Voice key -> character folder, where a voice is played by another character in this scene. */
  cast: Record<string, string>;
  dancer: string | null;
  skater: string | null;
  master: string | null;
  dancerImage: string | null;
  dir: string;
  issues: string[];
}

export interface RefIndex {
  characters: Record<string, CharacterRefs>;
  scenes: Record<string, SceneRefs>;
}

export interface CardUpload {
  role: string;
  path: string | null;
  required: boolean;
  /** What the file must show, for when it is missing. */
  need: string;
}

export interface UploadCard {
  shotId: string;
  kind: ShotBrief["kind"];
  sceneId: string;
  section: string;
  camera: CameraShot;
  voice: string | null;
  songStartSec: number;
  songEndSec: number;
  /** Rename the download to exactly this. */
  download: string;
  tool: string;
  lengthSec: number;
  aspect: AspectRatio;
  cropTo: AspectRatio | null;
  resolution: string;
  keyframesSec: number[];
  uploads: CardUpload[];
  prompt: string;
  /** After generating: lip sync, then naming and saving the download. */
  steps: string[];
  missing: string[];
  ready: boolean;
}

const CAMERA_TEXT: Record<CameraShot, string> = {
  drone_wide: "High aerial drone shot, a slow steady glide over the whole set.",
  wide: "Wide shot with the whole set and full bodies in frame; the camera nearly still.",
  medium: "Medium shot from the waist up, a slow gentle push-in.",
  close: "Close-up of the face, head and shoulders; the camera steady.",
  tracking: "Smooth tracking shot moving alongside the subject at walking pace.",
  orbit: "A slow, smooth half orbit around the subject.",
};

/** What each skate trick looks like, by version (canon D8-16, D8-18). */
const TRICK_TEXT: Record<string, string> = {
  floor_carve: "rides low and carves one long, smooth arc across the ground",
  kickflip_sweep: "kickflips the board and sweeps one leg through low to the ground",
  handplant_roll: "plants one hand, swings the board overhead and rolls out",
  spin_180: "spins a half turn on the board",
  spin_360: "spins a full turn on the board",
  ollie_leap: "pops a big ollie leap",
  ollie_standard: "pops a big ollie leap",
  ollie_low: "pops a quick, low ollie",
  ollie_mid: "pops a mid-height ollie leap",
  ollie_high: "pops a high ollie leap",
  board_freeze: "drops into a low freeze, balanced on one hand with the board",
  freeze_low: "drops into a low freeze, balanced on one hand with the board",
  freeze_high: "rises into a standing freeze balanced on the board",
};
const isFreeze = (k: string) => k === "board_freeze" || k.startsWith("freeze_");

const CONTINUITY = "Keep the reference character's face, hair and clothing, and the set's architecture and materials.";
const AVOID = "identity drift, clothing changes, extra limbs or fingers, warped objects, readable text, logos, real people, brands, flicker";
const DEFAULT_HIDDEN = "Details of the set and its people without faces: hands, feet, backs, silhouettes, a crowd seen from behind, the skyline";

const sec = (x: number) => `${Math.floor(x / 60)}:${(x % 60).toFixed(1).padStart(4, "0")}`;
const who = (c: CharacterRefs) => (c.look ? `${c.name}: ${c.look}` : c.name);
const line = (label: string, text: string | null) => (text ? `${label}: ${text}` : null);

export interface CompileInput {
  /** The generator's label (GENERATORS[brief.generator].label), or the id when unknown. */
  tool: string;
  /** Lip sync: the voice's approved take cut to the shot's song time, or why there is none. */
  audio?: { path: string | null; problem: string | null };
  /** Where the downloads go, for the naming step. */
  downloads: string;
}

/**
 * One shot's upload card: what to upload, the prompt, and what to do after.
 * The card is ready only when every required file and every word the prompt
 * needs is there; otherwise `missing` says what to add, where.
 */
export function compileCard(b: ShotBrief, refs: RefIndex, o: CompileInput): UploadCard {
  const scene = refs.scenes[b.sceneId];
  const missing: string[] = [];
  const uploads: CardUpload[] = [];
  const steps: string[] = [];
  const char = (slug: string | null) => (slug ? refs.characters[slug] ?? null : null);
  const need = (u: CardUpload) => {
    uploads.push(u);
    if (u.required && !u.path) missing.push(`${u.role}: ${u.need}`);
  };

  if (!scene || !scene.place || !scene.light) {
    const file = scene ? `${scene.dir}/${SCENE_TEXT}` : `the "${b.sceneId}" scene folder`;
    missing.push(`describe the set: fill in "place:" and "light:" in ${file}`);
  }
  for (const i of scene?.issues ?? []) missing.push(`${b.sceneId}/${SCENE_TEXT}: ${i}`);
  const setting = scene?.place ?? null;
  const light = scene?.light ?? null;
  let subject: string | null = null;
  let action: string | null = null;
  let camera = CAMERA_TEXT[b.camera];
  let avoid = AVOID;
  let continuity = CONTINUITY;

  if (b.kind === "lip_sync") {
    const voice = b.voice ?? "";
    const voices = voice.split("+").map((v) => v.trim()).filter(Boolean);
    if (voice === "Lead") missing.push("the song had no approved lead take when it was planned: approve the lead, then run plan again");
    else if (voice === "Backing") missing.push("Suno's own backing singers have no character to film: skip this shot (the edit keeps mouths hidden there), or cast the part to a voice in cast.json");
    else if (voices.length > 1) missing.push(`${voices.length} singers (${voice}): Kling's lip sync follows one face, so skip this shot (the edit keeps mouths hidden there) or give the part one voice in cast.json`);
    const slug = voices.length === 1 && voice !== "Lead" && voice !== "Backing" ? scene?.cast[voiceKey(voice)] ?? voiceKey(voice) : null;
    const c = char(slug);
    if (slug) {
      need({ role: "Singer's face (reference)", path: c?.face ?? null, required: true, need: `add ${c?.dir ?? `refs/cast/${slug}`}/face.png: ${voice}'s face with the mouth fully visible` });
      need({ role: "The set (reference)", path: scene?.master ?? null, required: false, need: `add ${scene?.dir ?? `refs/scenes/${b.sceneId}`}/master.png to keep the set the same in every shot` });
      if (o.audio?.path) uploads.push({ role: `Lip-sync audio (${voice}, song ${sec(b.songStartSec)} to ${sec(b.songEndSec)})`, path: o.audio.path, required: true, need: "" });
      else missing.push(`lip-sync audio: ${o.audio?.problem ?? "not cut"}`);
    }
    subject = `${c ? who(c) : voice}. One singer.`;
    action = "Sings straight to camera with clear, natural mouth movement, head steady, an expressive face.";
    avoid = `${AVOID}, hands, a microphone or hair over the lips`;
    steps.push(`Lip sync: open the finished clip in Kling's lip sync and upload the lip-sync audio above (only ${voice}'s voice, already cut to this shot).`);
  } else if (b.kind === "broll") {
    need({ role: "Start frame", path: scene?.master ?? null, required: true, need: `add ${scene?.dir ?? `refs/scenes/${b.sceneId}`}/master.png: the set's master image` });
    if (b.mouth === "hidden") {
      subject = `${scene?.hidden ?? DEFAULT_HIDDEN}. No face or mouth is visible at any moment.`;
      avoid = `${AVOID}, faces, mouths`;
    } else {
      subject = "The set and its atmosphere; any people only at a distance.";
    }
    action = "One continuous moment with gentle movement in the set (light, air, people passing); no cuts.";
    continuity = "Keep the set's architecture, materials and light from the start frame.";
  } else if (b.kind === "trick") {
    const slug = scene?.skater ? voiceKey(scene.skater) : null;
    const c = char(slug);
    if (slug) need({ role: "Skater (reference)", path: c?.fullbody ?? null, required: false, need: `add ${c?.dir ?? `refs/cast/${slug}`}/fullbody.png: the skater head to feet` });
    need({ role: "Start frame", path: scene?.master ?? null, required: true, need: `add ${scene?.dir ?? `refs/scenes/${b.sceneId}`}/master.png: the set's master image` });
    const n = b.crewCount ?? 1;
    const base = c ? who(c) : "A skater";
    subject = n > 1 ? `${n} skaters moving in unison${c ? `, dressed like ${c.name}` : ""}, full bodies in frame.` : `${base}, full body in frame.`;
    const key = b.trickVersion ?? b.trick ?? "";
    const what = TRICK_TEXT[key] ?? key.replace(/_/g, " ");
    const landing = b.keyframesSec[0];
    const lands = isFreeze(key) ? `holding the freeze from about ${landing} s into the clip` : `landing cleanly at about ${landing} s into the clip`;
    action = `${n > 1 ? "In unison, each skater" : "The skater"} ${what}, ${lands}. One trick only.`;
    continuity = "Keep the skater's clothing and board, and the set's architecture and materials.";
    camera = "Wide shot, full body and board always in frame; the camera nearly still.";
    avoid = `${AVOID}, face close-ups`;
    steps.push(`If the board lands somewhere other than ${landing} s, note the real second for approve-clip --landing.`);
  } else {
    const slug = scene?.dancer ? voiceKey(scene.dancer) : null;
    const c = char(slug);
    if (!slug) missing.push(`name the dancer: add "dancer:" (a refs/cast folder name) to ${scene?.dir ?? `refs/scenes/${b.sceneId}`}/${SCENE_TEXT}`);
    else need({
      role: "Character image (Motion Control)", path: scene?.dancerImage ?? c?.fullbody ?? null, required: true,
      need: `add ${scene?.dir ?? `refs/scenes/${b.sceneId}`}/dancer.png (the dancer standing in the set, head to feet) or ${c?.dir ?? `refs/cast/${slug}`}/fullbody.png`,
    });
    need({ role: "Motion video (your dance)", path: b.motionRef?.refFile ?? null, required: true, need: "the reference cut is missing: run npm run dance8 -- moves with the take's video, then plan again" });
    subject = c ? `${who(c)}, the only person in frame.` : "The dancer, the only person in frame.";
    action = null; // Motion Control takes the moves from the motion video.
    camera = "Full body in frame from head to feet, framed like the motion video; the camera steady.";
    continuity = "Keep the character's face, costume and props from the image, and the set's architecture and materials.";
    steps.unshift('Kling 3.0 Motion Control: keep "character orientation matches video" (the 30 s limit; it is 10 s when it follows the image).');
  }

  const prompt = [
    line("SUBJECT", subject), line("SETTING", setting), line("ACTION", action), line("CAMERA", camera), line("LIGHT", light),
    line("CONTINUITY", continuity), line("AVOID", avoid),
  ].filter((x): x is string => x !== null).join("\n");
  if (prompt.length > KLING_PROMPT_MAX) missing.push(`the prompt is ${prompt.length} characters and Kling takes ${KLING_PROMPT_MAX}: shorten the scene's or the character's words`);

  steps.push(`Download it, rename it ${b.id}.mp4 exactly (a take number like -2 is fine) and save it in ${o.downloads}.`);
  return {
    shotId: b.id, kind: b.kind, sceneId: b.sceneId, section: b.section, camera: b.camera, voice: b.voice,
    songStartSec: b.songStartSec, songEndSec: b.songEndSec, download: `${b.id}.mp4`,
    tool: o.tool, lengthSec: b.generateSec, aspect: b.aspect, cropTo: b.cropTo, resolution: b.resolution, keyframesSec: b.keyframesSec,
    uploads, prompt, steps, missing, ready: missing.length === 0,
  };
}

const KIND_ORDER: ShotBrief["kind"][] = ["broll", "lip_sync", "dance", "trick"];

/** Cards grouped by scene in the song's order (so a set's references stay loaded), then by kind and song time. */
export function sortCards(cards: UploadCard[], sceneOrder: string[]): UploadCard[] {
  const at = (s: string) => {
    const i = sceneOrder.indexOf(s);
    return i < 0 ? sceneOrder.length : i;
  };
  return [...cards].sort((a, b) => at(a.sceneId) - at(b.sceneId) || a.sceneId.localeCompare(b.sceneId)
    || KIND_ORDER.indexOf(a.kind) - KIND_ORDER.indexOf(b.kind) || a.songStartSec - b.songStartSec || a.shotId.localeCompare(b.shotId));
}

/** Every prompt as plain text, in card order. */
export function promptsText(title: string, cards: UploadCard[]): string {
  return [
    `${title}: Kling prompts, one per shot (${cards.filter((c) => c.ready).length} of ${cards.length} ready)`,
    "",
    ...cards.flatMap((c, i) => [
      `#${i + 1}  ${c.download}  (${c.kind}, ${c.tool}, ${c.lengthSec} s, ${c.cropTo ? `${c.aspect} cropped to ${c.cropTo}` : c.aspect})${c.ready ? "" : "  NOT READY"}`,
      c.prompt,
      "",
    ]),
  ].join("\n");
}

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const isImage = (p: string) => /\.(png|jpe?g|webp)$/i.test(p);

export interface PackMeta {
  title: string;
  trackId: string;
  /** Where the downloads go (shown in the header). */
  downloads: string;
  /** The command that brings the downloads in. */
  clipsCommand: string;
  /** A file's path as the page links it (relative to the page). */
  href: (abs: string) => string;
}

/**
 * The upload pack as one local page: a card per shot with its files (images
 * shown, drag them into Kling), the prompt with a copy button, the settings
 * and the steps. No network, no scripts beyond copy and a per-browser tick.
 */
export function packHtml(cards: UploadCard[], m: PackMeta): string {
  const ready = cards.filter((c) => c.ready).length;
  const kinds = (["lip_sync", "broll", "dance", "trick"] as const).map((k) => [k, cards.filter((c) => c.kind === k).length] as const).filter(([, n]) => n);
  const card = (c: UploadCard, i: number) => {
    const files = c.uploads.map((u) => u.path
      ? `<li><span class="role">${esc(u.role)}</span> <a href="${esc(m.href(u.path))}">${esc(u.path.split("/").pop()!)}</a>${isImage(u.path) ? `<br><img src="${esc(m.href(u.path))}" alt="${esc(u.role)}">` : ""}</li>`
      : u.required
        ? `<li class="need"><span class="role">${esc(u.role)}</span> missing (see above)</li>`
        : `<li class="opt"><span class="role">${esc(u.role)}</span> optional: ${esc(u.need)}</li>`).join("");
    const time = c.kind === "trick" ? "any chord change (placed by the edit)" : `song ${sec(c.songStartSec)} to ${sec(c.songEndSec)}`;
    return `<section class="card ${c.ready ? "ready" : "wait"}" id="${esc(c.shotId)}">
<header><label><input type="checkbox" data-shot="${esc(c.shotId)}"> <b>#${i + 1} ${esc(c.download)}</b></label><span class="tag ${esc(c.kind)}">${esc(c.kind.replace("_", " "))}</span><span class="state">${c.ready ? "ready" : "needs files"}</span></header>
<p class="meta">${esc(c.tool)} · ${c.lengthSec} s · ${c.cropTo ? `${esc(c.aspect)} (crop to ${esc(c.cropTo)})` : esc(c.aspect)} · ${esc(c.resolution)} · ${esc(time)} · scene <b>${esc(c.sceneId)}</b> · ${esc(c.camera.replace("_", " "))}${c.voice ? ` · ${esc(c.voice)}` : ""}</p>
${c.missing.length ? `<ul class="missing">${c.missing.map((x) => `<li>${esc(x)}</li>`).join("")}</ul>` : ""}
<ul class="files">${files}</ul>
<div class="prompt"><button type="button" data-copy="p${i}">Copy prompt</button><pre id="p${i}">${esc(c.prompt)}</pre></div>
${c.keyframesSec.length > 1 ? `<p class="meta">Keyframes (optional, for models that take several): ${c.keyframesSec.map((k) => `${k} s`).join(", ")}</p>` : ""}
<ol class="steps">${c.steps.map((s) => `<li>${esc(s)}</li>`).join("")}</ol>
</section>`;
  };
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(m.title)} · Kling pack</title>
<style>
:root{--bg:#f6f5f2;--fg:#1d1d1f;--mut:#6b6b70;--card:#fff;--line:#dedcd6;--ok:#1f7a4d;--warn:#a5530a;--acc:#3a4fa0}
@media (prefers-color-scheme:dark){:root{--bg:#141416;--fg:#ececef;--mut:#9a9aa2;--card:#1d1d21;--line:#2f2f35;--ok:#5cc28e;--warn:#e3a35a;--acc:#9fb0f0}}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--fg);font:15px/1.45 -apple-system,system-ui,sans-serif}
main{max-width:980px;margin:0 auto;padding:24px 16px 64px}h1{font-size:22px;margin:0 0 4px}.sub{color:var(--mut);margin:0 0 16px}
.card{background:var(--card);border:1px solid var(--line);border-left:4px solid var(--warn);border-radius:8px;padding:14px 16px;margin:14px 0}
.card.ready{border-left-color:var(--ok)}header{display:flex;gap:10px;align-items:center;flex-wrap:wrap}.state{margin-left:auto;font-size:13px;color:var(--mut)}
.tag{font-size:12px;padding:1px 8px;border-radius:10px;border:1px solid var(--line)}.meta{color:var(--mut);font-size:13px;margin:6px 0}
.missing{color:var(--warn);margin:6px 0;padding-left:18px}.files{list-style:none;padding:0;display:flex;flex-wrap:wrap;gap:12px}.files li{font-size:13px;max-width:100%}
.files img{max-width:180px;max-height:180px;border-radius:6px;border:1px solid var(--line);margin-top:4px}.need{color:var(--warn)}.opt{color:var(--mut)}.role{font-weight:600}
.prompt{position:relative}pre{white-space:pre-wrap;background:var(--bg);border:1px solid var(--line);border-radius:6px;padding:10px;margin:8px 0;font:13px/1.45 ui-monospace,Menlo,monospace}
button{font:inherit;font-size:13px;padding:4px 10px;border-radius:6px;border:1px solid var(--acc);background:transparent;color:var(--acc);cursor:pointer}
.steps{font-size:13px;padding-left:18px;margin:4px 0}a{color:var(--acc)}.done{opacity:.55}
.missing li,.files li,.meta,.steps li,header b,code,a{overflow-wrap:anywhere}
</style></head><body><main>
<h1>${esc(m.title)}: Kling upload pack</h1>
<p class="sub">${cards.length} shots, ${ready} ready (${kinds.map(([k, n]) => `${n} ${k.replace("_", " ")}`).join(", ")}). Each card: upload its files, paste its prompt, generate, then save the download as <b>${esc(m.downloads)}/&lt;shot&gt;.mp4</b>. When a batch is done: <code>${esc(m.clipsCommand)}</code></p>
${cards.map(card).join("\n")}
</main>
<script>
document.querySelectorAll("button[data-copy]").forEach(function(b){b.addEventListener("click",function(){var t=document.getElementById(b.dataset.copy).textContent;navigator.clipboard.writeText(t).then(function(){b.textContent="Copied";setTimeout(function(){b.textContent="Copy prompt"},1200)})})});
var K="kling-pack-${esc(m.trackId)}";var s={};try{s=JSON.parse(localStorage.getItem(K)||"{}")}catch(e){}
document.querySelectorAll("input[data-shot]").forEach(function(x){var id=x.dataset.shot;x.checked=!!s[id];x.closest(".card").classList.toggle("done",x.checked);x.addEventListener("change",function(){s[id]=x.checked;x.closest(".card").classList.toggle("done",x.checked);try{localStorage.setItem(K,JSON.stringify(s))}catch(e){}})});
</script></body></html>
`;
}
