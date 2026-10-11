/**
 * AIM Vault command-line tool. Signs in AS YOU (password + authenticator
 * code), so every vault rule applies; it refuses secret/service-role keys.
 *
 * Once per computer (asks for the vault project's URL and publishable key and
 * saves them in ~/.aim-vault; VAULT_SUPABASE_URL / VAULT_SUPABASE_ANON_KEY
 * environment variables still override the saved values):
 *
 *   npx --yes tsx scripts/vault/vault.ts setup
 *   npx --yes tsx scripts/vault/vault.ts enroll      (once: link your authenticator app)
 *   npx --yes tsx scripts/vault/vault.ts login
 *   npx --yes tsx scripts/vault/vault.ts backup-key  (once: make the backup key pair)
 *   npx --yes tsx scripts/vault/vault.ts add FILE --entity aim-llc --category filing --title "Articles of Organization" --tier 2 [--doc-date 2024-03-01] [--expires 2026-03-31] [--tags formation,state] [--projects propops8]
 *   npx --yes tsx scripts/vault/vault.ts list [--entity sbi-inc] [--category filing] [--tag formation] [--q "operating agreement"] [--sort doc_date|title|created_at]
 *   npx --yes tsx scripts/vault/vault.ts get ITEM_ID [--out DIR] [--copy preview]
 *   npx --yes tsx scripts/vault/vault.ts deadline add --entity aim-llc --title "Statement of Information" --due 2027-03-31 [--repeat biennial]
 *   npx --yes tsx scripts/vault/vault.ts deadlines [--days 120]
 *   npx --yes tsx scripts/vault/vault.ts export-pure --out vault_catalog.md [--entity aim-llc]
 *   npx --yes tsx scripts/vault/vault.ts backup --out DIR [--recipient age1...]   (weekly; encrypted .tar.age)
 *   npx --yes tsx scripts/vault/vault.ts logout
 *
 * Tier 3 (restricted): encrypt first, then add the .age file:
 *   age -p -o ein-letter.pdf.age ein-letter.pdf
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { chmodSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { basename, join } from "node:path";
import { spawnSync } from "node:child_process";
import { createInterface } from "node:readline";
import {
  bucketFor, checkAdd, checkVaultConfig, mimeFor, normalizeProjectUrl, objectPath, planDerivatives,
  pureExport, resolveVaultConfig, sha256,
  type CatalogRow, type Category, type DeadlineRow, type EntityId, type Tier,
} from "../../lib/vault/core";

const SESSION_DIR = join(homedir(), ".aim-vault");
const SESSION_FILE = join(SESSION_DIR, "session.json");
const CONFIG_FILE = join(SESSION_DIR, "config.json");
const RECIPIENT_FILE = join(SESSION_DIR, "backup-recipient.txt");

const argv = process.argv.slice(2);
const opt = (name: string) => {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 ? argv[i + 1] : undefined;
};
const die = (msg: string): never => {
  console.error(msg);
  process.exit(1);
};

function privateDir() {
  mkdirSync(SESSION_DIR, { recursive: true, mode: 0o700 });
  chmodSync(SESSION_DIR, 0o700);
}

function client(): SupabaseClient {
  const { VAULT_SUPABASE_URL, VAULT_SUPABASE_ANON_KEY } = process.env;
  const cfg = resolveVaultConfig({ VAULT_SUPABASE_URL, VAULT_SUPABASE_ANON_KEY }, existsSync(CONFIG_FILE) ? readFileSync(CONFIG_FILE, "utf8") : null);
  if ("error" in cfg) return die(cfg.error);
  return createClient(cfg.url, cfg.key, { auth: { persistSession: false, autoRefreshToken: false } });
}

function ask(question: string, hidden = false): Promise<string> {
  return new Promise((resolve) => {
    const rl = createInterface({ input: process.stdin, output: process.stdout, terminal: true });
    if (hidden) {
      const out = rl as unknown as { _writeToOutput: (s: string) => void };
      out._writeToOutput = (s: string) => {
        if (s.includes(question)) process.stdout.write(s);
      };
    }
    rl.question(question, (a) => {
      rl.close();
      if (hidden) process.stdout.write("\n");
      resolve(a.trim());
    });
  });
}

async function session(sb: SupabaseClient) {
  if (!existsSync(SESSION_FILE)) die("Not signed in. Run: vault login");
  const s = JSON.parse(readFileSync(SESSION_FILE, "utf8")) as { access_token: string; refresh_token: string };
  const { data, error } = await sb.auth.setSession(s);
  if (error || !data.session) die(`Session expired; run: vault login (${error?.message ?? "no session"})`);
  writeFileSync(SESSION_FILE, JSON.stringify({ access_token: data.session!.access_token, refresh_token: data.session!.refresh_token }), { mode: 0o600 });
  const { data: aal } = await sb.auth.mfa.getAuthenticatorAssuranceLevel();
  if (aal?.currentLevel !== "aal2") die("This session has no second factor; run: vault login");
}

async function log(sb: SupabaseClient, action: string, item_id: string | null, detail: Record<string, unknown> = {}) {
  const { error } = await sb.from("access_log").insert({ action, item_id, detail });
  if (error) console.error(`warning: access log not written (${error.message})`);
}

async function login() {
  const sb = client();
  const email = await ask("Email: ");
  const password = await ask("Password: ", true);
  const { error } = await sb.auth.signInWithPassword({ email, password });
  if (error) die(`Sign-in failed: ${error.message}`);
  const { data: factors, error: fe } = await sb.auth.mfa.listFactors();
  if (fe) die(fe.message);
  const totp = factors?.totp?.find((f) => f.status === "verified");
  if (!totp) die("No verified authenticator app on this account. Enrol one first (see vault/README.md).");
  const code = await ask("Authenticator code: ");
  const { error: ve } = await sb.auth.mfa.challengeAndVerify({ factorId: totp!.id, code });
  if (ve) die(`Code rejected: ${ve.message}`);
  const { data } = await sb.auth.getSession();
  privateDir();
  writeFileSync(SESSION_FILE, JSON.stringify({ access_token: data.session!.access_token, refresh_token: data.session!.refresh_token }), { mode: 0o600 });
  chmodSync(SESSION_FILE, 0o600);
  await log(sb, "sign_in", null);
  console.log("Signed in with two-factor.");
}

async function setup() {
  console.log("Supabase dashboard -> the aim-vault project -> Project Settings -> API Keys (and Data API for the URL).");
  const url = normalizeProjectUrl(await ask("Vault project URL: "));
  const key = await ask("Publishable (anon) key - nothing shows while you paste: ", true);
  const problem = checkVaultConfig(url, key);
  if (problem) die(problem);
  // A real round trip, so a wrong URL or key shows up now rather than at the first upload.
  let res: Response;
  try {
    res = await fetch(`${url}/auth/v1/settings`, { headers: { apikey: key } });
  } catch (e) {
    return die(`Could not reach ${url} (${(e as Error).message}). Check the URL.`);
  }
  if (res.status === 401 || res.status === 403) die("The project refused that key. Copy the publishable key again.");
  if (!res.ok) die(`The project answered HTTP ${res.status}. Check the URL.`);
  const settings = (await res.json().catch(() => ({}))) as { disable_signup?: boolean };
  if (settings.disable_signup === false) {
    console.log("Warning: new sign-ups are still allowed. Turn off 'Allow new users to sign up' (Authentication -> Sign In / Providers).");
  }
  privateDir();
  writeFileSync(CONFIG_FILE, JSON.stringify({ url, key }), { mode: 0o600 });
  chmodSync(CONFIG_FILE, 0o600);
  console.log("Saved on this computer. Next: vault enroll (first time) or vault login.");
}

async function enroll() {
  const sb = client();
  const email = await ask("Email: ");
  const password = await ask("Password (nothing shows while you type): ", true);
  const { error } = await sb.auth.signInWithPassword({ email, password });
  if (error) die(`Sign-in failed: ${error.message}`);
  const { data: factors } = await sb.auth.mfa.listFactors();
  if (factors?.totp?.some((f) => f.status === "verified")) die("An authenticator app is already linked. Use: vault login");
  // A cancelled earlier attempt leaves an unfinished factor behind; clear it so enroll can simply be run again.
  for (const f of factors?.all ?? []) {
    if (f.factor_type === "totp" && f.status !== "verified") await sb.auth.mfa.unenroll({ factorId: f.id });
  }
  const { data, error: ee } = await sb.auth.mfa.enroll({ factorType: "totp", friendlyName: "AIM Vault" });
  if (ee || !data) die(`Could not start enrolment: ${ee?.message}`);
  const qr = spawnSync("qrencode", ["-t", "ANSIUTF8"], { input: data!.totp.uri, stdio: ["pipe", "inherit", "ignore"] });
  if (qr.status === 0) console.log("Scan this with your authenticator app (or use the setup key below):");
  else console.log("In your authenticator app choose 'Enter a setup key' (time-based) and type this key:");
  console.log(`  setup key: ${data!.totp.secret}`);
  console.log("Using two authenticator apps? Add this same key to both now, before typing the code.");
  const code = await ask("6-digit code shown in the app: ");
  const { error: ve } = await sb.auth.mfa.challengeAndVerify({ factorId: data!.id, code });
  if (ve) die(`Code rejected: ${ve.message}. Run enroll again.`);
  console.log("Authenticator linked. Now run: vault login");
}

/**
 * Makes the backup key pair. The private half goes to a file you move off
 * this computer (USB drive + password manager); only the public half stays
 * here, so backups can be written but not opened with what is on this Mac.
 */
async function backupKey() {
  const out = opt("out") ?? join(homedir(), "Desktop", "aim-vault-backup-key.txt");
  if (existsSync(RECIPIENT_FILE) && !argv.includes("--replace")) {
    die(`A backup key already exists (public half in ${RECIPIENT_FILE}). Backups made with it need its private file to open. Add --replace only if that private file is lost.`);
  }
  if (existsSync(out)) die(`${out} already exists; move it first.`);
  if (spawnSync("age-keygen", ["--version"]).status !== 0) die("age is not installed (brew install age)");
  const gen = spawnSync("age-keygen", ["-o", out], { stdio: ["ignore", "ignore", "pipe"] });
  if (gen.status !== 0) die(`age-keygen failed: ${String(gen.stderr)}`);
  chmodSync(out, 0o600);
  const pub = spawnSync("age-keygen", ["-y", out], { encoding: "utf8" });
  const recipient = String(pub.stdout).trim();
  if (pub.status !== 0 || !/^age1[0-9a-z]+$/.test(recipient)) die("Could not read the public key back from the new key file.");
  privateDir();
  writeFileSync(RECIPIENT_FILE, recipient + "\n", { mode: 0o600 });
  console.log(`Private backup key: ${out}`);
  console.log("  1. Attach that file to your password manager.");
  console.log("  2. Copy it to a USB drive.");
  console.log("  3. Then delete it from this computer. Without it no backup can be opened.");
  console.log(`Public half saved in ${RECIPIENT_FILE}; vault backup uses it automatically.`);
}

async function backup() {
  const outDir = opt("out");
  const recipient = opt("recipient") ?? (existsSync(RECIPIENT_FILE) ? readFileSync(RECIPIENT_FILE, "utf8").trim() : undefined);
  if (!outDir) die("usage: vault backup --out DIR [--recipient age1...]");
  if (!recipient || !/^age1[0-9a-z]+$/.test(recipient)) die("No backup key yet. Run: vault backup-key (once), or pass --recipient age1...");
  if (spawnSync("age", ["--version"]).status !== 0) die("age is not installed (brew install age)");
  const sb = client();
  await session(sb);
  const [{ data: items, error: e1 }, { data: files, error: e2 }, { data: dls, error: e3 }] = await Promise.all([
    sb.from("items").select("*"), sb.from("item_files").select("*"), sb.from("deadlines").select("*"),
  ]);
  if (e1 || e2 || e3) die((e1 ?? e2 ?? e3)!.message);
  const stamp = new Date().toISOString().slice(0, 10);
  const work = join(tmpdir(), `vault-backup-${stamp}-${process.pid}`);
  mkdirSync(join(work, "files"), { recursive: true, mode: 0o700 });
  let bad = 0;
  for (const f of (files ?? []) as { bucket: string; path: string; sha256: string }[]) {
    const { data: blob, error } = await sb.storage.from(f.bucket).download(f.path);
    if (error || !blob) { console.error(`missing: ${f.bucket}/${f.path}`); bad++; continue; }
    const buf = Buffer.from(await blob.arrayBuffer());
    if (sha256(buf) !== f.sha256) { console.error(`fingerprint mismatch: ${f.bucket}/${f.path}`); bad++; continue; }
    const dest = join(work, "files", f.bucket, f.path);
    mkdirSync(join(dest, ".."), { recursive: true });
    writeFileSync(dest, buf, { mode: 0o600 });
  }
  writeFileSync(join(work, "catalog.json"), JSON.stringify({ exported_at: new Date().toISOString(), items, item_files: files, deadlines: dls }, null, 2));
  mkdirSync(outDir!, { recursive: true });
  const out = join(outDir!, `aim-vault-${stamp}.tar.age`);
  // Streamed tar | age, with paths passed as arguments (never interpolated into the command).
  const pack = spawnSync("bash", ["-c", 'set -o pipefail; tar -C "$1" -cf - . | age -r "$2" -o "$3"', "bash", work, recipient!, out], { stdio: ["ignore", "inherit", "inherit"] });
  rmSync(work, { recursive: true, force: true });
  if (pack.status !== 0) {
    rmSync(out, { force: true });
    die("Backup failed while packing or encrypting; nothing usable was written.");
  }
  await log(sb, "export", null, { backup: basename(out), files: files?.length ?? 0, problems: bad });
  console.log(`Backup written: ${out} (${files?.length ?? 0} files${bad ? `, ${bad} problem(s) listed above` : ", all fingerprints verified"}).`);
  if (bad) process.exitCode = 1;
}

async function makeDerivative(file: string, plan: { ext: string; tool: string }): Promise<string | null> {
  const out = join(tmpdir(), `vault-${process.pid}-${Date.now()}${plan.ext}`);
  if (plan.tool === "sharp") {
    try {
      const mod = (await import("sharp")) as unknown as { default: (f: string) => { webp: (o: object) => { toFile: (p: string) => Promise<unknown> } } };
      await mod.default(file).webp({ quality: 85 }).toFile(out);
      return out;
    } catch {
      console.error("note: image library not available; storing the original only");
      return null;
    }
  }
  const r = spawnSync("ffmpeg", ["-y", "-loglevel", "error", "-i", file, "-c:a", "aac", "-b:a", "256k", out]);
  if (r.status !== 0) {
    console.error("note: ffmpeg not available; storing the original only");
    return null;
  }
  return out;
}

async function add() {
  const file = argv[1];
  if (!file || file.startsWith("--") || !existsSync(file)) die("usage: vault add FILE --entity ... --category ... --title ... --tier N");
  const buf = readFileSync(file);
  const tier = Number(opt("tier") ?? "2");
  const input = { entity: opt("entity") ?? "", category: opt("category") ?? "", title: opt("title") ?? "", tier, fileName: basename(file), head: buf.subarray(0, 64) };
  const issues = checkAdd(input);
  if (issues.length) die(issues.map((i) => `- ${i}`).join("\n"));
  const entity = input.entity as EntityId;
  const category = input.category as Category;
  const bucket = bucketFor(entity);
  const sha = sha256(buf);

  const sb = client();
  await session(sb);
  const { data: dup } = await sb.from("item_files").select("item_id").eq("sha256", sha).eq("role", "original").maybeSingle();
  if (dup) die(`Already in the vault (item ${dup.item_id}). Nothing uploaded.`);

  const year = Number((opt("doc-date") ?? new Date().toISOString()).slice(0, 4));
  const uploads: { role: string; path: string; sha: string; bytes: number; mime: string; encrypted: boolean; body: Buffer }[] = [
    { role: "original", path: objectPath(category, basename(file), sha, year), sha, bytes: buf.length, mime: mimeFor(file), encrypted: tier === 3, body: buf },
  ];
  for (const plan of planDerivatives(basename(file), tier as Tier)) {
    const out = await makeDerivative(file, plan);
    if (!out) continue;
    const b = readFileSync(out);
    rmSync(out, { force: true });
    const name = basename(file).replace(/\.[^.]+$/, "") + plan.ext;
    uploads.push({ role: plan.role, path: objectPath(category, name, sha256(b), year), sha: sha256(b), bytes: b.length, mime: plan.mime, encrypted: false, body: b });
  }

  const done: string[] = [];
  const undo = async () => {
    if (done.length) await sb.storage.from(bucket).remove(done);
  };
  for (const u of uploads) {
    const { error } = await sb.storage.from(bucket).upload(u.path, u.body, { contentType: u.mime, upsert: false });
    if (error) {
      await undo();
      die(`Upload failed (${u.role}): ${error.message}. Nothing was filed.`);
    }
    done.push(u.path);
  }
  const split = (s?: string) => (s ? s.split(",").map((x) => x.trim()).filter(Boolean) : []);
  const { data: item, error: ie } = await sb.from("items").insert({
    entity_id: entity, category, title: input.title.trim(), tier,
    doc_date: opt("doc-date") ?? null, expires_on: opt("expires") ?? null,
    tags: split(opt("tags")), projects: split(opt("projects")), notes: opt("notes") ?? null,
  }).select("id").single();
  if (ie || !item) {
    await undo();
    die(`Catalog write failed: ${ie?.message}. Uploaded files were removed.`);
  }
  const { error: fe } = await sb.from("item_files").insert(uploads.map((u) => ({
    item_id: item!.id, role: u.role, bucket, path: u.path, sha256: u.sha, bytes: u.bytes, mime: u.mime, encrypted: u.encrypted,
  })));
  if (fe) {
    await sb.from("items").delete().eq("id", item!.id);
    await undo();
    die(`File records failed: ${fe.message}. Nothing was filed.`);
  }
  await log(sb, "upload", item!.id, { files: uploads.map((u) => ({ role: u.role, bytes: u.bytes })) });
  const saved = uploads.length > 1 ? ` (light copy ${Math.round((uploads[1].bytes / uploads[0].bytes) * 100)}% of the original)` : "";
  console.log(`Filed ${item!.id} in ${bucket}${saved}.`);
}

async function list() {
  const sb = client();
  await session(sb);
  const sort = (opt("sort") ?? "doc_date") as "doc_date" | "title" | "created_at";
  if (!["doc_date", "title", "created_at"].includes(sort)) die("--sort must be doc_date, title or created_at");
  let q = sb.from("items").select("id, entity_id, category, title, doc_date, expires_on, status, tier, tags, projects")
    .order(sort, { ascending: sort === "title", nullsFirst: false }).limit(500);
  if (opt("entity")) q = q.eq("entity_id", opt("entity")!);
  if (opt("category")) q = q.eq("category", opt("category")!);
  if (opt("tag")) q = q.contains("tags", [opt("tag")!]);
  if (opt("q")) q = q.textSearch("title", opt("q")!, { type: "websearch" });
  const { data, error } = await q;
  if (error) die(error.message);
  for (const r of (data ?? []) as CatalogRow[]) {
    console.log([r.id, r.entity_id.padEnd(9), r.category.padEnd(14), (r.doc_date ?? "").padEnd(10), `T${r.tier}`, r.status.padEnd(10), r.title].join("  "));
  }
  console.log(`${data?.length ?? 0} item(s)`);
}

async function get() {
  const id = argv[1];
  if (!id) die("usage: vault get ITEM_ID [--out DIR] [--copy preview]");
  const sb = client();
  await session(sb);
  const role = opt("copy") ?? "original";
  const { data: f, error } = await sb.from("item_files").select("bucket, path, sha256").eq("item_id", id).eq("role", role).maybeSingle();
  if (error || !f) die(`No ${role} file for item ${id}`);
  const { data: blob, error: de } = await sb.storage.from(f!.bucket).download(f!.path);
  if (de || !blob) die(`Download failed: ${de?.message}`);
  const buf = Buffer.from(await blob!.arrayBuffer());
  if (sha256(buf) !== f!.sha256) die("Downloaded file does not match its recorded fingerprint. Not saved.");
  const out = join(opt("out") ?? ".", basename(f!.path));
  writeFileSync(out, buf, { mode: 0o600 });
  await log(sb, "download", id, { role });
  console.log(`Saved ${out} (fingerprint verified)`);
}

async function deadlines() {
  const sb = client();
  await session(sb);
  if (argv[1] === "add") {
    const entity = opt("entity");
    const title = opt("title");
    const due = opt("due");
    if (!entity || !title || !due || !/^\d{4}-\d{2}-\d{2}$/.test(due)) die("usage: vault deadline add --entity ID --title TEXT --due YYYY-MM-DD [--repeat annual]");
    const { error } = await sb.from("deadlines").insert({ entity_id: entity, title, due_on: due, recurrence: opt("repeat") ?? "none", source_url: opt("source") ?? null });
    if (error) die(error.message);
    console.log("Deadline added.");
    return;
  }
  const days = Number(opt("days") ?? "120");
  const until = new Date(Date.now() + days * 864e5).toISOString().slice(0, 10);
  const { data, error } = await sb.from("deadlines").select("entity_id, title, due_on, recurrence, status").eq("status", "open").lte("due_on", until).order("due_on");
  if (error) die(error.message);
  for (const d of (data ?? []) as DeadlineRow[]) console.log(`${d.due_on}  ${d.entity_id.padEnd(9)}  ${d.title}  (${d.recurrence})`);
  console.log(`${data?.length ?? 0} open deadline(s) in the next ${days} days`);
}

async function exportPure() {
  const out = opt("out") ?? "vault_catalog.md";
  const sb = client();
  await session(sb);
  let items = sb.from("items").select("id, entity_id, category, title, doc_date, expires_on, status, tier, tags, projects").lte("tier", 1);
  let dls = sb.from("deadlines").select("entity_id, title, due_on, recurrence, status").eq("status", "open");
  if (opt("entity")) {
    items = items.eq("entity_id", opt("entity")!);
    dls = dls.eq("entity_id", opt("entity")!);
  }
  const [{ data: i, error: e1 }, { data: d, error: e2 }] = await Promise.all([items, dls]);
  if (e1 || e2) die((e1 ?? e2)!.message);
  writeFileSync(out, pureExport((i ?? []) as CatalogRow[], (d ?? []) as DeadlineRow[], new Date().toISOString().slice(0, 10)));
  await log(sb, "export", null, { out: basename(out), items: i?.length ?? 0 });
  console.log(`Wrote ${out}: ${i?.length ?? 0} shareable items, ${d?.length ?? 0} open deadlines. Upload it to the Pure project.`);
}

const commands: Record<string, () => Promise<void>> = {
  setup, enroll, login, add, list, get, "backup-key": backupKey, backup, deadlines, deadline: deadlines, "export-pure": exportPure,
  logout: async () => {
    rmSync(SESSION_FILE, { force: true });
    console.log("Signed out on this machine.");
  },
};
const run = commands[argv[0] ?? ""];
if (!run) die(`usage: vault <${Object.keys(commands).join("|")}>  (see the top of scripts/vault/vault.ts)`);
run().catch((e) => die(String(e?.message ?? e)));
