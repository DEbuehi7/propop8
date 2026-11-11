/**
 * AIM-B5R tools on the owner's computer.
 *
 *   npm run b5r -- screen ~/Desktop/site-photos --intent "Keep the brick; add units" --name maple-court
 *   npm run b5r -- screen a.jpg b.jpg c.jpg --dry        (prepare and show the cost; send nothing)
 *   npm run b5r -- continuity data/aim-b5r/continuity/example-v2-drifted.json --baseline data/aim-b5r/continuity/example-v1.json
 *   npm run b5r -- continuity-starter --scope facade,imagery --id my-facade --out my-facade-v1.json
 *
 * screen: up to 20 photos (files or folders) in, one Claude call, and a report
 * of what the photos show, what to keep, hazards to check and residential
 * ideas to investigate, with every gate HOLD (lib/b5r/screen). Needs
 * ANTHROPIC_API_KEY in the shell (read by name, never saved). Output goes to
 * ~/AIMScenes/<date>-<name>/, never into this repository. Options: --intent,
 * --name, --model (default claude-sonnet-5-5), --dry, --out <folder>.
 *
 * continuity: checks a design proposal against canon (lib/b5r/continuity):
 * every applicable canon item answered, every change since the --baseline
 * version logged, claims tagged, irreversible decisions approved. Prints the
 * report; --out <folder> writes <id>-v<version>.continuity.json and .md;
 * --json prints the sealed JSON; --strict exits 1 unless coverage is complete.
 * No network, no AI.
 *
 * continuity-starter: a version 1 proposal listing every required item for
 * the scope as UNRESOLVED, to fill in. --scope (comma-separated), --id,
 * --title, --out <file>.
 */
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import { screenPhotos } from "../../lib/b5r/screen/pipeline";
import { checkContinuity, parseProposal, reportMarkdown, starterProposal, WORK_TYPES, type DesignProposal, type WorkType } from "../../lib/b5r/continuity";

const argv = process.argv.slice(2);
const VALUE_FLAGS = ["intent", "name", "model", "out", "baseline", "scope", "id", "title"];
const flag = (name: string): string | undefined => {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 ? argv[i + 1] : undefined;
};
const positional = argv.filter((a, i) => !a.startsWith("--") && !(i > 0 && argv[i - 1].startsWith("--") && VALUE_FLAGS.includes(argv[i - 1].slice(2))));
const expand = (p: string) => resolve(p.replace(/^~(?=$|\/)/, homedir()));
const [cmd, ...rest] = positional;

const usage = `AIM-B5R
  screen <photo or folder ...> [--intent "..."] [--name <name>] [--model claude-sonnet-5-5] [--dry] [--out <folder>]
  continuity <proposal.json> [--baseline <previous-version.json>] [--out <folder>] [--json] [--strict]
  continuity-starter --scope <${WORK_TYPES.join("|")}>[,...] [--id <id>] [--title "..."] [--out <file.json>]`;

async function loadProposal(path: string): Promise<DesignProposal> {
  let raw: unknown;
  try {
    raw = JSON.parse(await readFile(expand(path), "utf8"));
  } catch (e) {
    throw new Error(`${path}: ${(e as Error).message}`);
  }
  const { proposal, errors } = parseProposal(raw);
  if (!proposal) throw new Error(`${path} is not a design proposal:\n  - ${errors.join("\n  - ")}`);
  return proposal;
}

async function continuity() {
  if (rest.length !== 1) throw new Error("continuity needs one proposal file");
  const proposal = await loadProposal(rest[0]);
  const baselinePath = flag("baseline");
  const baseline = baselinePath ? await loadProposal(baselinePath) : undefined;
  const report = await checkContinuity(proposal, { baseline });
  const md = reportMarkdown(report);
  const out = flag("out");
  if (out) {
    const dir = expand(out);
    await mkdir(dir, { recursive: true });
    const stem = join(dir, `${proposal.id}-v${proposal.version}.continuity`);
    await writeFile(`${stem}.json`, `${JSON.stringify(report, null, 2)}\n`);
    await writeFile(`${stem}.md`, md);
    console.log(`${report.call}, coverage ${report.complete ? "complete" : "incomplete"}: ${report.findings.length} finding(s)\n  ${stem}.json\n  ${stem}.md`);
  } else console.log(argv.includes("--json") ? JSON.stringify(report, null, 2) : md);
  if (argv.includes("--strict") && !report.complete) process.exitCode = 1;
}

async function starter() {
  const scope = (flag("scope") ?? "").split(",").map((s) => s.trim()).filter(Boolean);
  const unknown = scope.filter((s) => !(WORK_TYPES as readonly string[]).includes(s));
  if (unknown.length) throw new Error(`unknown scope ${unknown.join(", ")}; use ${WORK_TYPES.join(", ")}`);
  const p = starterProposal(scope as WorkType[], flag("id") ?? "new-proposal", flag("title") ?? "Untitled proposal");
  const json = `${JSON.stringify(p, null, 2)}\n`;
  const out = flag("out");
  if (out) {
    await writeFile(expand(out), json, { flag: "wx" }).catch((e: NodeJS.ErrnoException) => {
      throw new Error(e.code === "EEXIST" ? `${out} already exists; pick another name` : e.message);
    });
    console.log(`${p.components.length} required item(s) to answer; dataStatus starts as SYNTHETIC\n  ${expand(out)}`);
  } else console.log(json);
}

async function main() {
  switch (cmd) {
    case "screen":
      if (!rest.length) throw new Error("screen needs at least one photo or folder");
      await screenPhotos(rest.map(expand), {
        intent: flag("intent"), name: flag("name"), model: flag("model"), dry: argv.includes("--dry"),
        root: flag("out") ? expand(flag("out")!) : undefined, repo: process.cwd(),
      });
      break;
    case "continuity":
      await continuity();
      break;
    case "continuity-starter":
      await starter();
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
