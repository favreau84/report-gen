-- Ajoute le choix de convention de balises par rapport
-- - jinja      : {{ champ }} / {% for %} (défaut)
-- - li_prefix  : <préfixe><nom> + paires <préfixe><x>DEBUT/FIN et _start/_stop
--                Le préfixe lui-même est paramétrable via la colonne `tag_prefix`.
--                Le nom de l'enum reste `li_prefix` pour compat — pense-le comme
--                "convention par préfixe configurable".

do $$ begin
  create type tag_convention as enum ('jinja', 'li_prefix');
exception when duplicate_object then null; end $$;

alter table public.reports
  add column if not exists tag_convention tag_convention not null default 'jinja';

-- Préfixe utilisé en mode `li_prefix`. Stocké en lowercase, peut être n'importe
-- quelle chaîne (par ex. `li_`, `tag_`, `bal_`, etc.).
alter table public.reports
  add column if not exists tag_prefix text not null default 'li_';

-- Nouveau type de placeholder pour les blocs conditionnels (paires _DEBUT/_FIN, _start/_stop)
alter type placeholder_type add value if not exists 'block';
