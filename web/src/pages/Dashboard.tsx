import type { ReactNode } from 'react';
import { rg } from '../lib/theme';
import { AppBar } from '../components/AppBar';
import { NavRail } from '../components/NavRail';
import { Icons } from '../components/ui/icons';
import { Btn, Pill, Progress } from '../components/ui/primitives';

// ── Carte d'un template récemment édité ──────────────────────────────────────
function TemplateCard({
  name,
  type,
  instances,
  lastUsed,
  blocks,
  completion,
  status,
}: {
  name: string;
  type: string;
  instances: number;
  lastUsed: string;
  blocks: number;
  completion: number;
  status?: 'Publié' | 'Brouillon';
}) {
  return (
    <div
      style={{
        background: rg.surface,
        border: `1px solid ${rg.border}`,
        borderRadius: 10,
        padding: 16,
        display: 'flex',
        flexDirection: 'column',
        gap: 12,
        minHeight: 168,
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
          <span style={{ color: rg.ink, fontFamily: rg.mono, fontWeight: 500 }}>{blocks}</span>{' '}
          blocs
        </div>
        <div>
          <span style={{ color: rg.ink, fontFamily: rg.mono, fontWeight: 500 }}>{instances}</span>{' '}
          instances
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
            <Btn variant="ghost" icon={<Icons.upload s={14} />}>
              Importer DOCX
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
                14 templates · 6 sources de données connectées
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
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(4, 1fr)',
                gap: 12,
              }}
            >
              <TemplateCard
                name="Rapport d'expertise immobilière"
                type="Évaluation · 12 sections"
                blocks={28}
                instances={47}
                completion={100}
                status="Publié"
                lastUsed="il y a 2 h"
              />
              <TemplateCard
                name="Compte-rendu d'intervention"
                type="Maintenance · 6 sections"
                blocks={14}
                instances={128}
                completion={100}
                status="Publié"
                lastUsed="hier"
              />
              <TemplateCard
                name="Audit énergétique DPE"
                type="Diagnostic · 9 sections"
                blocks={22}
                instances={19}
                completion={78}
                status="Brouillon"
                lastUsed="il y a 3 j"
              />
              <TemplateCard
                name="Devis travaux"
                type="Commercial · 4 sections"
                blocks={9}
                instances={64}
                completion={100}
                status="Publié"
                lastUsed="il y a 1 sem."
              />
            </div>
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
