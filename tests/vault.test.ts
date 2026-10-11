/**
 * AIM Vault access rules, run against a real Postgres (PGlite) with Supabase's
 * auth and storage pieces stubbed. Skips when PGlite is not installed:
 *   npm i --no-save @electric-sql/pglite@0.2.17
 * (no-save keeps package.json and the lockfile untouched).
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createRequire } from "node:module";

const req = createRequire(__filename);
let PGliteCtor: (new () => {
  exec(sql: string): Promise<unknown>;
  query<T = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<{ rows: T[] }>;
}) | null = null;
try {
  PGliteCtor = req("@electric-sql/pglite").PGlite;
} catch {
  PGliteCtor = null;
}
const skip = PGliteCtor ? false : "PGlite not installed (npm i --no-save @electric-sql/pglite@0.2.17)";

const OWNER = "11111111-1111-4111-8111-111111111111";
const OTHER = "22222222-2222-4222-8222-222222222222";
const SHA = (c: string) => c.repeat(64);

const STUB = `
create role anon nologin; create role authenticated nologin;
create schema auth;
create table auth.users (id uuid primary key, email text);
create function auth.uid() returns uuid language sql stable as $$
  select nullif(current_setting('request.jwt.claims', true)::json ->> 'sub', '')::uuid $$;
create function auth.jwt() returns jsonb language sql stable as $$
  select coalesce(nullif(current_setting('request.jwt.claims', true), ''), '{}')::jsonb $$;
grant usage on schema auth to anon, authenticated;
create schema storage;
create table storage.buckets (id text primary key, name text, public boolean);
create table storage.objects (id uuid primary key default gen_random_uuid(), bucket_id text, name text, owner uuid default auth.uid());
alter table storage.objects enable row level security;
grant usage on schema storage to authenticated, anon;
grant select, insert, update, delete on storage.objects to authenticated;
`;

async function freshDb() {
  const db = new PGliteCtor!();
  await db.exec(STUB);
  const migration = readFileSync(join(__dirname, "..", "vault", "supabase", "001_vault.sql"), "utf8");
  await db.exec(migration);
  await db.exec(migration); // idempotent: a second run must not fail
  return db;
}

type Db = Awaited<ReturnType<typeof freshDb>>;
async function as(db: Db, sub: string | null, aal: "aal1" | "aal2" = "aal2") {
  await db.exec("reset role");
  if (sub === null) {
    await db.exec("set role anon; select set_config('request.jwt.claims', '', false)");
  } else {
    await db.query("select set_config('request.jwt.claims', $1, false)", [JSON.stringify({ sub, aal, role: "authenticated" })]);
    await db.exec("set role authenticated");
  }
}
async function admin(db: Db) {
  await db.exec("reset role; select set_config('request.jwt.claims', '', false)");
}
async function rejects(p: Promise<unknown>, re: RegExp) {
  await assert.rejects(p, re);
}

async function seeded() {
  const db = await freshDb();
  await db.query("insert into auth.users (id, email) values ($1, 'owner@example.com'), ($2, 'other@example.com')", [OWNER, OTHER]);
  // The README's one-time statement refuses to pick an owner when more than one user exists.
  await db.exec("insert into public.vault_owner (owner_id) select id from auth.users where (select count(*) from auth.users) = 1 on conflict (singleton) do nothing");
  assert.equal((await db.query("select count(*)::int as n from public.vault_owner")).rows[0].n, 0);
  await db.query("insert into public.vault_owner (owner_id) values ($1)", [OWNER]);
  return db;
}

const addItem = (db: Db, tier = 2, entity = "aim-llc") =>
  db.query<{ id: string }>(
    "insert into public.items (entity_id, category, title, tier) values ($1, 'filing', 'Articles of Organization', $2) returning id",
    [entity, tier],
  );

test("vault: owner with two-factor can file, read and log", { skip }, async () => {
  const db = await seeded();
  await as(db, OWNER, "aal2");
  const { rows } = await addItem(db);
  await db.query(
    "insert into public.item_files (item_id, role, bucket, path, sha256, bytes, mime) values ($1, 'original', 'vault-aim-llc', 'filings/aoo.pdf', $2, 1200, 'application/pdf')",
    [rows[0].id, SHA("a")],
  );
  await db.query("insert into public.deadlines (entity_id, title, due_on, recurrence) values ('aim-llc', 'Statement of Information', '2027-03-31', 'biennial')");
  await db.query("insert into public.access_log (action, item_id) values ('upload', $1)", [rows[0].id]);
  assert.equal((await db.query("select count(*)::int as n from public.items")).rows[0].n, 1);
  assert.equal((await db.query("select count(*)::int as n from public.entities")).rows[0].n, 3);
});

test("vault: same owner without the second factor sees nothing and cannot write", { skip }, async () => {
  const db = await seeded();
  await as(db, OWNER, "aal2");
  await addItem(db);
  await as(db, OWNER, "aal1");
  assert.equal((await db.query("select count(*)::int as n from public.items")).rows[0].n, 0);
  assert.equal((await db.query("select count(*)::int as n from public.entities")).rows[0].n, 0);
  await rejects(addItem(db), /row-level security/);
});

test("vault: another signed-in user with two-factor sees nothing", { skip }, async () => {
  const db = await seeded();
  await as(db, OWNER, "aal2");
  await addItem(db);
  await as(db, OTHER, "aal2");
  assert.equal((await db.query("select count(*)::int as n from public.items")).rows[0].n, 0);
  await rejects(addItem(db), /row-level security/);
});

test("vault: anonymous access is refused outright", { skip }, async () => {
  const db = await seeded();
  await as(db, null);
  await rejects(db.query("select * from public.items"), /permission denied/);
  await rejects(db.query("select * from public.vault_owner"), /permission denied/);
});

test("vault: restricted files must be age-encrypted, with no previews", { skip }, async () => {
  const db = await seeded();
  await as(db, OWNER, "aal2");
  const id = (await addItem(db, 3, "sbi-inc")).rows[0].id;
  const ins = (role: string, path: string, enc: boolean, sha: string) =>
    db.query(
      "insert into public.item_files (item_id, role, bucket, path, sha256, bytes, mime, encrypted) values ($1, $2, 'vault-sbi-inc', $3, $4, 10, 'application/octet-stream', $5)",
      [id, role, path, sha, enc],
    );
  await rejects(ins("original", "ein-letter.pdf", false, SHA("b")), /encrypted with age/);
  await rejects(ins("original", "ein-letter.pdf", true, SHA("b")), /encrypted with age/);
  await ins("original", "ein-letter.pdf.age", true, SHA("b"));
  await rejects(ins("preview", "ein-letter.webp", false, SHA("c")), /no preview/);
});

test("vault: wrong bucket, duplicate originals and edits are refused", { skip }, async () => {
  const db = await seeded();
  await as(db, OWNER, "aal2");
  const id = (await addItem(db)).rows[0].id;
  await rejects(
    db.query("insert into public.item_files (item_id, role, bucket, path, sha256, bytes, mime) values ($1, 'original', 'vault-aura8-inc', 'x.pdf', $2, 1, 'application/pdf')", [id, SHA("d")]),
    /entity's bucket/,
  );
  await db.query("insert into public.item_files (item_id, role, bucket, path, sha256, bytes, mime) values ($1, 'original', 'vault-aim-llc', 'x.pdf', $2, 1, 'application/pdf')", [id, SHA("d")]);
  const id2 = (await addItem(db)).rows[0].id;
  await rejects(
    db.query("insert into public.item_files (item_id, role, bucket, path, sha256, bytes, mime) values ($1, 'original', 'vault-aim-llc', 'copy.pdf', $2, 1, 'application/pdf')", [id2, SHA("d")]),
    /duplicate key/,
  );
  await rejects(db.query("update public.item_files set bytes = 2"), /append-only/);
  await db.query("insert into public.access_log (action) values ('export')");
  await rejects(db.query("update public.access_log set action = 'upload'"), /append-only|row-level security|permission denied/);
  await rejects(db.query("insert into public.access_log (action, actor) values ('export', $1)", [OTHER]), /row-level security/);
});

test("vault: stored files follow the same owner + two-factor rule", { skip }, async () => {
  const db = await seeded();
  await admin(db);
  assert.deepEqual(
    (await db.query<{ id: string; public: boolean }>("select id, public from storage.buckets order by id")).rows,
    [{ id: "vault-aim-llc", public: false }, { id: "vault-aura8-inc", public: false }, { id: "vault-sbi-inc", public: false }],
  );
  const put = () => db.query("insert into storage.objects (bucket_id, name) values ('vault-aim-llc', 'filings/aoo.pdf')");
  await as(db, OWNER, "aal1");
  await rejects(put(), /row-level security/);
  await as(db, OTHER, "aal2");
  await rejects(put(), /row-level security/);
  await as(db, OWNER, "aal2");
  await put();
  assert.equal((await db.query("select count(*)::int as n from storage.objects")).rows[0].n, 1);
  await as(db, OTHER, "aal2");
  assert.equal((await db.query("select count(*)::int as n from storage.objects")).rows[0].n, 0);
});
