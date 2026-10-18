/**
 * Stuttr song library: copy Suno exports in, prepare vocals for ElevenLabs,
 * register converted voices, make draft mixes. Audio stays on this computer.
 *
 *   npm run stuttr -- add ~/StuttrInbox/cloyne --title "C.L.O.Y.N.E." --suno-plan Pro
 *   npm run stuttr -- list
 *   npm run stuttr -- prep-voice cloyne
 *   npm run stuttr -- add-voice cloyne Stuttr ~/Downloads/cloyne-stuttr.wav
 *   npm run stuttr -- mix cloyne Stuttr
 *   npm run stuttr -- approve cloyne Stuttr        (or: reject)
 *
 * Shouts and harmonies in several voices: prep the backing stem once, convert
 * it in ElevenLabs once per voice, add each take, then mix; every backing take
 * that isn't rejected is layered under the lead.
 *   npm run stuttr -- prep-voice cloyne --from backing_vocals
 *   npm run stuttr -- add-voice cloyne M ~/Downloads/cloyne-m.mp3 --from backing_vocals
 *
 * Options: --library <folder> (default ~/StuttrLibrary, or $STUTTR_LIBRARY),
 * --id, --title, --suno-plan, --dry (add); --from vocals|backing_vocals
 * (prep-voice, add-voice, approve, reject); --full (prep-voice: don't cut the
 * backing stem to its sung span); --lang (default en); --no-backing,
 * --suno-backing (mix).
 */
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import { addSong, addVoice, loadManifest, mixVoice, prepVoice, setVoiceStatus, type Ctx } from "../../lib/stuttr/commands";
import { describeTrack } from "../../lib/stuttr/library";

const argv = process.argv.slice(2);
const flag = (name: string): string | undefined => {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 ? argv[i + 1] : undefined;
};
const has = (name: string) => argv.includes(`--${name}`);
const VALUE_FLAGS = ["library", "id", "title", "suno-plan", "lang", "from"];
const takesValue = (a: string) => a.startsWith("--") && VALUE_FLAGS.includes(a.slice(2));
const positional = argv.filter((a, i) => !a.startsWith("--") && !(i > 0 && takesValue(argv[i - 1])));
const expand = (p: string) => resolve(p.replace(/^~(?=$|\/)/, homedir()));

const ctx: Ctx = { library: expand(flag("library") ?? process.env.STUTTR_LIBRARY ?? join(homedir(), "StuttrLibrary")) };
const [cmd, a1, a2, a3] = positional;

const usage = `Stuttr song library (${ctx.library})
  add <song folder> [--title "Name"] [--id slug] [--suno-plan Pro] [--dry]
  list
  prep-voice <trackId> [--from backing_vocals] [--full]
  add-voice <trackId> <voice> <file> [--lang en] [--from backing_vocals]
  mix <trackId> <voice> [--lang en] [--no-backing | --suno-backing]
  approve|reject <trackId> <voice> [--lang en] [--from backing_vocals]`;
const fromFlag = () => (flag("from") === "backing_vocals" ? "backing_vocals" : "vocals");

try {
  switch (cmd) {
    case "add":
      if (!a1) throw new Error("add needs a song folder");
      addSong(ctx, { folder: expand(a1), id: flag("id"), title: flag("title"), sunoPlan: flag("suno-plan"), dry: has("dry") });
      break;
    case "list": {
      const m = loadManifest(ctx);
      if (m.tracks.length === 0) console.log(`no songs yet in ${ctx.library}`);
      for (const t of m.tracks) console.log(describeTrack(t));
      break;
    }
    case "prep-voice":
      if (!a1) throw new Error("prep-voice needs a track id");
      prepVoice(ctx, a1, fromFlag(), { full: has("full") });
      break;
    case "add-voice":
      if (!a1 || !a2 || !a3) throw new Error("add-voice needs a track id, a voice name and a file");
      addVoice(ctx, { trackId: a1, voice: a2, file: expand(a3), lang: flag("lang"), from: fromFlag() });
      break;
    case "mix":
      if (!a1 || !a2) throw new Error("mix needs a track id and a voice name");
      mixVoice(ctx, a1, a2, flag("lang") ?? "en", !has("no-backing"), { sunoBacking: has("suno-backing") });
      break;
    case "approve":
    case "reject":
      if (!a1 || !a2) throw new Error(`${cmd} needs a track id and a voice name`);
      setVoiceStatus(ctx, a1, a2, flag("lang") ?? "en", cmd === "approve" ? "approved" : "rejected", fromFlag());
      break;
    default:
      console.log(usage);
      if (cmd) process.exitCode = 1;
  }
} catch (e) {
  console.error(`stuttr: ${(e as Error).message}`);
  process.exitCode = 1;
}
