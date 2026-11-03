/**
 * AIM-B5R tools on the owner's computer.
 *
 *   npm run b5r -- screen ~/Desktop/site-photos --intent "Keep the brick; add units" --name maple-court
 *   npm run b5r -- screen a.jpg b.jpg c.jpg --dry        (prepare and show the cost; send nothing)
 *
 * screen: up to 20 photos (files or folders) in, one Claude call, and a report
 * of what the photos show, what to keep, hazards to check and residential
 * ideas to investigate, with every gate HOLD (lib/b5r/screen). Needs
 * ANTHROPIC_API_KEY in the shell (read by name, never saved). Output goes to
 * ~/AIMScenes/<date>-<name>/, never into this repository. Options: --intent,
 * --name, --model (default claude-sonnet-5-5), --dry, --out <folder>.
 */
import { homedir } from "node:os";
import { resolve } from "node:path";
import { screenPhotos } from "../../lib/b5r/screen/pipeline";

const argv = process.argv.slice(2);
const VALUE_FLAGS = ["intent", "name", "model", "out"];
const flag = (name: string): string | undefined => {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 ? argv[i + 1] : undefined;
};
const positional = argv.filter((a, i) => !a.startsWith("--") && !(i > 0 && argv[i - 1].startsWith("--") && VALUE_FLAGS.includes(argv[i - 1].slice(2))));
const expand = (p: string) => resolve(p.replace(/^~(?=$|\/)/, homedir()));
const [cmd, ...rest] = positional;

const usage = `AIM-B5R
  screen <photo or folder ...> [--intent "..."] [--name <name>] [--model claude-sonnet-5-5] [--dry] [--out <folder>]`;

async function main() {
  switch (cmd) {
    case "screen":
      if (!rest.length) throw new Error("screen needs at least one photo or folder");
      await screenPhotos(rest.map(expand), {
        intent: flag("intent"), name: flag("name"), model: flag("model"), dry: argv.includes("--dry"),
        root: flag("out") ? expand(flag("out")!) : undefined, repo: process.cwd(),
      });
      break;
    default:
      console.log(usage);
      if (cmd) process.exitCode = 1;
  }
}

main().catch((e: Error) => {
  console.error(`error: ${e.message}`);
  process.exitCode = 1;
});
