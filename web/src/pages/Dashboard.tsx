import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { rg } from '../lib/theme';
import { AppBar } from '../components/AppBar';
import { NavRail } from '../components/NavRail';
import { Icons } from '../components/ui/icons';
import { Btn, Pill, Progress } from '../components/ui/primitives';
import { useAuth } from '../lib/auth';
import { useToast } from '../lib/toast';
import { supabase, type Template } from '../lib/supabase';
import { createTemplate, uploadTemplateDocx, isDocx, baseName } from '../lib/templates';

type DashTemplate = Template & { placeholderCount: number };

function ago(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  const min = Math.round(ms / 60000);
  if (min < 1) return "à l'instant";
  if (min < 60) return `il y a ${min} min`;
  const h = Math.round(min / 60);
  if (h < 24) return `il y a ${h} h`;
  const j = Math.round(h / 24);
  if (j < 7) return `il y a ${j} j`;
  return `il y a ${Math.round(j / 7)} sem.`;
}

function completionOf(t: Template, ph: number): number {
  if (!t.docx_path) return 0;
  if (t.status === 'ready' || t.status === 'done') return 100;
  return ph > 0 ? 60 : 25;
}

// ── Carte d'un template récemment édité ──────────────────────────────────────
function TemplateCard({
  name,
  type,
  docs,
  lastUsed,
  balises,
  completion,
  status,
  onClick,
}: {
  name: string;
  type: string;
  docs: number;
  lastUsed: string;
  balises: number;
  completion: number;
  status?: 'Publié' | 'Brouillon';
  onClick?: () => void;
}) {
  return (
    <div
      onClick={onClick}
      style={{
        background: rg.surface,
        border: `1px solid ${rg.border}`,
        borderRadius: 10,
        padding: 16,
        display: 'flex',
        flexDirection: 'column',
        gap: 12,
        minHeight: 168,
        cursor: onClick ? 'pointer' : 'default',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
        <div
          style={{
            width: 36,
            height: 44,
            borderRadius: 4,
            background: rg.surfaceSunk,
            border: `1px solid ${rg.border}`,
            display: 'grid',
            placeItems: 'center',
            color: rg.inkMuted,
            flexShrink: 0,
          }}
        >
          <Icons.doc s={16} />
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div
            style={{
              fontWeight: 600,
              fontSize: 14,
              color: rg.ink,
              marginBottom: 3,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >
            {name}
          </div>
          <div style={{ fontSize: 11.5, color: rg.inkSubtle }}>{type}</div>
        </div>
        {status && (
          <Pill tone={status === 'Brouillon' ? 'warn' : 'ok'}>{status}</Pill>
        )}
      </div>
      <div style={{ display: 'flex', gap: 12, fontSize: 11.5, color: rg.inkMuted }}>
        <div>
          <span style={{ color: rg.ink, fontFamily: rg.mono, fontWeight: 500 }}>{balises}</span>{' '}
          balises
        </div>
        <div>
          <span style={{ color: rg.ink, fontFamily: rg.mono, fontWeight: 500 }}>{docs}</span>{' '}
          documents
        </div>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <Progress value={completion} height={3} />
        <div
          style={{
            fontSize: 10.5,
            color: rg.inkSubtle,
            fontFamily: rg.mono,
            width: 28,
            textAlign: 'right',
          }}
        >
          {completion}%
        </div>
      </div>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          paddingTop: 8,
          borderTop: `1px solid ${rg.border}`,
          fontSize: 11,
          color: rg.inkSubtle,
        }}
      >
        <span>Dernière édition · {lastUsed}</span>
        <Icons.chevR s={12} />
      </div>
    </div>
  );
}

// ── Ligne d'une instance en cours ────────────────────────────────────────────
const INSTANCE_GRID = '24px 1.6fr 1.2fr 1fr 130px 28px';

function InstanceRow({
  name,
  template,
  owner,
  progress,
  tone,
}: {
  name: string;
  template: string;
  owner: string;
  progress: number;
  tone: 'ok' | 'warn';
}) {
  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: INSTANCE_GRID,
        alignItems: 'center',
        gap: 14,
        padding: '10px 12px',
        borderBottom: `1px solid ${rg.border}`,
        fontSize: 12.5,
      }}
    >
      <Icons.doc s={14} style={{ color: rg.inkSubtle }} />
      <div style={{ color: rg.ink, fontWeight: 500 }}>{name}</div>
      <div style={{ color: rg.inkMuted }}>{template}</div>
      <div style={{ color: rg.inkMuted, display: 'flex', alignItems: 'center', gap: 6 }}>
        <div
          style={{
            width: 18,
            height: 18,
            borderRadius: '50%',
            background: '#E0D6C2',
            fontSize: 10,
            display: 'grid',
            placeItems: 'center',
            color: rg.ink,
            fontWeight: 600,
          }}
        >
          {owner
            .split(' ')
            .map((p) => p[0])
            .join('')}
        </div>
        {owner}
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <Progress value={progress} tone={tone} height={3} width={70} />
        <span style={{ fontFamily: rg.mono, fontSize: 11, color: rg.inkMuted, width: 36 }}>
          {progress === 100 ? 'Prêt' : `${progress}%`}
        </span>
      </div>
      <Icons.more s={14} style={{ color: rg.inkSubtle, justifySelf: 'end' }} />
    </div>
  );
}

function SectionLabel({ children }: { children: ReactNode }) {
  return (
    <div
      style={{
        fontSize: 11,
        fontWeight: 600,
        letterSpacing: 0.6,
        textTransform: 'uppercase',
        color: rg.inkSubtle,
      }}
    >
      {children}
    </div>
  );
}

export function DashboardPage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const toast = useToast();
  const importInputRef = useRef<HTMLInputElement | null>(null);
  const [importing, setImporting] = useState(false);
  const [templates, setTemplates] = useState<DashTemplate[] | null>(null);
  const [tplError, setTplError] = useState<string | null>(null);

  const loadTemplates = useCallback(async () => {
    const { data, error } = await supabase
      .from('templates')
      .select('*')
      .order('updated_at', { ascending: false });
    if (error) {
      setTplError(error.message);
      setTemplates([]);
      return;
    }
    const list = (data ?? []) as Template[];
    const counts: Record<string, number> = {};
    if (list.length > 0) {
      const { data: ph } = await supabase
        .from('template_placeholders')
        .select('template_id')
        .in(
          'template_id',
          list.map((t) => t.id),
        );
      for (const row of (ph ?? []) as { template_id: string }[]) {
        counts[row.template_id] = (counts[row.template_id] ?? 0) + 1;
      }
    }
    setTplError(null);
    setTemplates(list.map((t) => ({ ...t, placeholderCount: counts[t.id] ?? 0 })));
  }, []);

  useEffect(() => {
    void loadTemplates();
  }, [loadTemplates]);

  async function handleImport(file: File | null) {
    if (!file || !user) return;
    if (!isDocx(file)) {
      toast.push('error', 'Seuls les fichiers .docx sont acceptés.');
      return;
    }
    setImporting(true);
    try {
      const tpl = await createTemplate(user.id, baseName(file));
      await uploadTemplateDocx(user.id, tpl.id, file);
      toast.push('success', 'Template créé.');
      navigate(`/templates/${tpl.id}/document`);
    } catch (e) {
      toast.push('error', (e as Error).message);
      setImporting(false);
    }
  }

  return (
    <div
      style={{
        height: '100vh',
        background: rg.surface,
        color: rg.ink,
        fontFamily: rg.sans,
        fontSize: 13,
        lineHeight: 1.45,
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
      }}
    >
      <input
        ref={importInputRef}
        type="file"
        accept=".docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
        style={{ display: 'none' }}
        onChange={(e) => {
          void handleImport(e.target.files?.[0] ?? null);
          e.target.value = '';
        }}
      />
      <AppBar
        crumbs={['Atelier']}
        right={
          <>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                padding: '5px 10px',
                background: rg.surfaceSunk,
                borderRadius: 6,
                fontSize: 12,
                color: rg.inkMuted,
                width: 220,
              }}
            >
              <Icons.search s={13} />
              Rechercher templates, instances…
              <span
                style={{
                  marginLeft: 'auto',
                  fontFamily: rg.mono,
                  fontSize: 10,
                  color: rg.inkSubtle,
                  background: '#E7E2D7',
                  padding: '1px 5px',
                  borderRadius: 3,
                }}
              >
                ⌘K
              </span>
            </div>
            <Btn
              variant="ghost"
              icon={<Icons.upload s={14} />}
              onClick={() => importInputRef.current?.click()}
            >
              {importing ? 'Import…' : 'Importer DOCX'}
            </Btn>
            <Btn variant="primary" icon={<Icons.plus s={14} />}>
              Nouveau document
            </Btn>
          </>
        }
      />
      <div style={{ display: 'flex', flex: 1, minHeight: 0 }}>
        <NavRail active="templates" />
        <div
          style={{
            flex: 1,
            padding: '24px 32px',
            overflow: 'auto',
            display: 'flex',
            flexDirection: 'column',
            gap: 22,
          }}
        >
          {/* En-tête de page */}
          <div>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 14, marginBottom: 4 }}>
              <h1
                style={{
                  fontFamily: rg.serif,
                  fontSize: 26,
                  fontWeight: 600,
                  margin: 0,
                  letterSpacing: -0.3,
                  color: rg.ink,
                }}
              >
                Templates
              </h1>
              <span style={{ fontSize: 13, color: rg.inkSubtle }}>
                {templates === null
                  ? 'Chargement…'
                  : `${templates.length} template${templates.length > 1 ? 's' : ''}`}
              </span>
            </div>
            <div style={{ fontSize: 13, color: rg.inkMuted }}>
              Définissez un template DOCX une fois, générez autant de rapports que nécessaire.
            </div>
          </div>

          {/* Grille des templates */}
          <div>
            <div style={{ display: 'flex', alignItems: 'center', marginBottom: 12 }}>
              <SectionLabel>Récemment édités</SectionLabel>
              <div
                style={{
                  marginLeft: 'auto',
                  display: 'flex',
                  gap: 6,
                  alignItems: 'center',
                  fontSize: 12,
                  color: rg.inkMuted,
                }}
              >
                <Btn variant="ghost" size="sm" icon={<Icons.filter s={12} />}>
                  Filtres
                </Btn>
                <span style={{ color: rg.border }}>·</span>
                Trier : Récents
              </div>
            </div>
            {tplError && (
              <div
                style={{
                  background: rg.warnSoft,
                  border: `1px solid ${rg.warn}`,
                  color: '#7B4F0C',
                  borderRadius: 8,
                  padding: '10px 14px',
                  fontSize: 12,
                }}
              >
                Impossible de charger les templates : {tplError} (la migration
                0005_templates.sql est-elle appliquée ?)
              </div>
            )}
            {templates === null && (
              <div style={{ fontSize: 13, color: rg.inkSubtle, padding: '24px 0' }}>
                Chargement des templates…
              </div>
            )}
            {templates !== null && !tplError && templates.length === 0 && (
              <div
                style={{
                  border: `1px dashed ${rg.borderStrong}`,
                  borderRadius: 10,
                  padding: '28px 20px',
                  textAlign: 'center',
                  color: rg.inkSubtle,
                  fontSize: 13,
                }}
              >
                Aucun template pour l'instant. Clique sur{' '}
                <strong style={{ color: rg.ink }}>« Importer DOCX »</strong> en haut à droite
                pour en créer un.
              </div>
            )}
            {templates !== null && templates.length > 0 && (
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(4, 1fr)',
                  gap: 12,
                }}
              >
                {templates.map((t) => {
                  const published = t.status === 'ready' || t.status === 'done';
                  return (
                    <TemplateCard
                      key={t.id}
                      name={t.name}
                      type={
                        t.category ??
                        `${t.docx_filename ?? 'DOCX'} · ${t.version_tag}`
                      }
                      balises={t.placeholderCount}
                      docs={0}
                      completion={completionOf(t, t.placeholderCount)}
                      status={published ? 'Publié' : 'Brouillon'}
                      lastUsed={ago(t.updated_at)}
                      onClick={() => navigate(`/templates/${t.id}/document`)}
                    />
                  );
                })}
              </div>
            )}
          </div>

          {/* Instances en cours */}
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', marginBottom: 12 }}>
              <SectionLabel>Instances en cours</SectionLabel>
              <div style={{ marginLeft: 'auto' }}>
                <Btn variant="ghost" size="sm">
                  Voir tout
                </Btn>
              </div>
            </div>
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
                  display: 'grid',
                  gridTemplateColumns: INSTANCE_GRID,
                  gap: 14,
                  padding: '9px 12px',
                  background: rg.surfaceAlt,
                  borderBottom: `1px solid ${rg.border}`,
                  fontSize: 10.5,
                  fontWeight: 600,
                  letterSpacing: 0.5,
                  textTransform: 'uppercase',
                  color: rg.inkSubtle,
                }}
              >
                <span />
                <span>Document</span>
                <span>Template</span>
                <span>Propriétaire</span>
                <span>Avancement</span>
                <span />
              </div>
              <InstanceRow
                name="EXP-2025-118 · Rue de la Pompe, Paris 16e"
                template="Rapport d'expertise"
                owner="Marc Dubois"
                progress={84}
                tone="warn"
              />
              <InstanceRow
                name="INT-04231 · Chaudière site Levallois"
                template="Compte-rendu d'intervention"
                owner="Anna Roy"
                progress={100}
                tone="ok"
              />
              <InstanceRow
                name="EXP-2025-117 · Villa Roquebrune-Cap-Martin"
                template="Rapport d'expertise"
                owner="Marc Dubois"
                progress={42}
                tone="warn"
              />
              <InstanceRow
                name="DPE-887 · Immeuble Toulouse Capitole"
                template="Audit énergétique DPE"
                owner="Léa Martin"
                progress={12}
                tone="warn"
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
