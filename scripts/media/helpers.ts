/**
 * Renders the helper clips listed in lib/helpers/registry.ts.
 *
 *   npm run helpers                         every clip
 *   npm run helpers -- recert-clear-flags   one clip (or several ids)
 *   npm run helpers -- --src ~/Movies/rec   where the recordings are (default ~/Downloads, or $HELPER_SOURCES)
 *   npm run helpers -- --captions           captions only (no recordings needed)
 *
 * Writes public/helpers/<id>.mp4, <id>.jpg and <id>.vtt. A clip whose
 * recording isn't in the folder is skipped with a note; its captions are
 * still written. Then run `npm run verify` (tests/helpers.test.ts checks the
 * files, sizes, routes and captions).
 */
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, statSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import { HELPERS, helperDuration } from "../../lib/helpers/registry";
import { helperFfmpegArgs, posterFfmpegArgs, toVtt } from "../../lib/helpers/render";

const argv = process.argv.slice(2);
const flag = (name: string) => {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 ? argv[i + 1] : undefined;
};
const expand = (p: string) => resolve(p.replace(/^~(?=$|\/)/, homedir()));
const src = expand(flag("src") ?? process.env.HELPER_SOURCES ?? join(homedir(), "Downloads"));
const captionsOnly = argv.includes("--captions");
const ids = argv.filter((a, i) => !a.startsWith("--") && argv[i - 1] !== "--src");
const out = resolve(__dirname, "../../public/helpers");

const unknown = ids.filter((id) => !HELPERS.some((h) => h.id === id));
if (unknown.length) {
  console.error(`unknown helper id: ${unknown.join(", ")}\nknown: ${HELPERS.map((h) => h.id).join(", ")}`);
  process.exit(1);
}
if (!captionsOnly && spawnSync("ffmpeg", ["-version"]).status !== 0) {
  console.error("ffmpeg is not installed (macOS: brew install ffmpeg).");
  process.exit(1);
}

mkdirSync(out, { recursive: true });
const run = (args: string[]) => spawnSync("ffmpeg", args, { stdio: "inherit" }).status === 0;
let failed = 0;

for (const h of HELPERS.filter((x) => ids.length === 0 || ids.includes(x.id))) {
  writeFileSync(join(out, `${h.id}.vtt`), toVtt(h.captions));
  if (captionsOnly) { console.log(`${h.id}: captions`); continue; }
  const source = join(src, h.source);
  if (!existsSync(source)) { console.log(`${h.id}: skipped, ${h.source} is not in ${src}`); continue; }
  const mp4 = join(out, `${h.id}.mp4`);
  if (!run(helperFfmpegArgs(h, source, mp4)) || !run(posterFfmpegArgs(h, mp4, join(out, `${h.id}.jpg`)))) {
    console.error(`${h.id}: ffmpeg failed`);
    failed++;
    continue;
  }
  const kb = Math.round(statSync(mp4).size / 1024);
  console.log(`${h.id}: ${helperDuration(h).toFixed(1)} s, ${kb} KB`);
}
process.exit(failed ? 1 : 0);
