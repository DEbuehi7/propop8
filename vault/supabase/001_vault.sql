-- ============================================================================
-- AIM Vault — private document vault for AIM LLC, Smiling Bubbles Inc (SBI)
-- and Aura8 Inc. Runs in its OWN Supabase project, never the PropOps8 one.
-- Idempotent; safe to re-run in the SQL editor.
--
-- Access model (one person):
--   * Exactly one owner, recorded in vault_owner (must be a real auth user).
--   * Every table and every stored file requires: signed in AS the owner AND
--     a second factor completed in this session (JWT aal = 'aal2').
--     The MFA rule is RESTRICTIVE, so no other policy can bypass it.
--   * anon gets nothing. The service-role key bypasses RLS: never put the
--     vault's service key in Netlify, GitHub or any app — the vault tool
--     signs in as you instead.
--   * Tier 3 (restricted) originals must be encrypted on your machine first
--     (age, *.age) and never get preview copies.
-- ============================================================================

-- gen_random_uuid() is built into Postgres 13+; no extension needed.

-- ---------- Owner ----------------------------------------------------------
create table if not exists public.vault_owner (
  singleton  boolean primary key default true check (singleton),
  owner_id   uuid not null unique references auth.users (id) on delete restrict,
  created_at timestamptz not null default now()
);

create or replace function public.is_vault_owner() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.vault_owner where owner_id = auth.uid());
$$;

create or replace function public.has_mfa() returns boolean
language sql stable as $$
  select coalesce((select auth.jwt() ->> 'aal'), '') = 'aal2';
$$;

-- ---------- Catalog --------------------------------------------------------
create table if not exists public.entities (
  id          text primary key check (id ~ '^[a-z0-9-]+$'),
  name        text not null,
  legal_name  text,              -- fill from the formation documents, never guessed
  bucket      text not null unique check (bucket like 'vault-%'),
  created_at  timestamptz not null default now()
);

insert into public.entities (id, name, bucket) values
  ('aim-llc',   'AIM LLC',   'vault-aim-llc'),
  ('sbi-inc',   'SBI Inc',   'vault-sbi-inc'),
  ('aura8-inc', 'Aura8 Inc', 'vault-aura8-inc')
on conflict (id) do nothing;

create table if not exists public.items (
  id             uuid primary key default gen_random_uuid(),
  entity_id      text not null references public.entities (id) on delete restrict,
  category       text not null check (category in (
                   'filing','governance','ip_protection','contract','financial','tax',
                   'plan','image','audio','video','dataset','schedule','brand',
                   'correspondence','other')),
  title          text not null check (length(title) between 1 and 300),
  doc_date       date,            -- date on the document
  effective_date date,
  expires_on     date,            -- renewals, licences, trademarks
  status         text not null default 'active'
                   check (status in ('draft','active','superseded','expired','archived')),
  tier           smallint not null default 2 check (tier between 0 and 3),
                   -- 0 shareable · 1 internal · 2 confidential · 3 restricted (encrypted)
  version        integer not null default 1 check (version >= 1),
  supersedes     uuid references public.items (id) on delete restrict,
  tags           text[] not null default '{}',
  projects       text[] not null default '{}',   -- propops8, aim-b5r, dance8, stuttr, pure
  notes          text,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);
create index if not exists items_entity_idx   on public.items (entity_id, category, doc_date desc);
create index if not exists items_expires_idx  on public.items (expires_on) where expires_on is not null;
create index if not exists items_tags_idx     on public.items using gin (tags);
create index if not exists items_title_search on public.items using gin (to_tsvector('english', title || ' ' || coalesce(notes, '')));

create table if not exists public.item_files (
  id         uuid primary key default gen_random_uuid(),
  item_id    uuid not null references public.items (id) on delete restrict,
  role       text not null check (role in ('original','preview','listen','reading_copy')),
  bucket     text not null references public.entities (bucket) on delete restrict,
  path       text not null,
  sha256     text not null check (sha256 ~ '^[0-9a-f]{64}$'),
  bytes      bigint not null check (bytes >= 0),
  mime       text not null,
  encrypted  boolean not null default false,
  created_at timestamptz not null default now(),
  unique (bucket, path)
);
-- The same original file is stored once, whatever it is filed under.
create unique index if not exists item_files_original_once on public.item_files (sha256) where role = 'original';
create index if not exists item_files_item_idx on public.item_files (item_id);

create table if not exists public.deadlines (
  id         uuid primary key default gen_random_uuid(),
  entity_id  text not null references public.entities (id) on delete restrict,
  item_id    uuid references public.items (id) on delete restrict,
  title      text not null,
  due_on     date not null,
  recurrence text not null default 'none' check (recurrence in ('none','annual','biennial','monthly','quarterly')),
  status     text not null default 'open' check (status in ('open','done','waived')),
  source_url text,
  notes      text,
  created_at timestamptz not null default now()
);
create index if not exists deadlines_due_idx on public.deadlines (status, due_on);

create table if not exists public.access_log (
  id        bigint generated always as identity primary key,
  at        timestamptz not null default now(),
  actor     uuid not null default auth.uid(),
  action    text not null check (action in ('upload','download','export','update','sign_in')),
  item_id   uuid references public.items (id) on delete restrict,
  detail    jsonb not null default '{}'::jsonb
);

-- ---------- Integrity rules ------------------------------------------------
create or replace function public.vault_check_file() returns trigger
language plpgsql as $$
declare t smallint; e text;
begin
  select i.tier, en.bucket into t, e
    from public.items i join public.entities en on en.id = i.entity_id
   where i.id = new.item_id;
  if e is distinct from new.bucket then
    raise exception 'file must be stored in its entity''s bucket (%), not %', e, new.bucket;
  end if;
  if t = 3 then
    if new.role <> 'original' then
      raise exception 'restricted (tier 3) items get no preview or reading copies';
    end if;
    if not new.encrypted or new.path !~ '\.age$' then
      raise exception 'restricted (tier 3) files must be encrypted with age (*.age) before upload';
    end if;
  end if;
  return new;
end $$;
drop trigger if exists item_files_check on public.item_files;
create trigger item_files_check before insert or update on public.item_files
  for each row execute function public.vault_check_file();

create or replace function public.vault_touch() returns trigger
language plpgsql as $$ begin new.updated_at := now(); return new; end $$;
drop trigger if exists items_touch on public.items;
create trigger items_touch before update on public.items
  for each row execute function public.vault_touch();

create or replace function public.vault_block_mutation() returns trigger
language plpgsql as $$ begin raise exception '% is append-only', tg_table_name; end $$;
drop trigger if exists access_log_append_only on public.access_log;
create trigger access_log_append_only before update or delete on public.access_log
  for each row execute function public.vault_block_mutation();
-- Files are never edited in place: a new version is a new item that supersedes the old one.
drop trigger if exists item_files_no_update on public.item_files;
create trigger item_files_no_update before update on public.item_files
  for each row execute function public.vault_block_mutation();

-- ---------- Row-level security --------------------------------------------
alter table public.vault_owner enable row level security;
alter table public.entities    enable row level security;
alter table public.items       enable row level security;
alter table public.item_files  enable row level security;
alter table public.deadlines   enable row level security;
alter table public.access_log  enable row level security;

grant usage on schema public to authenticated;
grant select on public.vault_owner, public.entities to authenticated;
grant select, insert, update, delete on public.items, public.item_files, public.deadlines to authenticated;
grant select, insert on public.access_log to authenticated;
revoke all on public.vault_owner, public.entities, public.items, public.item_files,
              public.deadlines, public.access_log from anon;

do $$
declare t text;
begin
  foreach t in array array['vault_owner','entities','items','item_files','deadlines','access_log'] loop
    execute format('drop policy if exists %I on public.%I', t || '_mfa', t);
    execute format('create policy %I on public.%I as restrictive for all to authenticated using (public.has_mfa()) with check (public.has_mfa())', t || '_mfa', t);
  end loop;
end $$;

drop policy if exists vault_owner_read on public.vault_owner;
create policy vault_owner_read on public.vault_owner for select to authenticated using (owner_id = auth.uid());

drop policy if exists entities_read on public.entities;
create policy entities_read on public.entities for select to authenticated using (public.is_vault_owner());

do $$
declare t text;
begin
  foreach t in array array['items','item_files','deadlines'] loop
    execute format('drop policy if exists %I on public.%I', t || '_owner', t);
    execute format('create policy %I on public.%I for all to authenticated using (public.is_vault_owner()) with check (public.is_vault_owner())', t || '_owner', t);
  end loop;
end $$;

drop policy if exists access_log_read on public.access_log;
create policy access_log_read on public.access_log for select to authenticated using (public.is_vault_owner());
drop policy if exists access_log_write on public.access_log;
create policy access_log_write on public.access_log for insert to authenticated
  with check (public.is_vault_owner() and actor = auth.uid());

-- ---------- Storage: one private bucket per entity ---------------------------
insert into storage.buckets (id, name, public)
select bucket, bucket, false from public.entities
on conflict (id) do update set public = false;

drop policy if exists vault_files_mfa on storage.objects;
create policy vault_files_mfa on storage.objects as restrictive for all to authenticated
  using (bucket_id not like 'vault-%' or public.has_mfa())
  with check (bucket_id not like 'vault-%' or public.has_mfa());

drop policy if exists vault_files_owner on storage.objects;
create policy vault_files_owner on storage.objects for all to authenticated
  using (bucket_id like 'vault-%' and public.is_vault_owner())
  with check (bucket_id like 'vault-%' and public.is_vault_owner());

-- ---------- One-time: register the owner ------------------------------------
-- Run AFTER you have created your single user (Authentication > Users) and
-- enrolled an authenticator app. Succeeds only when exactly one user exists,
-- so it can never bind the vault to the wrong account:
--
--   insert into public.vault_owner (owner_id)
--   select id from auth.users where (select count(*) from auth.users) = 1
--   on conflict (singleton) do nothing;
