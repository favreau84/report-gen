import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { rg } from '../lib/theme';
import { supabase, type Template } from '../lib/supabase';
import { useAuth } from '../lib/auth';
import { useToast } from '../lib/toast';
import { AppBar } from '../components/AppBar';
import { Icons } from '../components/ui/icons';
import { Pill, Btn } from '../components/ui/primitives';
import { ConfigSection, FormLabel, FormSelect, FormCheck } from '../components/ui/form';
import {
  WSShellFrame,
  WSSidebar,
  FacetHeader,
  WSInspector,
  WSPdfPanel,
} from '../components/workspace/TemplateWorkspace';
import {
  detectTags,
  downloadTemplateDocx,
  type DetectionResult,
  type TagConvention,
} from '../lib/detectTags';
import { uploadTemplateDocx, formatBytes, isDocx } from '../lib/templates';
import { parseDocx, getTemplatePreviewPdf } from '../lib/worker';

// ── Atomes locaux (design screens-tpl-flow.jsx 332-358) ─────────────────────
function ImportStatCard({
  icon,
  label,
  value,
  sub,
  tone,
}: {
  icon: ReactNode;
  label: string;
  value: string | number;
  sub: string;
  tone?: 'warn';
}) {
  return (
    <div
      style={{
        flex: 1,
        background: rg.surface,
        border: `1px solid ${rg.border}`,
        borderRadius: 8,
        padding: '12px 14px',
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          marginBottom: 6,
          fontSize: 10.5,
          fontWeight: 600,
          letterSpacing: 0.4,
          textTransform: 'uppercase',
          color: rg.inkSubtle,
        }}
      >
        {icon}
        {label}
      </div>
      <div
        style={{
          fontFamily: rg.serif,
          fontSize: 24,
          fontWeight: 600,
          color: rg.ink,
          letterSpacing: -0.3,
        }}
      >
        {value}
      </div>
      <div style={{ fontSize: 11, color: tone === 'warn' ? rg.warn : rg.inkSubtle, marginTop: 2 }}>
        {sub}
      </div>
    </div>
  );
}

type LogTone = 'info' | 'warn' | 'ok' | 'danger';
function ParseLogRow({ tone = 'info', label, hint }: { tone?: LogTone; label: string; hint?: string }) {
  const c: Record<LogTone, string> = {
    info: rg.inkMuted,
    warn: rg.warn,
    ok: rg.ok,
    danger: rg.danger,
  };
  const ic: Record<LogTone, ReactNode> = {
    info: <Icons.bolt s={11} />,
    warn: <Icons.edit s={11} />,
    ok: <Icons.check s={11} sw={2.5} />,
    danger: <Icons.close s={11} />,
  };
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'flex-start',
        gap: 9,
        padding: '8px 12px',
        borderBottom: `1px solid ${rg.border}`,
      }}
    >
      <div style={{ color: c[tone], marginTop: 2 }}>{ic[tone]}</div>
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: 12, color: rg.ink, fontWeight: 500 }}>{label}</div>
        {hint && <div style={{ fontSize: 10.5, color: rg.inkSubtle, marginTop: 1 }}>{hint}</div>}
      </div>
    </div>
  );
}

function fullScreenMessage(msg: string) {
  return (
    <div
      style={{
        height: '100vh',
        background: rg.paper,
        color: rg.inkMuted,
        fontFamily: rg.sans,
        display: 'grid',
        placeItems: 'center',
        fontSize: 14,
      }}
    >
      {msg}
    </div>
  );
}

export function TemplateDocumentPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const toast = useToast();

  const [template, setTemplate] = useState<Template | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [detection, setDetection] = useState<DetectionResult | null>(null);
  const [detecting, setDetecting] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [analyzed, setAnalyzed] = useState(false);
  const [workerBanner, setWorkerBanner] = useState<string | null>(null);

  const [pdfOpen, setPdfOpen] = useState(true);
  const [pdfWidth, setPdfWidth] = useState(440);
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  const [pdfLoading, setPdfLoading] = useState(false);
  const [pdfError, setPdfError] = useState<string | null>(null);

  const [conv, setConv] = useState<TagConvention>('jinja');
  const [prefix, setPrefix] = useState('li_');
  const [prefixDraft, setPrefixDraft] = useState('li_');
  const [suggested, setSuggested] = useState<string[]>([]);

  const replaceInputRef = useRef<HTMLInputElement | null>(null);
  const docxBufRef = useRef<{ path: string; buf: ArrayBuffer } | null>(null);

  const loadTemplate = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    const { data, error } = await supabase
      .from('templates')
      .select('*')
      .eq('id', id)
      .single();
    setLoading(false);
    if (error || !data) {
      setLoadError(
        error?.message ??
          'Template introuvable. La migration 0005_templates.sql est-elle appliquée ?',
      );
      return;
    }
    setTemplate(data as Template);
  }, [id]);

  const ensureDocxBuf = useCallback(async (path: string): Promise<ArrayBuffer> => {
    if (docxBufRef.current?.path === path) return docxBufRef.current.buf;
    const buf = await downloadTemplateDocx(path);
    docxBufRef.current = { path, buf };
    return buf;
  }, []);

  const runDetection = useCallback(
    async (tpl: Template, convention: TagConvention, tagPrefix: string) => {
      if (!tpl.docx_path) return;
      setDetecting(true);
      setAnalyzed(false);
      try {
        const buf = await ensureDocxBuf(tpl.docx_path);
        const result = await detectTags(buf, { convention, prefix: tagPrefix });
        setDetection(result);
        setSuggested(result.suggestedPrefixes);
        // Persiste la détection cliente (best-effort : si la table n'existe
        // pas encore, on garde l'affichage et on prévient l'utilisateur).
        try {
          await supabase.from('template_placeholders').delete().eq('template_id', tpl.id);
          if (result.placeholders.length > 0) {
            const { error: insErr } = await supabase.from('template_placeholders').insert(
              result.placeholders.map((p) => ({
                template_id: tpl.id,
                key: p.key,
                type: p.type,
                required: p.required,
                section: p.section,
                context: p.context,
                position: p.position,
                detected_by: 'client',
              })),
            );
            if (insErr) throw insErr;
          }
          toast.push('success', `${result.placeholders.length} balise(s) détectée(s).`);
        } catch (persistErr) {
          toast.push(
            'error',
            `Détection OK mais persistance impossible : ${(persistErr as Error).message}`,
          );
        }
      } catch (e) {
        toast.push('error', `Détection impossible : ${(e as Error).message}`);
      } finally {
        setDetecting(false);
      }
    },
    [toast, ensureDocxBuf],
  );

  const applyTagSettings = useCallback(
    async (nextConv: TagConvention, nextPrefix: string) => {
      if (!template) return;
      setConv(nextConv);
      setPrefix(nextPrefix);
      setPrefixDraft(nextPrefix);
      try {
        const { error } = await supabase
          .from('templates')
          .update({ tag_convention: nextConv, tag_prefix: nextPrefix })
          .eq('id', template.id);
        if (error) throw error;
      } catch (e) {
        toast.push(
          'error',
          `Réglages non enregistrés (migration 0006 appliquée ?) : ${(e as Error).message}`,
        );
      }
      await runDetection(template, nextConv, nextPrefix);
    },
    [template, runDetection, toast],
  );

  useEffect(() => {
    void loadTemplate();
  }, [loadTemplate]);

  const convertPdf = useCallback(async (tpl: Template) => {
    if (!tpl.docx_path) return;
    setPdfLoading(true);
    setPdfError(null);
    try {
      const res = await getTemplatePreviewPdf(tpl.id, true);
      setPdfUrl(res.signed_url);
    } catch (e) {
      const msg = (e as Error).message;
      setPdfUrl(null);
      setPdfError(
        /LibreOffice/i.test(msg)
          ? "LibreOffice n'est pas installé sur le worker — conversion DOCX → PDF indisponible."
          : /worker|Failed to fetch|NetworkError|Non authentifié/i.test(msg)
            ? 'Worker injoignable. Démarre le worker (port 8080) puis relance la conversion.'
            : msg,
      );
    } finally {
      setPdfLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!template) return;
    const c = (template.tag_convention ?? 'jinja') as TagConvention;
    const p = template.tag_prefix ?? 'li_';
    setConv(c);
    setPrefix(p);
    setPrefixDraft(p);
    if (template.docx_path) {
      void runDetection(template, c, p);
      void convertPdf(template);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [template?.id, template?.docx_path]);

  async function onAnalyzeServer() {
    if (!template) return;
    setAnalyzing(true);
    setWorkerBanner(null);
    try {
      await parseDocx(template.id);
      setAnalyzed(true);
      toast.push('success', 'Analyse serveur terminée.');
      await loadTemplate();
    } catch (e) {
      setWorkerBanner(
        `Analyse serveur indisponible — détection préliminaire conservée. (${(e as Error).message})`,
      );
      toast.push('error', "L'analyse serveur (worker) a échoué.");
    } finally {
      setAnalyzing(false);
    }
  }

  async function onDownload() {
    if (!template?.docx_path) return;
    const { data, error } = await supabase.storage
      .from('templates')
      .createSignedUrl(template.docx_path, 120);
    if (error || !data) {
      toast.push('error', error?.message ?? 'Lien de téléchargement indisponible.');
      return;
    }
    window.open(data.signedUrl, '_blank', 'noopener');
  }

  async function onReplaceFile(file: File | null) {
    if (!file || !template || !user) return;
    if (!isDocx(file)) {
      toast.push('error', 'Seuls les fichiers .docx sont acceptés.');
      return;
    }
    try {
      const updated = await uploadTemplateDocx(user.id, template.id, file);
      toast.push('success', 'DOCX remplacé.');
      docxBufRef.current = null; // le chemin est identique : invalider le cache
      setTemplate(updated);
      await runDetection(updated, conv, prefix);
      void convertPdf(updated);
    } catch (e) {
      toast.push('error', (e as Error).message);
    }
  }

  if (loading) return fullScreenMessage('Chargement du template…');
  if (loadError) return fullScreenMessage(loadError);
  if (!template) return fullScreenMessage('Template introuvable.');

  const c = detection?.counts;
  const balises = c ? c.field + c.loop + c.block : 0;
  const pdfInserts = c ? c.pdf + c.pdfdir + c.annex : 0;
  const warns = detection?.warnings ?? [];

  const statusPill = detecting ? (
    <Pill tone="muted">Détection…</Pill>
  ) : analyzed ? (
    <Pill tone="ok" icon={<Icons.check s={9} sw={2.5} />}>
      Parsé
    </Pill>
  ) : detection ? (
    <Pill tone="warn">Détection préliminaire</Pill>
  ) : null;

  const uploadedAt = template.docx_uploaded_at
    ? new Date(template.docx_uploaded_at).toLocaleString('fr-FR', {
        dateStyle: 'short',
        timeStyle: 'short',
      })
    : '—';

  return (
    <>
      <input
        ref={replaceInputRef}
        type="file"
        accept=".docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
        style={{ display: 'none' }}
        onChange={(e) => {
          void onReplaceFile(e.target.files?.[0] ?? null);
          e.target.value = '';
        }}
      />
      <WSShellFrame
        topBar={
          <AppBar
            crumbs={['Templates', template.name]}
            right={
              <>
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 6,
                    fontSize: 11,
                    color: rg.inkSubtle,
                  }}
                >
                  <div
                    style={{ width: 6, height: 6, borderRadius: '50%', background: rg.ok }}
                  />
                  Brouillon
                </div>
                <Btn
                  variant="ghost"
                  size="sm"
                  icon={<Icons.eye s={13} />}
                  onClick={() => setPdfOpen((o) => !o)}
                >
                  Aperçu
                </Btn>
                <Btn variant="secondary" size="sm" icon={<Icons.download s={13} />}>
                  Exporter
                </Btn>
              </>
            }
          />
        }
        sidebar={
          <WSSidebar
            active="document"
            templateName={template.name}
            versionTag={template.version_tag}
            placeholderCount={balises + pdfInserts}
            onAllTemplates={() => navigate('/dashboard')}
          />
        }
        header={
          <FacetHeader
            icon={<Icons.upload s={16} />}
            label="Document source"
            title={template.docx_filename ?? template.name}
            hint="Le fichier Word fait foi : balises Jinja2, styles de titres et marqueurs @@pdf sont détectés."
            status={statusPill}
            tools={
              <>
                <Btn variant="ghost" size="sm" icon={<Icons.download s={13} />} onClick={onDownload}>
                  Télécharger
                </Btn>
                <Btn variant="ghost" size="sm" icon={<Icons.history s={13} />}>
                  Versions DOCX
                </Btn>
                <Btn
                  variant="secondary"
                  size="sm"
                  icon={<Icons.upload s={13} />}
                  onClick={() => replaceInputRef.current?.click()}
                >
                  Remplacer le DOCX
                </Btn>
                <Btn
                  variant="primary"
                  size="sm"
                  icon={<Icons.bolt s={13} />}
                  onClick={onAnalyzeServer}
                >
                  {analyzing ? 'Analyse…' : 'Analyser (serveur)'}
                </Btn>
              </>
            }
          />
        }
      >
        {/* Centre */}
        <div
          style={{
            flex: 1,
            overflow: 'auto',
            background: rg.surfaceAlt,
            padding: '18px 22px',
            display: 'flex',
            flexDirection: 'column',
            gap: 14,
          }}
        >
          {workerBanner && (
            <div
              style={{
                background: rg.warnSoft,
                border: `1px solid ${rg.warn}`,
                color: '#7B4F0C',
                borderRadius: 8,
                padding: '10px 14px',
                fontSize: 12,
                display: 'flex',
                alignItems: 'center',
                gap: 8,
              }}
            >
              <Icons.bolt s={13} />
              {workerBanner}
            </div>
          )}

          {/* Carte fichier */}
          <div
            style={{
              background: rg.surface,
              border: `1px solid ${rg.border}`,
              borderRadius: 10,
              padding: '14px 16px',
              display: 'flex',
              alignItems: 'center',
              gap: 14,
            }}
          >
            <div
              style={{
                width: 44,
                height: 56,
                borderRadius: 5,
                background: rg.surfaceSunk,
                border: `1px solid ${rg.border}`,
                display: 'grid',
                placeItems: 'center',
                color: rg.accent,
                flexShrink: 0,
              }}
            >
              <Icons.doc s={22} />
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <div style={{ fontSize: 14, fontWeight: 600, color: rg.ink }}>
                  {template.docx_filename ?? '—'}
                </div>
                <Pill tone="muted">DOCX</Pill>
                <span style={{ fontFamily: rg.mono, fontSize: 11, color: rg.inkSubtle }}>
                  {formatBytes(template.docx_size_bytes)}
                </span>
              </div>
              <div
                style={{
                  fontSize: 11.5,
                  color: rg.inkSubtle,
                  marginTop: 2,
                  display: 'flex',
                  gap: 10,
                  flexWrap: 'wrap',
                }}
              >
                <span>
                  {template.docx_pages != null ? `${template.docx_pages} pages` : 'Pages : —'}
                </span>
                <span style={{ color: rg.border }}>·</span>
                <span>Importé le {uploadedAt}</span>
                <span style={{ color: rg.border }}>·</span>
                <span>{user?.email ?? '—'}</span>
              </div>
            </div>
          </div>

          {/* Réglages — déplacés sous le header du document */}
          <div
            style={{
              background: rg.surface,
              border: `1px solid ${rg.border}`,
              borderRadius: 10,
              overflow: 'hidden',
              maxWidth: 760,
            }}
          >
            <div
              style={{
                padding: '12px 14px',
                borderBottom: `1px solid ${rg.border}`,
                display: 'flex',
                alignItems: 'center',
                gap: 10,
              }}
            >
              <div
                style={{
                  width: 26,
                  height: 26,
                  borderRadius: 6,
                  background: rg.accentSoft,
                  color: rg.accentInk,
                  display: 'grid',
                  placeItems: 'center',
                }}
              >
                <Icons.bolt s={14} />
              </div>
              <div style={{ flex: 1 }}>
                <div
                  style={{
                    fontSize: 10,
                    color: rg.inkSubtle,
                    fontFamily: rg.mono,
                    fontWeight: 500,
                  }}
                >
                  RÉGLAGES
                </div>
                <div style={{ fontWeight: 600, fontSize: 13, color: rg.ink }}>
                  Parsing du DOCX
                </div>
              </div>
            </div>
            <ConfigSection title="Convention des balises">
              <FormLabel>Convention</FormLabel>
              <select
                value={conv}
                onChange={(e) =>
                  void applyTagSettings(e.target.value as TagConvention, prefix)
                }
                style={{
                  width: '100%',
                  padding: '7px 10px',
                  background: rg.surface,
                  border: `1px solid ${rg.border}`,
                  borderRadius: 5,
                  fontSize: 12,
                  color: rg.ink,
                  fontFamily: rg.sans,
                }}
              >
                <option value="jinja">Jinja2 — {'{{ champ }}'} / {'{% for %}'}</option>
                <option value="li_prefix">Préfixe configurable (ex. li_)</option>
              </select>
              <div style={{ height: 10 }} />
              <FormLabel hint={conv === 'jinja' ? '· convention Préfixe' : undefined}>
                Préfixe des balises
              </FormLabel>
              <div style={{ display: 'flex', gap: 6 }}>
                <input
                  value={prefixDraft}
                  onChange={(e) => setPrefixDraft(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter')
                      void applyTagSettings('li_prefix', prefixDraft.trim() || 'li_');
                  }}
                  placeholder="li_"
                  style={{
                    flex: 1,
                    minWidth: 0,
                    padding: '7px 10px',
                    background: rg.surface,
                    border: `1px solid ${rg.border}`,
                    borderRadius: 5,
                    fontSize: 12,
                    color: rg.ink,
                    fontFamily: rg.mono,
                  }}
                />
                <Btn
                  variant="secondary"
                  size="sm"
                  onClick={() =>
                    void applyTagSettings('li_prefix', prefixDraft.trim() || 'li_')
                  }
                >
                  Appliquer
                </Btn>
              </div>
              {suggested.length > 0 && (
                <div
                  style={{
                    marginTop: 8,
                    display: 'flex',
                    flexWrap: 'wrap',
                    gap: 6,
                    alignItems: 'center',
                  }}
                >
                  <span style={{ fontSize: 10.5, color: rg.inkSubtle }}>
                    Préfixes détectés :
                  </span>
                  {suggested.map((s) => {
                    const active = conv === 'li_prefix' && s === prefix;
                    return (
                      <button
                        key={s}
                        type="button"
                        onClick={() => void applyTagSettings('li_prefix', s)}
                        style={{
                          fontFamily: rg.mono,
                          fontSize: 11,
                          padding: '2px 7px',
                          borderRadius: 999,
                          border: `1px solid ${active ? rg.accent : rg.border}`,
                          background: active ? rg.accentSoft : rg.surface,
                          color: active ? rg.accentInk : rg.inkMuted,
                          cursor: 'pointer',
                        }}
                      >
                        {s}
                      </button>
                    );
                  })}
                </div>
              )}
            </ConfigSection>
            <ConfigSection title="Détection de structure">
              <FormCheck on label="Sections via styles Heading" />
              <FormCheck on label="Marqueurs @@pdf, @@pdfdir, @@annex" />
              <FormCheck
                label="Promouvoir gras + courts en titres"
                hint="Quand les styles Word ne sont pas appliqués"
              />
            </ConfigSection>
            <ConfigSection title="Conversion DOCX → PDF">
              <FormSelect value="LibreOffice headless" />
              <div style={{ height: 8 }} />
              <FormLabel>Re-parsage</FormLabel>
              <FormSelect value="À chaque sauvegarde" />
            </ConfigSection>
          </div>
        </div>

        {/* Panneau droit · stats & journal de détection */}
        <WSInspector>
          <div
            style={{
              padding: '12px 14px',
              borderBottom: `1px solid ${rg.border}`,
              background: rg.surface,
              display: 'flex',
              alignItems: 'center',
              gap: 10,
            }}
          >
            <div
              style={{
                width: 26,
                height: 26,
                borderRadius: 6,
                background: rg.accentSoft,
                color: rg.accentInk,
                display: 'grid',
                placeItems: 'center',
              }}
            >
              <Icons.tag s={14} />
            </div>
            <div style={{ flex: 1 }}>
              <div
                style={{ fontSize: 10, color: rg.inkSubtle, fontFamily: rg.mono, fontWeight: 500 }}
              >
                DÉTECTION
              </div>
              <div style={{ fontWeight: 600, fontSize: 13, color: rg.ink }}>
                Balises &amp; structure
              </div>
            </div>
            <Btn
              variant="ghost"
              size="sm"
              icon={<Icons.bolt s={12} />}
              onClick={() => void runDetection(template, conv, prefix)}
            >
              Re-détecter
            </Btn>
          </div>
          <div
            style={{
              flex: 1,
              overflow: 'auto',
              padding: 14,
              display: 'flex',
              flexDirection: 'column',
              gap: 10,
            }}
          >
            <ImportStatCard
              icon={<Icons.tag s={12} />}
              label="Balises"
              value={detecting ? '…' : balises}
              sub={
                c
                  ? `${c.field} directes · ${c.loop + c.block} boucles/conditions`
                  : 'en attente de détection'
              }
            />
            <ImportStatCard
              icon={<Icons.layers s={12} />}
              label="Sections (H1-H3)"
              value={detecting ? '…' : (detection?.sectionCount ?? 0)}
              sub="titres détectés côté client"
            />
            <ImportStatCard
              icon={<Icons.pdf s={12} />}
              label="Insertions PDF"
              value={detecting ? '…' : pdfInserts}
              sub="@@pdf · @@pdfdir · @@annex"
            />
            <ImportStatCard
              icon={<Icons.edit s={12} />}
              label="Avertissements"
              value={detecting ? '…' : warns.length}
              sub={warns.length ? 'à corriger avant publication' : 'aucun'}
              tone={warns.length ? 'warn' : undefined}
            />
            <div
              style={{
                background: rg.surface,
                border: `1px solid ${rg.border}`,
                borderRadius: 10,
                overflow: 'hidden',
              }}
            >
              <div
                style={{
                  padding: '11px 14px',
                  borderBottom: `1px solid ${rg.border}`,
                  fontSize: 13,
                  fontWeight: 600,
                  color: rg.ink,
                }}
              >
                Journal de détection
              </div>
              {detecting && <ParseLogRow tone="info" label="Détection en cours…" />}
              {!detecting && detection && (
                <>
                  <ParseLogRow
                    tone="ok"
                    label={`${detection.sectionCount} section(s) détectée(s) (titres Word)`}
                    hint="Comptage client via styles Heading. Le détail viendra avec l'analyse serveur."
                  />
                  <ParseLogRow
                    tone="ok"
                    label={`${balises} balise(s) Jinja2 reconnues`}
                    hint={`{{ … }} (${c?.field ?? 0}), {% for %} (${c?.loop ?? 0}), {% if %} (${c?.block ?? 0}).`}
                  />
                  {pdfInserts > 0 && (
                    <ParseLogRow
                      tone="info"
                      label={`${pdfInserts} insertion(s) PDF`}
                      hint="@@pdf · @@pdfdir · @@annex"
                    />
                  )}
                  {warns.map((w, i) => (
                    <ParseLogRow
                      key={i}
                      tone="warn"
                      label={w}
                      hint="Place le marqueur sur sa propre ligne."
                    />
                  ))}
                  {!analyzed && (
                    <ParseLogRow
                      tone="info"
                      label="Analyse serveur non lancée"
                      hint="« Analyser (serveur) » pour l'analyse autoritative."
                    />
                  )}
                </>
              )}
              {!detecting && !detection && (
                <ParseLogRow tone="info" label="Aucun DOCX analysé pour l'instant." />
              )}
            </div>
          </div>
        </WSInspector>

        <WSPdfPanel
          open={pdfOpen}
          onToggle={() => setPdfOpen((o) => !o)}
          width={pdfWidth}
          onResize={setPdfWidth}
          title={`${template.docx_filename ?? template.name} → PDF`}
          subtitle={pdfLoading ? 'conversion…' : pdfUrl ? 'post-conversion' : 'non converti'}
          headerRight={
            <Btn
              variant="ghost"
              size="sm"
              icon={<Icons.bolt s={12} />}
              onClick={() => void convertPdf(template)}
            >
              {pdfLoading ? '…' : 'Rafraîchir'}
            </Btn>
          }
        >
          {pdfLoading ? (
            <div
              style={{
                flex: 1,
                display: 'grid',
                placeItems: 'center',
                color: rg.inkSubtle,
                fontSize: 12,
              }}
            >
              Conversion DOCX → PDF en cours…
            </div>
          ) : pdfError ? (
            <div
              style={{
                flex: 1,
                display: 'flex',
                flexDirection: 'column',
                gap: 10,
                alignItems: 'center',
                justifyContent: 'center',
                textAlign: 'center',
                color: rg.inkSubtle,
                fontSize: 12,
                padding: 20,
              }}
            >
              <Icons.pdf s={26} style={{ color: rg.borderStrong }} />
              <div style={{ maxWidth: 260, lineHeight: 1.5 }}>{pdfError}</div>
              <Btn
                variant="secondary"
                size="sm"
                icon={<Icons.bolt s={12} />}
                onClick={() => void convertPdf(template)}
              >
                Relancer le traitement
              </Btn>
            </div>
          ) : pdfUrl ? (
            <iframe
              src={pdfUrl}
              title="Aperçu PDF du template"
              style={{ flex: 1, width: '100%', height: '100%', border: 0, background: '#fff' }}
            />
          ) : (
            <div
              style={{
                flex: 1,
                display: 'flex',
                flexDirection: 'column',
                gap: 10,
                alignItems: 'center',
                justifyContent: 'center',
                color: rg.inkSubtle,
                fontSize: 12,
                padding: 20,
              }}
            >
              <Icons.pdf s={26} style={{ color: rg.borderStrong }} />
              <Btn
                variant="secondary"
                size="sm"
                icon={<Icons.bolt s={12} />}
                onClick={() => void convertPdf(template)}
              >
                Convertir le DOCX en PDF
              </Btn>
            </div>
          )}
        </WSPdfPanel>
      </WSShellFrame>
    </>
  );
}
