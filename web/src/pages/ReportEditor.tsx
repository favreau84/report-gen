import { useCallback, useEffect, useMemo, useRef, useState, type DragEvent } from 'react';
import { createPortal } from 'react-dom';
import { Link, useNavigate, useParams } from 'react-router-dom';
import {
  ArrowLeft,
  FileUp,
  PanelRightClose,
  PanelRightOpen,
  Play,
  Search,
  Upload,
} from 'lucide-react';
import { cn } from '../lib/cn';
import {
  supabase,
  type Datasource,
  type PlaceholderType,
  type Report,
  type ReportPlaceholder,
  type TagConvention,
} from '../lib/supabase';
import { getPreviewPdf, parseDocx } from '../lib/worker';
import { useAuth } from '../lib/auth';
import { useToast } from '../lib/toast';
import { DocPreviewDialog, DocPreviewPanel } from '../components/DocPreview';

const TYPE_LABEL: Record<PlaceholderType, string> = {
  field: 'Champ texte',
  loop: 'Boucle',
  block: 'Bloc (DEBUT/FIN)',
  pdf: 'PDF unique',
  pdfdir: 'Dossier de PDFs',
  annex: 'Annexe (auto)',
};

const CONVENTION_LABEL: Record<TagConvention, string> = {
  jinja: 'Jinja `{{ champ }}` / `{% for %}`',
  li_prefix: 'Préfixe configurable (ex. `li_`, `tag_`, `bal_`)',
};

export function ReportEditorPage() {
  const { id } = useParams();
  const { user } = useAuth();
  const toast = useToast();
  const navigate = useNavigate();

  const [report, setReport] = useState<Report | null>(null);
  const [placeholders, setPlaceholders] = useState<ReportPlaceholder[]>([]);
  const [datasources, setDatasources] = useState<Datasource[]>([]);
  const [uploading, setUploading] = useState(false);
  const [parsing, setParsing] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [prefixDraft, setPrefixDraft] = useState('');
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  const [pdfLoading, setPdfLoading] = useState(false);
  const [pdfError, setPdfError] = useState<string | null>(null);
  const [highlightedKey, setHighlightedKey] = useState<string | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [panelOpen, setPanelOpen] = useState<boolean>(() => {
    if (typeof window === 'undefined') return true;
    const stored = window.localStorage.getItem('reportEditor:panelOpen');
    return stored === null ? true : stored === '1';
  });

  useEffect(() => {
    if (typeof window !== 'undefined') {
      window.localStorage.setItem('reportEditor:panelOpen', panelOpen ? '1' : '0');
    }
  }, [panelOpen]);

  // Quand le panel doc est actif, on pousse le contenu principal vers la gauche
  // via une classe sur <body>. La classe est retirée si le rapport n'a pas
  // (encore) de placeholders/docx.
  useEffect(() => {
    const cls = 'has-doc-panel';
    const active = panelOpen && (placeholders.length > 0 || !!pdfUrl);
    if (active) {
      document.body.classList.add(cls);
    } else {
      document.body.classList.remove(cls);
    }
    return () => {
      document.body.classList.remove(cls);
    };
  }, [panelOpen, placeholders.length, pdfUrl]);
  const docxInput = useRef<HTMLInputElement>(null);

  function onDragOver(e: DragEvent<HTMLDivElement>) {
    e.preventDefault();
    e.stopPropagation();
    if (e.dataTransfer.types.includes('Files')) setDragOver(true);
  }
  function onDragLeave(e: DragEvent<HTMLDivElement>) {
    e.preventDefault();
    e.stopPropagation();
    setDragOver(false);
  }
  function onDrop(e: DragEvent<HTMLDivElement>) {
    e.preventDefault();
    e.stopPropagation();
    setDragOver(false);
    const file = e.dataTransfer.files?.[0] ?? null;
    void onDocxSelected(file);
  }

  useEffect(() => {
    if (id) void loadAll();
  }, [id]);

  // Demande au worker l'aperçu PDF (conversion via LibreOffice + cache Supabase).
  const fetchPreview = useCallback(
    async (force: boolean) => {
      if (!report?.docx_path) {
        setPdfUrl(null);
        return;
      }
      setPdfLoading(true);
      setPdfError(null);
      try {
        const res = await getPreviewPdf(report.id, force);
        setPdfUrl(res.signed_url);
      } catch (e) {
        const msg = (e as Error).message;
        if (msg.includes('LibreOffice')) {
          setPdfError(
            "LibreOffice n'est pas installé sur le worker. Installe-le pour activer l'aperçu fidèle (et la génération finale du PDF).",
          );
        } else {
          setPdfError(msg);
        }
        setPdfUrl(null);
      } finally {
        setPdfLoading(false);
      }
    },
    [report?.id, report?.docx_path],
  );

  useEffect(() => {
    if (report?.docx_path) {
      void fetchPreview(false);
    } else {
      setPdfUrl(null);
    }
  }, [report?.id, report?.docx_path, fetchPreview]);

  const navigableKeys = useMemo(
    () =>
      placeholders
        .slice()
        .sort((a, b) => a.position - b.position)
        .map((p) => p.key),
    [placeholders],
  );

  function openInDoc(key: string) {
    setHighlightedKey(key);
    if (typeof window !== 'undefined' && window.matchMedia('(max-width: 1023px)').matches) {
      setDialogOpen(true);
    }
  }

  /** Appelé par le panel/dialog quand l'utilisateur clique une balise du PDF. */
  function handlePanelSelect(key: string | null) {
    setHighlightedKey(key);
    if (!key) return;
    const match = placeholders.find((p) => p.key === key && p.type === 'field');
    if (!match) return;
    if (typeof window === 'undefined') return;
    // Laisse React rendre l'éventuel changement avant de focuser
    window.setTimeout(() => {
      const input = document.getElementById(`f-${match.id}`) as HTMLInputElement | null;
      if (!input) return;
      if (document.activeElement !== input) {
        input.focus({ preventScroll: true });
        input.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    }, 0);
  }

  async function loadAll() {
    if (!id) return;
    const [r, p, d] = await Promise.all([
      supabase.from('reports').select('*').eq('id', id).single(),
      supabase
        .from('report_placeholders')
        .select('*')
        .eq('report_id', id)
        .order('position', { ascending: true }),
      supabase.from('datasources').select('*').eq('report_id', id),
    ]);
    if (r.error) {
      toast.push('error', r.error.message);
      return;
    }
    const reportRow = r.data as Report;
    setReport(reportRow);
    setPlaceholders((p.data ?? []) as ReportPlaceholder[]);
    setDatasources((d.data ?? []) as Datasource[]);
    setPrefixDraft((reportRow.tag_prefix ?? 'li_').toLowerCase());
  }

  async function onDocxSelected(file: File | null) {
    if (!file || !user || !report) return;
    if (!file.name.toLowerCase().endsWith('.docx')) {
      toast.push('error', 'Seuls les fichiers .docx sont acceptés.');
      return;
    }
    setUploading(true);
    const path = `${user.id}/${report.id}/template.docx`;
    const { error: upErr } = await supabase.storage
      .from('templates')
      .upload(path, file, {
        upsert: true,
        contentType:
          'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      });
    if (upErr) {
      setUploading(false);
      toast.push('error', upErr.message);
      return;
    }
    const { error: updErr } = await supabase
      .from('reports')
      .update({ docx_path: path, status: 'draft' })
      .eq('id', report.id);
    if (updErr) {
      setUploading(false);
      toast.push('error', updErr.message);
      return;
    }
    toast.push('success', 'Template uploadé.');
    setUploading(false);
    await loadAll();
    void runParse();
  }

  async function setConvention(value: TagConvention) {
    if (!report || value === report.tag_convention) return;
    const { error } = await supabase
      .from('reports')
      .update({ tag_convention: value })
      .eq('id', report.id);
    if (error) {
      toast.push('error', error.message);
      return;
    }
    toast.push('success', 'Convention mise à jour.');
    await loadAll();
    if (report.docx_path) void runParse();
  }

  async function runParse() {
    if (!report) return;
    setParsing(true);
    try {
      const res = await parseDocx(report.id);
      setSuggestions(res.suggested_prefixes ?? []);
      // remplace en DB
      await supabase.from('report_placeholders').delete().eq('report_id', report.id);
      if (res.placeholders.length > 0) {
        await supabase.from('report_placeholders').insert(
          res.placeholders.map((p) => ({
            report_id: report.id,
            key: p.key,
            type: p.type,
            required: p.required,
            section: p.section || null,
            context: p.context || null,
            position: p.position,
          })),
        );
      }
      toast.push('success', `${res.placeholders.length} balise(s) détectée(s).`);
      await loadAll();
    } catch (e) {
      toast.push('error', (e as Error).message);
    } finally {
      setParsing(false);
    }
  }

  async function savePrefix(value: string) {
    if (!report) return;
    const normalized = value.trim().toLowerCase();
    if (!normalized || normalized === report.tag_prefix) {
      setPrefixDraft(report.tag_prefix);
      return;
    }
    const { error } = await supabase
      .from('reports')
      .update({ tag_prefix: normalized })
      .eq('id', report.id);
    if (error) {
      toast.push('error', error.message);
      return;
    }
    toast.push('success', `Préfixe mis à jour : ${normalized}`);
    await loadAll();
    if (report.docx_path) void runParse();
  }

  const missingRequired = useMemo(() => {
    return placeholders.filter((p) => {
      if (p.type === 'annex' || p.type === 'block') return false;
      if (p.type === 'loop') {
        // les loops sont satisfaites par le JSON global (key "root"). On considère que tant qu'un JSON existe, OK.
        return !datasources.some((d) => d.kind === 'json');
      }
      if (p.type === 'field') {
        return !datasources.some((d) => d.kind === 'json');
      }
      // pdf / pdfdir
      const expectedKind = p.type === 'pdf' ? 'pdf' : 'pdfdir';
      return !datasources.some((d) => d.kind === expectedKind && d.key === p.key);
    });
  }, [placeholders, datasources]);

  if (!report) {
    return <div className="text-sm text-muted">Chargement…</div>;
  }

  const fieldOrLoopPresent = placeholders.some(
    (p) => p.type === 'field' || p.type === 'loop',
  );
  const jsonDs = datasources.find((d) => d.kind === 'json');

  return (
    <div className="space-y-6">
      <header className="flex items-center justify-between gap-3">
        <Link to="/dashboard" className="btn-ghost px-2 py-1.5">
          <ArrowLeft size={16} /> Retour
        </Link>
        <div className="flex items-center gap-2">
          {placeholders.length > 0 && (
            <button
              type="button"
              onClick={() => setPanelOpen((v) => !v)}
              className="btn-ghost hidden lg:inline-flex"
              title={panelOpen ? "Masquer l'aperçu" : 'Afficher l’aperçu'}
              aria-label={panelOpen ? "Masquer l'aperçu" : "Afficher l'aperçu"}
            >
              {panelOpen ? <PanelRightClose size={16} /> : <PanelRightOpen size={16} />}
              <span className="hidden xl:inline">
                {panelOpen ? 'Masquer l’aperçu' : 'Afficher l’aperçu'}
              </span>
            </button>
          )}
          <button
            className="btn-primary"
            disabled={!report.docx_path || missingRequired.length > 0}
            onClick={() => navigate(`/reports/${report.id}/generate`)}
          >
            <Play size={16} />
            Générer le PDF
          </button>
        </div>
      </header>

      <div>
        <h1 className="text-xl font-semibold">{report.name}</h1>
        <p className="text-sm text-muted">Configurez le template et les sources de données.</p>
      </div>

      {/* Convention de balises */}
      <section className="card p-5 space-y-3">
        <div>
          <h2 className="font-semibold">Convention de balises</h2>
          <p className="text-sm text-muted">
            Comment les balises sont écrites dans le .docx.
          </p>
        </div>
        <div className="flex flex-col gap-2">
          {(['jinja', 'li_prefix'] as TagConvention[]).map((conv) => (
            <label
              key={conv}
              className={cn(
                'flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition-colors',
                report.tag_convention === conv
                  ? 'border-accent bg-accent/5'
                  : 'border-line hover:bg-bg',
              )}
            >
              <input
                type="radio"
                name="convention"
                className="mt-1 accent-accent"
                checked={report.tag_convention === conv}
                onChange={() => setConvention(conv)}
              />
              <div className="text-sm flex-1 min-w-0">
                <div className="font-medium">{CONVENTION_LABEL[conv]}</div>
                {conv === 'li_prefix' && (
                  <div className="text-xs text-muted mt-0.5">
                    Détecte <code>{report.tag_prefix || 'li_'}xxx</code> (insensible à la casse).
                    Les paires <code>_DEBUT/_FIN</code> et <code>_start/_stop</code> sont
                    identifiées comme blocs (l'évaluation conditionnelle n'est pas encore
                    branchée).
                  </div>
                )}
                {conv === 'jinja' && (
                  <div className="text-xs text-muted mt-0.5">
                    Syntaxe Jinja standard : <code>{'{{ champ }}'}</code>,{' '}
                    <code>{'{% for x in items %}'}</code>.
                  </div>
                )}
              </div>
            </label>
          ))}
        </div>

        {report.tag_convention === 'li_prefix' && (
          <div className="pt-2 space-y-2">
            <label className="label" htmlFor="tag-prefix">
              Préfixe des balises
            </label>
            <div className="flex flex-col sm:flex-row gap-2">
              <input
                id="tag-prefix"
                className="input sm:max-w-xs font-mono"
                value={prefixDraft}
                onChange={(e) => setPrefixDraft(e.target.value)}
                onBlur={() => savePrefix(prefixDraft)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    (e.target as HTMLInputElement).blur();
                  }
                }}
                placeholder="li_"
                autoCapitalize="off"
                autoCorrect="off"
                spellCheck={false}
              />
              <div className="text-xs text-muted self-center">
                En minuscule. La détection ignore la casse dans le .docx.
              </div>
            </div>
            {suggestions.length > 0 && (
              <div className="flex flex-wrap items-center gap-2 text-xs text-muted">
                Suggestions détectées :
                {suggestions.map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => {
                      setPrefixDraft(s);
                      void savePrefix(s);
                    }}
                    className={cn(
                      'px-2 py-0.5 rounded-md border font-mono',
                      report.tag_prefix === s
                        ? 'border-accent text-accent bg-accent/5'
                        : 'border-line text-ink hover:bg-bg',
                    )}
                  >
                    {s}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
      </section>

      {/* Step 1: docx */}
      <section
        className={cn(
          'card p-5 space-y-4 transition-colors',
          dragOver && 'border-accent bg-accent/5 ring-2 ring-accent/30',
        )}
        onDragEnter={onDragOver}
        onDragOver={onDragOver}
        onDragLeave={onDragLeave}
        onDrop={onDrop}
      >
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div>
            <h2 className="font-semibold">1. Template .docx</h2>
            <p className="text-sm text-muted">
              Importez le fichier .docx qui contient les balises (
              <code className="text-xs">{'{{ champ }}'}</code>,{' '}
              <code className="text-xs">@@pdf:nom</code>, <code className="text-xs">@@annex</code>, etc.).
            </p>
            <p className="text-xs text-muted mt-1">
              Glissez-déposez le fichier ici ou utilisez le bouton.
            </p>
          </div>
          <input
            ref={docxInput}
            type="file"
            accept=".docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
            className="hidden"
            onChange={(e) => onDocxSelected(e.target.files?.[0] ?? null)}
          />
          <button
            className="btn-secondary"
            onClick={() => docxInput.current?.click()}
            disabled={uploading}
          >
            <FileUp size={16} />
            {report.docx_path ? 'Remplacer le .docx' : 'Importer un .docx'}
          </button>
        </div>
        {dragOver && (
          <div className="rounded-lg border-2 border-dashed border-accent/50 bg-white/60 p-6 text-center text-sm text-accent font-medium pointer-events-none">
            Déposez votre .docx ici
          </div>
        )}
        {report.docx_path && !dragOver && (
          <div className="text-sm">
            <span className="text-muted">Template actuel :</span>{' '}
            <span className="text-ink break-all">{report.docx_path}</span>
            <button
              className="ml-3 text-accent hover:text-accentHover text-sm"
              onClick={runParse}
              disabled={parsing}
            >
              {parsing ? 'Analyse…' : 'Ré-analyser les balises'}
            </button>
          </div>
        )}
      </section>

      {/* Step 2: placeholders + datasources */}
      {placeholders.length > 0 && (
        <>
          <section className="card p-5 space-y-4 min-w-0">
            <div className="flex items-start justify-between gap-2 flex-wrap">
              <div>
                <h2 className="font-semibold">2. Sources de données</h2>
                <p className="text-sm text-muted">
                  Fournissez les données pour chaque balise détectée.
                </p>
              </div>
              {(pdfUrl || pdfLoading || pdfError) && (
                <button
                  type="button"
                  className="btn-secondary lg:hidden"
                  onClick={() => setDialogOpen(true)}
                >
                  <Search size={16} /> Voir le document
                </button>
              )}
            </div>

            {/* JSON / formulaire global pour fields/loops */}
            {fieldOrLoopPresent && (
              <JsonEditor
                reportId={report.id}
                datasource={jsonDs}
                onSaved={loadAll}
                placeholders={placeholders}
                onLocate={openInDoc}
              />
            )}

            {/* PDF/PDFDIR slots */}
            <div className="space-y-3">
              {placeholders
                .filter((p) => p.type === 'pdf' || p.type === 'pdfdir')
                .map((p) => (
                  <PdfSlot
                    key={p.id}
                    ownerId={user!.id}
                    reportId={report.id}
                    placeholder={p}
                    datasource={datasources.find(
                      (d) => d.key === p.key && (d.kind === 'pdf' || d.kind === 'pdfdir'),
                    )}
                    onChange={loadAll}
                    onLocate={openInDoc}
                  />
                ))}
            </div>

            {placeholders.some((p) => p.type === 'annex') && (
              <div className="rounded-lg border border-line bg-bg p-3 text-sm">
                <span className="badge border-accent/30 text-accent bg-accent/5 mr-2">@@annex</span>
                L'annexe sera générée automatiquement à partir des PDFs insérés (avec liens
                cliquables vers la bonne page).
              </div>
            )}

            {placeholders.some((p) => p.type === 'block') && (
              <div className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900 space-y-1">
                <div className="font-medium">
                  Blocs conditionnels détectés (DEBUT/FIN, _start/_stop)
                </div>
                <ul className="list-disc list-inside text-xs text-amber-900/80">
                  {placeholders
                    .filter((p) => p.type === 'block')
                    .map((p) => (
                      <li key={p.id}>
                        <button
                          type="button"
                          onClick={() => openInDoc(p.key)}
                          className="font-mono hover:text-accent"
                        >
                          {p.key}
                        </button>
                      </li>
                    ))}
                </ul>
                <p className="text-xs text-amber-900/80 mt-1">
                  Pour cette version, les marqueurs apparaîtront tels quels dans le PDF final.
                  L'évaluation conditionnelle (afficher/masquer le contenu selon une valeur JSON)
                  arrivera dans une prochaine itération.
                </p>
              </div>
            )}
          </section>

        </>
      )}

      {/* Desktop side panel — rendu en portal vers <body> pour éviter tout
          containing block parasite (py-10 du wrapper main, etc.). */}
      {placeholders.length > 0 &&
        typeof document !== 'undefined' &&
        createPortal(
          <aside
            className={cn(
              'hidden lg:flex fixed inset-y-0 right-0 z-40',
              'w-[440px] xl:w-[520px]',
              'transition-transform duration-300 ease-out',
              panelOpen ? 'translate-x-0' : 'translate-x-full pointer-events-none',
            )}
            aria-hidden={!panelOpen}
          >
            <DocPreviewPanel
              pdfUrl={pdfUrl}
              loading={pdfLoading}
              error={pdfError}
              convention={report.tag_convention}
              prefix={report.tag_prefix}
              navigableKeys={navigableKeys}
              highlightKey={highlightedKey}
              onSelect={handlePanelSelect}
              onRefresh={() => void fetchPreview(true)}
              onClose={() => setPanelOpen(false)}
            />
          </aside>,
          document.body,
        )}

      {/* Mobile dialog */}
      <DocPreviewDialog
        open={dialogOpen}
        onClose={() => setDialogOpen(false)}
        pdfUrl={pdfUrl}
        loading={pdfLoading}
        error={pdfError}
        convention={report.tag_convention}
        prefix={report.tag_prefix}
        navigableKeys={navigableKeys}
        highlightKey={highlightedKey}
        onSelect={(key) => {
          handlePanelSelect(key);
          setDialogOpen(false);
        }}
        onRefresh={() => void fetchPreview(true)}
      />

      {missingRequired.length > 0 && (
        <div className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-800">
          {missingRequired.length} source(s) manquante(s) :{' '}
          {missingRequired.map((p) => p.key).join(', ')}
        </div>
      )}
    </div>
  );
}

// ---------- JSON / Form editor ----------

type JsonObject = Record<string, unknown>;

function getDeep(obj: JsonObject, path: string): unknown {
  return path.split('.').reduce<unknown>(
    (acc, k) => (acc && typeof acc === 'object' ? (acc as JsonObject)[k] : undefined),
    obj,
  );
}

function setDeep(obj: JsonObject, path: string, value: unknown): JsonObject {
  const parts = path.split('.');
  const out: JsonObject = { ...obj };
  let cursor: JsonObject = out;
  for (let i = 0; i < parts.length - 1; i++) {
    const k = parts[i];
    const next = cursor[k];
    cursor[k] = next && typeof next === 'object' && !Array.isArray(next) ? { ...(next as JsonObject) } : {};
    cursor = cursor[k] as JsonObject;
  }
  cursor[parts[parts.length - 1]] = value;
  return out;
}

function JsonEditor({
  reportId,
  datasource,
  onSaved,
  placeholders,
  onLocate,
}: {
  reportId: string;
  datasource: Datasource | undefined;
  onSaved: () => void;
  placeholders: ReportPlaceholder[];
  onLocate: (key: string) => void;
}) {
  const toast = useToast();
  const fieldPlaceholders = useMemo(
    () =>
      placeholders
        .filter((p) => p.type === 'field')
        .slice()
        .sort((a, b) => a.position - b.position),
    [placeholders],
  );
  const loopPlaceholders = useMemo(
    () =>
      placeholders
        .filter((p) => p.type === 'loop')
        .slice()
        .sort((a, b) => a.position - b.position),
    [placeholders],
  );

  const initialData = useMemo<JsonObject>(
    () => (datasource?.json_payload as JsonObject | null) ?? {},
    [datasource?.id, datasource?.json_payload],
  );

  const [mode, setMode] = useState<'form' | 'json'>('form');
  const [data, setData] = useState<JsonObject>(initialData);
  const [jsonText, setJsonText] = useState<string>(() => JSON.stringify(initialData, null, 2));
  const [jsonErr, setJsonErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setData(initialData);
    setJsonText(JSON.stringify(initialData, null, 2));
  }, [initialData]);

  function updateField(key: string, value: string) {
    setData((prev) => setDeep(prev, key, value));
  }

  function switchMode(next: 'form' | 'json') {
    if (next === mode) return;
    if (next === 'json') {
      setJsonText(JSON.stringify(data, null, 2));
      setJsonErr(null);
    } else {
      // Tente de parser pour synchroniser data depuis le texte
      try {
        const parsed = jsonText.trim() ? JSON.parse(jsonText) : {};
        if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
          setData(parsed as JsonObject);
        }
        setJsonErr(null);
      } catch (e) {
        setJsonErr('JSON invalide : ' + (e as Error).message);
        return;
      }
    }
    setMode(next);
  }

  async function persist(payload: JsonObject) {
    setBusy(true);
    try {
      if (datasource) {
        const { error } = await supabase
          .from('datasources')
          .update({ json_payload: payload })
          .eq('id', datasource.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from('datasources').insert({
          report_id: reportId,
          key: 'root',
          kind: 'json',
          json_payload: payload,
        });
        if (error) throw error;
      }
      toast.push('success', 'Données enregistrées.');
      onSaved();
    } catch (e) {
      toast.push('error', (e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function saveForm() {
    await persist(data);
  }

  async function saveJson() {
    let parsed: unknown;
    try {
      parsed = jsonText.trim() ? JSON.parse(jsonText) : {};
    } catch (e) {
      setJsonErr('JSON invalide : ' + (e as Error).message);
      return;
    }
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      setJsonErr('Le JSON racine doit être un objet.');
      return;
    }
    setJsonErr(null);
    setData(parsed as JsonObject);
    await persist(parsed as JsonObject);
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <label className="label mb-0">Champs ({fieldPlaceholders.length})</label>
        <div className="flex items-center gap-1 p-0.5 rounded-lg bg-bg border border-line">
          <button
            type="button"
            onClick={() => switchMode('form')}
            className={cn(
              'px-3 py-1 text-xs rounded-md transition-colors',
              mode === 'form' ? 'bg-white shadow-sm text-ink' : 'text-muted hover:text-ink',
            )}
          >
            Formulaire
          </button>
          <button
            type="button"
            onClick={() => switchMode('json')}
            className={cn(
              'px-3 py-1 text-xs rounded-md transition-colors',
              mode === 'json' ? 'bg-white shadow-sm text-ink' : 'text-muted hover:text-ink',
            )}
          >
            JSON
          </button>
        </div>
      </div>

      {mode === 'form' ? (
        <FormModeEditor
          fieldPlaceholders={fieldPlaceholders}
          loopPlaceholders={loopPlaceholders}
          data={data}
          onChange={updateField}
          onSave={saveForm}
          busy={busy}
          onSwitchToJson={() => switchMode('json')}
          onLocate={onLocate}
        />
      ) : (
        <div className="space-y-2">
          <textarea
            className="input font-mono text-xs h-72"
            spellCheck={false}
            value={jsonText}
            onChange={(e) => setJsonText(e.target.value)}
            placeholder='{"bien_cp": "75001", "items": [{"label": "L1"}]}'
          />
          {jsonErr && <div className="text-xs text-danger">{jsonErr}</div>}
          <button className="btn-primary" onClick={saveJson} disabled={busy}>
            Enregistrer
          </button>
        </div>
      )}
    </div>
  );
}

function FormModeEditor({
  fieldPlaceholders,
  loopPlaceholders,
  data,
  onChange,
  onSave,
  busy,
  onSwitchToJson,
  onLocate,
}: {
  fieldPlaceholders: ReportPlaceholder[];
  loopPlaceholders: ReportPlaceholder[];
  data: JsonObject;
  onChange: (key: string, value: string) => void;
  onSave: () => void;
  busy: boolean;
  onSwitchToJson: () => void;
  onLocate: (key: string) => void;
}) {
  // Groupe les champs par section, en préservant l'ordre d'apparition.
  const sections = useMemo(() => {
    const groups = new Map<string, ReportPlaceholder[]>();
    for (const p of fieldPlaceholders) {
      const key = p.section || '';
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key)!.push(p);
    }
    return Array.from(groups.entries()); // ordre d'insertion = ordre d'apparition
  }, [fieldPlaceholders]);

  if (fieldPlaceholders.length === 0 && loopPlaceholders.length === 0) {
    return <div className="text-sm text-muted">Aucun champ détecté.</div>;
  }

  return (
    <div className="space-y-5">
      {sections.map(([section, items], si) => (
        <div key={section || `__${si}`}>
          <SectionHeader section={section} count={items.length} />
          <div className="mt-2 grid grid-cols-1 md:grid-cols-2 gap-x-4 gap-y-3">
            {items.map((p) => (
              <FieldRow
                key={p.id}
                placeholder={p}
                value={readFieldValue(data, p.key)}
                onChange={(v) => onChange(p.key, v)}
                onLocate={() => onLocate(p.key)}
              />
            ))}
          </div>
        </div>
      ))}

      {loopPlaceholders.length > 0 && (
        <div className="rounded-lg border border-line bg-bg p-3 text-xs text-muted">
          Boucles détectées :{' '}
          {loopPlaceholders.map((p) => (
            <code key={p.id} className="mx-1">{p.key}</code>
          ))}
          . Les listes ne sont pas éditables ici —{' '}
          <button
            type="button"
            onClick={onSwitchToJson}
            className="text-accent hover:text-accentHover"
          >
            passe en mode JSON
          </button>{' '}
          pour les renseigner.
        </div>
      )}

      <div className="flex items-center gap-3 sticky bottom-0 bg-surface/95 backdrop-blur py-2 -mx-2 px-2 border-t border-line">
        <button className="btn-primary" onClick={onSave} disabled={busy}>
          Enregistrer
        </button>
        <span className="text-xs text-muted">
          {fieldPlaceholders.length} champ(s) — les valeurs vides resteront vides dans le PDF.
        </span>
      </div>
    </div>
  );
}

function readFieldValue(data: JsonObject, key: string): string {
  const raw = getDeep(data, key);
  if (raw === undefined || raw === null) return '';
  return typeof raw === 'string' ? raw : JSON.stringify(raw);
}

function SectionHeader({ section, count }: { section: string; count: number }) {
  if (!section) {
    return (
      <div className="flex items-baseline gap-2 border-b border-line pb-1.5">
        <h3 className="text-sm font-semibold text-ink">Hors section</h3>
        <span className="text-xs text-muted">{count} champ(s)</span>
      </div>
    );
  }
  const parts = section.split(' › ');
  return (
    <div className="border-b border-line pb-1.5">
      <div className="flex items-baseline gap-2 flex-wrap">
        <h3 className="text-sm font-semibold text-ink">{parts[parts.length - 1]}</h3>
        <span className="text-xs text-muted">{count} champ(s)</span>
      </div>
      {parts.length > 1 && (
        <div className="text-xs text-muted mt-0.5">
          {parts.slice(0, -1).join(' › ')}
        </div>
      )}
    </div>
  );
}

function FieldRow({
  placeholder,
  value,
  onChange,
  onLocate,
}: {
  placeholder: ReportPlaceholder;
  value: string;
  onChange: (v: string) => void;
  onLocate: () => void;
}) {
  const id = `f-${placeholder.id}`;
  return (
    <div>
      <div className="flex items-baseline justify-between gap-2">
        <label className="label" htmlFor={id}>
          <code className="text-xs">{placeholder.key}</code>
        </label>
        <button
          type="button"
          onClick={onLocate}
          className="text-muted hover:text-accent p-1 -m-1"
          title="Localiser la balise dans le document"
          aria-label="Localiser dans le document"
        >
          <Search size={14} />
        </button>
      </div>
      <input
        id={id}
        className="input"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onFocus={onLocate}
        autoCapitalize="off"
        autoCorrect="off"
        spellCheck={false}
      />
    </div>
  );
}

// ---------- PDF/PDFDIR slot ----------

function PdfSlot({
  ownerId,
  reportId,
  placeholder,
  datasource,
  onChange,
  onLocate,
}: {
  ownerId: string;
  reportId: string;
  placeholder: ReportPlaceholder;
  datasource: Datasource | undefined;
  onChange: () => void;
  onLocate: (key: string) => void;
}) {
  const toast = useToast();
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);

  const isDir = placeholder.type === 'pdfdir';
  const basePath = `${ownerId}/${reportId}/${placeholder.key}`;
  const [files, setFiles] = useState<string[]>([]);

  useEffect(() => {
    void refresh();
  }, [datasource?.storage_path]);

  async function refresh() {
    if (!datasource?.storage_path) {
      setFiles([]);
      return;
    }
    if (isDir) {
      const { data } = await supabase.storage.from('inputs').list(datasource.storage_path);
      setFiles((data ?? []).filter((f) => !f.name.startsWith('.')).map((f) => f.name).sort());
    } else {
      setFiles([datasource.storage_path.split('/').pop() ?? '']);
    }
  }

  async function onSelected(list: FileList | null) {
    if (!list || list.length === 0) return;
    setBusy(true);
    try {
      if (isDir) {
        // upload tous les pdfs dans basePath/
        for (const file of Array.from(list)) {
          if (!file.name.toLowerCase().endsWith('.pdf')) continue;
          const path = `${basePath}/${file.name}`;
          const { error } = await supabase.storage
            .from('inputs')
            .upload(path, file, { upsert: true, contentType: 'application/pdf' });
          if (error) throw error;
        }
        await upsertDatasource(basePath);
      } else {
        const file = list[0];
        if (!file.name.toLowerCase().endsWith('.pdf')) {
          throw new Error('Le fichier doit être un .pdf');
        }
        const path = `${basePath}.pdf`;
        const { error } = await supabase.storage
          .from('inputs')
          .upload(path, file, { upsert: true, contentType: 'application/pdf' });
        if (error) throw error;
        await upsertDatasource(path);
      }
      toast.push('success', 'PDF(s) uploadé(s).');
      onChange();
    } catch (e) {
      toast.push('error', (e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function upsertDatasource(storagePath: string) {
    if (datasource) {
      const { error } = await supabase
        .from('datasources')
        .update({ storage_path: storagePath })
        .eq('id', datasource.id);
      if (error) throw error;
    } else {
      const { error } = await supabase.from('datasources').insert({
        report_id: reportId,
        key: placeholder.key,
        kind: isDir ? 'pdfdir' : 'pdf',
        storage_path: storagePath,
      });
      if (error) throw error;
    }
  }

  return (
    <div className="rounded-lg border border-line p-3 flex flex-col sm:flex-row gap-3 sm:items-center">
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-1">
          <span className="badge border-line text-muted">{TYPE_LABEL[placeholder.type]}</span>
          <span className="font-mono text-sm truncate">{placeholder.key}</span>
          <button
            type="button"
            onClick={() => onLocate(placeholder.key)}
            className="text-muted hover:text-accent p-1 -m-1"
            title="Localiser dans le document"
            aria-label="Localiser dans le document"
          >
            <Search size={14} />
          </button>
        </div>
        {files.length > 0 ? (
          <div className="text-xs text-muted truncate">
            {files.length === 1 ? files[0] : `${files.length} fichiers : ${files.join(', ')}`}
          </div>
        ) : (
          <div className="text-xs text-muted">Aucun fichier.</div>
        )}
      </div>
      <input
        ref={inputRef}
        type="file"
        accept="application/pdf"
        multiple={isDir}
        className="hidden"
        onChange={(e) => onSelected(e.target.files)}
      />
      <button
        className="btn-secondary"
        onClick={() => inputRef.current?.click()}
        disabled={busy}
      >
        <Upload size={16} />
        {isDir ? 'Uploader des PDFs' : 'Uploader un PDF'}
      </button>
    </div>
  );
}
