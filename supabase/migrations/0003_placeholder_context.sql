-- Enrichit les placeholders avec leur section (fil d'Ariane) et un extrait
-- contextuel du .docx pour une UI plus lisible et navigable.

alter table public.report_placeholders
  add column if not exists section text,
  add column if not exists context text,
  add column if not exists position int not null default 0;

create index if not exists idx_placeholders_report_position
  on public.report_placeholders(report_id, position);
