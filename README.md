# report-gen

Application web qui génère des rapports PDF à partir d'un template `.docx` à balises et de
datasources (JSON, PDF unique, dossier de PDFs). Le PDF final assemble le corps généré
depuis le `.docx`, intercale les PDFs externes aux bons endroits, produit une **annexe
auto-générée avec liens cliquables** et applique une **pagination cohérente** sur l'ensemble.

## Stack

- **web/** — React + Vite + TypeScript + Tailwind. UI française, responsive mobile/desktop.
- **worker/** — Python 3.12 + FastAPI + `docxtpl` + **PyMuPDF (`fitz`)** + LibreOffice headless.
- **supabase/** — schéma Postgres + RLS + 3 buckets storage (`templates`, `inputs`, `outputs`).

## Syntaxe des balises dans le `.docx`

`docxtpl` (Jinja2) pour les champs et boucles, plus des marqueurs textuels littéraux pour
les inserts PDF et l'annexe.

| Balise | Effet |
| --- | --- |
| `{{ client.nom }}` | Insère la valeur depuis le JSON (dot-notation). |
| `{% for it in items %}{{ it.label }}{% endfor %}` | Boucle sur un tableau du JSON. |
| `{% if hasAnnex %}...{% endif %}` | Condition. |
| `@@pdf:contrat` | Insère le PDF du slot `contrat` après la page où apparaît le marqueur. |
| `@@pdfdir:annexes` | Insère tous les PDFs du dossier `annexes` (ordre alphabétique). |
| `@@annex` | Emplacement de l'annexe auto-générée. Par défaut en fin si absent. |

**Astuce** : placer chaque marqueur `@@…` sur sa propre ligne pour fiabiliser la détection
post-conversion PDF.

## Mise en route locale

### 0. Pré-requis

- Node 20+ et `pnpm` (ou `npm`/`yarn`)
- Python 3.11+
- **LibreOffice** (binaire `soffice` dans le PATH) :
  - macOS : `brew install --cask libreoffice` puis `ln -s /Applications/LibreOffice.app/Contents/MacOS/soffice /usr/local/bin/soffice`
  - Linux : `apt install libreoffice-core libreoffice-writer`
- Un projet Supabase (cloud ou local via `supabase start`)

### 1. Supabase

Dans l'éditeur SQL du projet Supabase, exécuter [supabase/migrations/0001_init.sql](supabase/migrations/0001_init.sql).
Cela crée les tables, les policies RLS, les buckets et un trigger de création de profil.

Récupérer dans le dashboard Supabase :

- `URL` du projet (Settings → API)
- **Publishable key** `sb_publishable_...` (Settings → API Keys, pour le frontend)
- **Secret key** `sb_secret_...` (Settings → API Keys, pour le worker — **ne jamais exposer côté front**)
- _(optionnel)_ **Legacy JWT Secret HS256** (Settings → JWT Keys → onglet "Legacy JWT Secret").
  Le worker vérifie les nouveaux JWT via JWKS (ES256/RS256) sans config supplémentaire ;
  ce secret n'est utile que si tu reçois encore d'anciens tokens HS256 en circulation.

### 2. Worker (Python / FastAPI)

```bash
cd worker
python -m venv .venv && source .venv/bin/activate
pip install -e .
cp .env.example .env
# éditer .env (SUPABASE_URL, SUPABASE_SECRET_KEY, SUPABASE_JWT_SECRET, CORS_ORIGINS)
uvicorn app.server:app --reload --port 8080
```

Vérifier `http://localhost:8080/health` → `{"ok": true, "soffice_available": true, ...}`.

### 3. Web (React / Vite)

```bash
cd web
pnpm install     # ou: npm install
cp .env.example .env.local
# éditer .env.local (VITE_SUPABASE_URL, VITE_SUPABASE_PUBLISHABLE_KEY, VITE_WORKER_URL)
pnpm dev         # http://localhost:5173
```

### 4. Test end-to-end

1. Créer un compte sur l'UI.
2. Créer un rapport.
3. Importer un `.docx` contenant par exemple :
   ```
   Rapport pour {{ client.nom }}
   {% for it in items %}- {{ it.label }} : {{ it.value }}
   {% endfor %}

   @@pdf:contrat

   @@pdfdir:annexes

   @@annex
   ```
4. Coller un JSON :
   ```json
   {
     "client": { "nom": "ACME" },
     "items": [
       { "label": "Ligne 1", "value": "Valeur A" },
       { "label": "Ligne 2", "value": "Valeur B" }
     ]
   }
   ```
5. Uploader un PDF pour `contrat` et plusieurs PDFs pour `annexes`.
6. Lancer la génération, attendre `status = done`, télécharger le PDF.
7. Contrôles : valeurs JSON OK, PDFs insérés au bon endroit, ordre alphabétique pour
   `pdfdir`, annexe avec liens cliquables, pagination "Page X / N" continue.

## Déploiement

- **Web** : Vercel ou Netlify, build `pnpm build`, output `web/dist`.
- **Worker** : Render (Docker) — voir `worker/render.yaml`. Configurer les 3 variables
  d'env (`SUPABASE_URL`, `SUPABASE_SECRET_KEY`, `SUPABASE_JWT_SECRET`) et
  `CORS_ORIGINS` avec l'URL Vercel/Netlify.
- Mettre à jour `VITE_WORKER_URL` côté web pour pointer sur l'URL Render.

## Structure du repo

```
report-gen/
├── web/                       # React + Vite + Tailwind
│   ├── src/
│   │   ├── pages/             # Login, Dashboard, ReportEditor, ReportGenerate
│   │   ├── components/        # AppLayout
│   │   └── lib/               # supabase, auth, worker, toast
│   ├── tailwind.config.js
│   └── vite.config.ts
├── worker/                    # Python + FastAPI
│   ├── app/
│   │   ├── server.py          # FastAPI + routes /parse /generate
│   │   ├── pipeline.py        # Orchestration de la génération
│   │   ├── markers.py         # Localisation des marqueurs @@... avec PyMuPDF
│   │   ├── annex.py           # Annexe + liens internes cliquables
│   │   ├── parse_docx.py      # Extraction des placeholders du .docx
│   │   ├── auth.py            # Vérification JWT Supabase
│   │   ├── storage.py         # Accès Supabase Storage (secret key)
│   │   └── config.py          # Paramètres env
│   ├── Dockerfile             # image Render avec LibreOffice
│   ├── render.yaml
│   └── pyproject.toml
└── supabase/
    └── migrations/0001_init.sql
```

## Limites du MVP (et plan B)

- **Pas de queue** : génération synchrone en background-task FastAPI. Acceptable < 60 s.
  Au-delà : migrer vers `arq` + Redis Render.
- **Détection marqueurs** : exige une balise par ligne (consigne UI). Si césure, fallback
  regex tolérante mais peut rater des cas tordus.
- **Taille uploads** : limite 50 Mo des buckets Supabase free. Plan B : compression
  PyMuPDF (`save(deflate=True, garbage=4)`) déjà appliquée.
- **Pages des marqueurs** : la page où apparaît le texte `@@…` reste visible (le marqueur
  est inséré dans le doc). Au MVP c'est acceptable ; à terme on pourrait masquer la ligne
  via un style invisible ou un module docxtpl custom.
