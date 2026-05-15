-- Introduit la notion de « template » comme entité de premier ordre.
-- Un template = une définition de rapport réutilisable, adossée à un DOCX à
-- balises. Les « documents » / instances générés depuis un template viendront
-- dans une migration ultérieure (modèle construit progressivement).
--
-- Cette migration ne crée que le strict nécessaire pour : créer un template via
-- import DOCX + persister les balises détectées (détection cliente d'abord,
-- analyse worker autoritative branchée plus tard).
--
-- Réutilise l'enum `report_status` (draft/ready/generating/done/failed) et
-- `placeholder_type` (field/loop/block/pdf/pdfdir/annex, déjà étendu en 0002).
-- Réutilise le bucket storage privé `templates` (chemin {owner}/{template}/…).

create table if not exists public.templates (
  id uuid primary key default uuid_generate_v4(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  status report_status not null default 'draft',
  category text,
  version_tag text not null default 'v1',
  docx_path text,
  docx_filename text,
  docx_size_bytes bigint,
  docx_pages int,
  docx_sha256 text,
  docx_uploaded_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_templates_owner on public.templates(owner_id);

-- Balises détectées dans le DOCX du template. Même forme que
-- report_placeholders mais rattachées au template ; `detected_by` distingue la
-- détection cliente (préliminaire) de l'analyse worker (autoritative).
create table if not exists public.template_placeholders (
  id uuid primary key default uuid_generate_v4(),
  template_id uuid not null references public.templates(id) on delete cascade,
  key text not null,
  type placeholder_type not null,
  required boolean not null default true,
  section text,
  context text,
  position int not null default 0,
  detected_by text not null default 'client',
  created_at timestamptz not null default now(),
  unique (template_id, key, type)
);

create index if not exists idx_template_placeholders_template
  on public.template_placeholders(template_id);
create index if not exists idx_template_placeholders_template_position
  on public.template_placeholders(template_id, position);

-- RLS — même pattern que reports / report_placeholders.
alter table public.templates enable row level security;
alter table public.template_placeholders enable row level security;

drop policy if exists "templates owner all" on public.templates;
create policy "templates owner all" on public.templates
  for all using (auth.uid() = owner_id) with check (auth.uid() = owner_id);

drop policy if exists "template_placeholders owner all" on public.template_placeholders;
create policy "template_placeholders owner all" on public.template_placeholders
  for all using (
    exists (
      select 1 from public.templates t
      where t.id = template_placeholders.template_id and t.owner_id = auth.uid()
    )
  ) with check (
    exists (
      select 1 from public.templates t
      where t.id = template_placeholders.template_id and t.owner_id = auth.uid()
    )
  );

-- Touch updated_at (fonction définie en 0001).
drop trigger if exists trg_templates_updated on public.templates;
create trigger trg_templates_updated before update on public.templates
  for each row execute function public.touch_updated_at();
