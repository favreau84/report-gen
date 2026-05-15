-- Convention de balises configurable au niveau du template (comme `reports`).
-- - jinja      : {{ champ }} / {% for %} (défaut)
-- - li_prefix  : <préfixe><nom> + paires DEBUT/FIN, _start/_stop ; le préfixe
--                (ex. `li_`) est paramétrable via `tag_prefix`.
-- Réutilise l'enum `tag_convention` créé en 0002.

alter table public.templates
  add column if not exists tag_convention tag_convention not null default 'jinja';

alter table public.templates
  add column if not exists tag_prefix text not null default 'li_';
