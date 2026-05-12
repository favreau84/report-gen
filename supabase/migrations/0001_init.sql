-- Report Generator — schéma initial
-- Tables: profiles, reports, report_placeholders, datasources, generations
-- RLS: chaque utilisateur ne voit que ses propres lignes
-- Buckets storage: templates, inputs, outputs (privés, accès owner-only)

create extension if not exists "uuid-ossp";

-- =========================
-- ENUMS
-- =========================
do $$ begin
  create type report_status as enum ('draft', 'ready', 'generating', 'done', 'failed');
exception when duplicate_object then null; end $$;

do $$ begin
  create type placeholder_type as enum ('field', 'loop', 'pdf', 'pdfdir', 'annex');
exception when duplicate_object then null; end $$;

do $$ begin
  create type datasource_kind as enum ('json', 'pdf', 'pdfdir');
exception when duplicate_object then null; end $$;

do $$ begin
  create type generation_status as enum ('pending', 'running', 'done', 'failed');
exception when duplicate_object then null; end $$;

-- =========================
-- TABLES
-- =========================

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.reports (
  id uuid primary key default uuid_generate_v4(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  docx_path text,
  status report_status not null default 'draft',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_reports_owner on public.reports(owner_id);

create table if not exists public.report_placeholders (
  id uuid primary key default uuid_generate_v4(),
  report_id uuid not null references public.reports(id) on delete cascade,
  key text not null,
  type placeholder_type not null,
  required boolean not null default true,
  created_at timestamptz not null default now(),
  unique (report_id, key, type)
);
create index if not exists idx_placeholders_report on public.report_placeholders(report_id);

create table if not exists public.datasources (
  id uuid primary key default uuid_generate_v4(),
  report_id uuid not null references public.reports(id) on delete cascade,
  key text not null,
  kind datasource_kind not null,
  json_payload jsonb,
  storage_path text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (report_id, key)
);
create index if not exists idx_datasources_report on public.datasources(report_id);

create table if not exists public.generations (
  id uuid primary key default uuid_generate_v4(),
  report_id uuid not null references public.reports(id) on delete cascade,
  owner_id uuid not null references auth.users(id) on delete cascade,
  status generation_status not null default 'pending',
  output_path text,
  error text,
  started_at timestamptz not null default now(),
  finished_at timestamptz
);
create index if not exists idx_generations_report on public.generations(report_id);
create index if not exists idx_generations_owner on public.generations(owner_id);

-- =========================
-- TRIGGERS: profile auto-create + updated_at
-- =========================
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, email) values (new.id, new.email)
  on conflict (id) do nothing;
  return new;
end; $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end; $$;

drop trigger if exists trg_reports_updated on public.reports;
create trigger trg_reports_updated before update on public.reports
  for each row execute function public.touch_updated_at();

drop trigger if exists trg_datasources_updated on public.datasources;
create trigger trg_datasources_updated before update on public.datasources
  for each row execute function public.touch_updated_at();

-- =========================
-- RLS
-- =========================
alter table public.profiles enable row level security;
alter table public.reports enable row level security;
alter table public.report_placeholders enable row level security;
alter table public.datasources enable row level security;
alter table public.generations enable row level security;

-- profiles: chacun voit/modifie son propre profil
drop policy if exists "profiles self read" on public.profiles;
create policy "profiles self read" on public.profiles
  for select using (auth.uid() = id);

drop policy if exists "profiles self update" on public.profiles;
create policy "profiles self update" on public.profiles
  for update using (auth.uid() = id);

-- reports: propriétaire uniquement
drop policy if exists "reports owner all" on public.reports;
create policy "reports owner all" on public.reports
  for all using (auth.uid() = owner_id) with check (auth.uid() = owner_id);

-- report_placeholders: via le report parent
drop policy if exists "placeholders owner all" on public.report_placeholders;
create policy "placeholders owner all" on public.report_placeholders
  for all using (
    exists (select 1 from public.reports r where r.id = report_placeholders.report_id and r.owner_id = auth.uid())
  ) with check (
    exists (select 1 from public.reports r where r.id = report_placeholders.report_id and r.owner_id = auth.uid())
  );

-- datasources: via le report parent
drop policy if exists "datasources owner all" on public.datasources;
create policy "datasources owner all" on public.datasources
  for all using (
    exists (select 1 from public.reports r where r.id = datasources.report_id and r.owner_id = auth.uid())
  ) with check (
    exists (select 1 from public.reports r where r.id = datasources.report_id and r.owner_id = auth.uid())
  );

-- generations: propriétaire uniquement
drop policy if exists "generations owner all" on public.generations;
create policy "generations owner all" on public.generations
  for all using (auth.uid() = owner_id) with check (auth.uid() = owner_id);

-- =========================
-- STORAGE BUCKETS
-- =========================
insert into storage.buckets (id, name, public)
  values ('templates', 'templates', false)
  on conflict (id) do nothing;
insert into storage.buckets (id, name, public)
  values ('inputs', 'inputs', false)
  on conflict (id) do nothing;
insert into storage.buckets (id, name, public)
  values ('outputs', 'outputs', false)
  on conflict (id) do nothing;

-- Convention path: {owner_id}/...
-- Politique: l'utilisateur peut CRUD ses propres objets dans chaque bucket
do $$
declare b text;
begin
  foreach b in array array['templates','inputs','outputs'] loop
    execute format($f$
      drop policy if exists "%1$s owner read" on storage.objects;
      drop policy if exists "%1$s owner write" on storage.objects;
      drop policy if exists "%1$s owner update" on storage.objects;
      drop policy if exists "%1$s owner delete" on storage.objects;
    $f$, b);
  end loop;
end $$;

create policy "templates owner read" on storage.objects for select using (
  bucket_id = 'templates' and (storage.foldername(name))[1] = auth.uid()::text
);
create policy "templates owner write" on storage.objects for insert with check (
  bucket_id = 'templates' and (storage.foldername(name))[1] = auth.uid()::text
);
create policy "templates owner update" on storage.objects for update using (
  bucket_id = 'templates' and (storage.foldername(name))[1] = auth.uid()::text
);
create policy "templates owner delete" on storage.objects for delete using (
  bucket_id = 'templates' and (storage.foldername(name))[1] = auth.uid()::text
);

create policy "inputs owner read" on storage.objects for select using (
  bucket_id = 'inputs' and (storage.foldername(name))[1] = auth.uid()::text
);
create policy "inputs owner write" on storage.objects for insert with check (
  bucket_id = 'inputs' and (storage.foldername(name))[1] = auth.uid()::text
);
create policy "inputs owner update" on storage.objects for update using (
  bucket_id = 'inputs' and (storage.foldername(name))[1] = auth.uid()::text
);
create policy "inputs owner delete" on storage.objects for delete using (
  bucket_id = 'inputs' and (storage.foldername(name))[1] = auth.uid()::text
);

create policy "outputs owner read" on storage.objects for select using (
  bucket_id = 'outputs' and (storage.foldername(name))[1] = auth.uid()::text
);
-- inputs en outputs sont écrits par le worker (secret key), pas par l'utilisateur
