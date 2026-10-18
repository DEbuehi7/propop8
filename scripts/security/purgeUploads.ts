// Enforces the published upload retention window (docs/security/README.md, finding R1).
// Dry run by default: lists what would be deleted and changes nothing.
//
//   npx tsx --env-file=.env.local scripts/security/purgeUploads.ts                 dry run, files older than 30 days
//   npx tsx --env-file=.env.local scripts/security/purgeUploads.ts --delete        delete them
//   npx tsx --env-file=.env.local scripts/security/purgeUploads.ts --intake ID     dry run for one intake (refund)
//   npx tsx --env-file=.env.local scripts/security/purgeUploads.ts --intake ID --delete
//
// Reads NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY from the env file;
// never prints them. Deletes through the Storage API (not SQL), then removes the
// matching audit_uploads rows so no row points at a missing file.
import { createClient } from "@supabase/supabase-js";
import { batches, intakeObjects, planPurge, type StoredObject, UPLOAD_RETENTION_DAYS } from "../../lib/security/retention";

const BUCKET = "audit-uploads";
const args = process.argv.slice(2);
const doDelete = args.includes("--delete");
const intakeIdx = args.indexOf("--intake");
const intakeId = intakeIdx >= 0 ? args[intakeIdx + 1] : null;

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error("NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set (use --env-file=.env.local).");
  process.exit(2);
}
const supabase = createClient(url, key, { auth: { persistSession: false } });

async function listAll(): Promise<StoredObject[]> {
  const out: StoredObject[] = [];
  const folders: string[] = [""];
  while (folders.length) {
    const prefix = folders.shift() as string;
    for (let offset = 0; ; offset += 1000) {
      const { data, error } = await supabase.storage.from(BUCKET).list(prefix, { limit: 1000, offset });
      if (error) throw new Error(`list ${prefix || "/"} failed: ${error.message}`);
      for (const item of data ?? []) {
        const path = prefix ? `${prefix}/${item.name}` : item.name;
        if (item.id === null) folders.push(path); // a folder
        else out.push({ path, createdAt: item.created_at ?? null });
      }
      if (!data || data.length < 1000) break;
    }
  }
  return out;
}

async function main() {
  const all = await listAll();
  const targets = intakeId
    ? intakeObjects(all, intakeId)
    : (() => {
        const plan = planPurge(all, new Date());
        console.log(`${all.length} stored file(s); ${plan.expired.length} older than ${UPLOAD_RETENTION_DAYS} days; ${plan.kept} within the window; ${plan.undated.length} undated (never auto-deleted).`);
        for (const o of plan.undated) console.log(`  undated: ${o.path}`);
        return plan.expired;
      })();

  for (const o of targets) console.log(`  ${doDelete ? "deleting" : "would delete"}: ${o.path} (${o.createdAt ?? "no date"})`);
  if (!doDelete) {
    console.log(`Dry run: ${targets.length} file(s) would be deleted. Add --delete to delete them.`);
    return;
  }
  let removed = 0;
  for (const batch of batches(targets.map((o) => o.path))) {
    const { error } = await supabase.storage.from(BUCKET).remove(batch);
    if (error) throw new Error(`remove failed after ${removed} file(s): ${error.message}`);
    const { error: rowErr } = await supabase.from("audit_uploads").delete().in("storage_path", batch);
    if (rowErr) console.error(`  files removed but audit_uploads rows not deleted: ${rowErr.message}`);
    removed += batch.length;
  }
  console.log(`Deleted ${removed} file(s) on ${new Date().toISOString().slice(0, 10)}. Record the run in docs/security/README.md.`);
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
