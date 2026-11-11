// lib/dance8/reaction/preview.ts
//
// A local preview page for the reaction layer: the source footage with the
// overlay stacked on top in Screen blend, a switch to compare original and
// hybrid, a reduced-motion switch (on by default when the viewer's system asks
// for reduced motion) and an opacity slider. The page only plays files that
// sit next to it; it is for the owner's review, never for publishing.

export interface PreviewWindow {
  id: string;
  family: string;
  scene: string | null;
  musicStartSec: number;
  musicEndSec: number;
  base: string;
  overlay: string;
  reduced: string | null;
}

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const NAME: Record<string, string> = { GENOME_LOOM: "Genome Loom", ALGORITHMIC_CYPHER: "Algorithmic Cypher", RESONANCE_CHAMBER: "Resonance Chamber" };
const mmss = (s: number) => `${Math.floor(s / 60)}:${(s % 60).toFixed(2).padStart(5, "0")}`;

export function previewHtml(title: string, windows: PreviewWindow[], notes: readonly string[]): string {
  const cards = windows.map((w) => `
  <section class="win" data-reduced="${w.reduced ? esc(w.reduced) : ""}" data-overlay="${esc(w.overlay)}">
    <h2>${esc(NAME[w.family] ?? w.family)} <span>${mmss(w.musicStartSec)} to ${mmss(w.musicEndSec)}${w.scene ? `, over ${esc(w.scene)}` : ""}</span></h2>
    <div class="stage">
      <video class="base" src="${esc(w.base)}" controls playsinline preload="metadata"></video>
      <video class="ov" src="${esc(w.overlay)}" muted playsinline preload="metadata" aria-hidden="true"></video>
    </div>
  </section>`).join("");
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)}</title>
<style>
:root { --bg: #f4f4f2; --ink: #1d1d1f; --muted: #5c5c60; --line: #d6d6d2; }
@media (prefers-color-scheme: dark) { :root { --bg: #151517; --ink: #ececec; --muted: #a2a2a8; --line: #333338; } }
body { margin: 0; background: var(--bg); color: var(--ink); font: 16px/1.5 system-ui, sans-serif; }
main { max-width: 980px; margin: 0 auto; padding: 24px 16px 48px; }
h1 { font-size: 1.4rem; margin: 0 0 4px; } h2 { font-size: 1.05rem; margin: 28px 0 8px; } h2 span { color: var(--muted); font-weight: 400; }
.controls { display: flex; flex-wrap: wrap; gap: 16px 24px; align-items: center; padding: 12px 0; border-bottom: 1px solid var(--line); position: sticky; top: 0; background: var(--bg); z-index: 2; }
label { display: inline-flex; gap: 8px; align-items: center; }
.stage { position: relative; background: #000; }
.stage video { display: block; width: 100%; height: auto; }
.stage .ov { position: absolute; inset: 0; mix-blend-mode: screen; pointer-events: none; }
.off .stage .ov { display: none; }
ul { color: var(--muted); font-size: 0.92rem; padding-left: 20px; }
</style></head>
<body><main>
<h1>${esc(title)}</h1>
<ul>${notes.map((n) => `<li>${esc(n)}</li>`).join("")}</ul>
<div class="controls">
  <label><input type="checkbox" id="on" checked> Show the overlay</label>
  <label><input type="checkbox" id="reduced"> Reduced motion</label>
  <label>Opacity <input type="range" id="op" min="0" max="1" step="0.05" value="1"></label>
</div>
${cards}
</main>
<script>
const on = document.getElementById("on"), reduced = document.getElementById("reduced"), op = document.getElementById("op");
reduced.checked = matchMedia("(prefers-reduced-motion: reduce)").matches;
function apply() {
  document.body.classList.toggle("off", !on.checked);
  for (const s of document.querySelectorAll(".win")) {
    const ov = s.querySelector(".ov"), want = reduced.checked && s.dataset.reduced ? s.dataset.reduced : s.dataset.overlay;
    if (ov.getAttribute("src") !== want) { ov.setAttribute("src", want); ov.currentTime = s.querySelector(".base").currentTime; }
    ov.style.opacity = op.value;
  }
}
for (const el of [on, reduced, op]) el.addEventListener("input", apply);
for (const s of document.querySelectorAll(".win")) {
  const b = s.querySelector(".base"), ov = s.querySelector(".ov");
  b.addEventListener("play", () => { ov.currentTime = b.currentTime; ov.play(); });
  b.addEventListener("pause", () => ov.pause());
  b.addEventListener("seeked", () => { ov.currentTime = b.currentTime; });
  b.addEventListener("timeupdate", () => { if (Math.abs(ov.currentTime - b.currentTime) > 0.05) ov.currentTime = b.currentTime; });
}
apply();
</script>
</body></html>
`;
}
