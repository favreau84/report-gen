import {
  useRef,
  type CSSProperties,
  type MouseEvent as ReactMouseEvent,
  type ReactNode,
} from 'react';
import { rg } from '../../lib/theme';
import { Icons } from '../ui/icons';
import { Pill, Btn } from '../ui/primitives';

// Workspace d'édition d'un template (port du design screens-tpl-flow.jsx).
// Seule la facette « Document » est fonctionnelle ; les autres sont inertes
// (« à venir ») et seront branchées progressivement.

export type FacetId =
  | 'document'
  | 'plan'
  | 'blocks'
  | 'sources'
  | 'example'
  | 'versions'
  | 'permissions'
  | 'log';

function WSGroupLabel({ children }: { children: ReactNode }) {
  return (
    <div
      style={{
        fontSize: 10,
        fontWeight: 600,
        letterSpacing: 0.6,
        textTransform: 'uppercase',
        color: rg.inkSubtle,
        padding: '14px 10px 6px',
      }}
    >
      {children}
    </div>
  );
}

function WSItem({
  icon,
  label,
  active,
  count,
  status,
  disabled,
}: {
  icon: ReactNode;
  label: string;
  active?: boolean;
  count?: number;
  status?: 'ok';
  disabled?: boolean;
}) {
  return (
    <div
      title={disabled ? 'À venir' : undefined}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 9,
        padding: '8px 10px',
        borderRadius: 6,
        cursor: disabled ? 'default' : 'pointer',
        opacity: disabled ? 0.5 : 1,
        background: active ? rg.surface : 'transparent',
        boxShadow: active ? `0 0 0 1px ${rg.border}, 0 1px 2px rgba(0,0,0,0.03)` : 'none',
      }}
    >
      <span
        style={{
          color: active ? rg.accent : rg.inkSubtle,
          flexShrink: 0,
          display: 'inline-flex',
        }}
      >
        {icon}
      </span>
      <span
        style={{
          flex: 1,
          fontSize: 12.5,
          fontWeight: active ? 600 : 500,
          color: active ? rg.ink : rg.inkMuted,
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
        }}
      >
        {label}
      </span>
      {status === 'ok' && <Icons.check s={11} sw={2.5} style={{ color: rg.ok }} />}
      {count != null && (
        <span style={{ fontFamily: rg.mono, fontSize: 10.5, color: rg.inkSubtle }}>{count}</span>
      )}
      {disabled && (
        <span
          style={{
            fontFamily: rg.mono,
            fontSize: 9,
            color: rg.inkSubtle,
            padding: '1px 5px',
            background: rg.surfaceSunk,
            borderRadius: 3,
          }}
        >
          à venir
        </span>
      )}
    </div>
  );
}

export function WSSidebar({
  active,
  templateName,
  versionTag,
  placeholderCount,
  onAllTemplates,
}: {
  active: FacetId;
  templateName: string;
  versionTag: string;
  placeholderCount: number;
  onAllTemplates: () => void;
}) {
  return (
    <div
      style={{
        width: 240,
        flexShrink: 0,
        background: rg.surfaceAlt,
        borderRight: `1px solid ${rg.border}`,
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
      }}
    >
      {/* Identité du template */}
      <div
        style={{
          padding: '14px 14px 12px',
          background: rg.surface,
          borderBottom: `1px solid ${rg.border}`,
        }}
      >
        <button
          type="button"
          onClick={onAllTemplates}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 5,
            color: rg.inkSubtle,
            fontSize: 11,
            marginBottom: 10,
            cursor: 'pointer',
            border: 'none',
            background: 'transparent',
            padding: 0,
            fontFamily: rg.sans,
          }}
        >
          <Icons.chevR s={10} style={{ transform: 'rotate(180deg)' }} />
          Tous les templates
        </button>
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 9 }}>
          <div
            style={{
              width: 32,
              height: 40,
              borderRadius: 4,
              background: rg.surfaceSunk,
              border: `1px solid ${rg.border}`,
              display: 'grid',
              placeItems: 'center',
              color: rg.accent,
              flexShrink: 0,
            }}
          >
            <Icons.doc s={17} />
          </div>
          <div style={{ minWidth: 0, flex: 1 }}>
            <div
              style={{
                fontSize: 13,
                fontWeight: 600,
                color: rg.ink,
                lineHeight: 1.3,
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                display: '-webkit-box',
                WebkitLineClamp: 2,
                WebkitBoxOrient: 'vertical',
              }}
            >
              {templateName}
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 4 }}>
              <Pill tone="warn">{versionTag} · brouillon</Pill>
              <span style={{ fontSize: 10, color: rg.inkSubtle, fontFamily: rg.mono }}>
                {placeholderCount} balises
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Facettes */}
      <div style={{ flex: 1, overflow: 'auto', padding: '6px 10px 12px' }}>
        <WSGroupLabel>Template</WSGroupLabel>
        <WSItem
          icon={<Icons.upload s={14} />}
          label="Document"
          status="ok"
          active={active === 'document'}
        />
        <WSItem icon={<Icons.layers s={14} />} label="Plan & sections" disabled />
        <WSItem icon={<Icons.grid s={14} />} label="Blocs & champs" disabled />
        <WSItem icon={<Icons.source s={14} />} label="Sources connectées" disabled />
        <WSItem icon={<Icons.bolt s={14} />} label="Exemple" disabled />

        <WSGroupLabel>Avancé</WSGroupLabel>
        <WSItem icon={<Icons.history s={14} />} label="Versions" disabled />
        <WSItem icon={<Icons.person s={14} />} label="Permissions" disabled />
        <WSItem icon={<Icons.bolt s={14} />} label="Historique" disabled />
      </div>

      {/* Pied · publication (désactivé cette passe) */}
      <div
        style={{
          padding: '10px 12px',
          background: rg.surface,
          borderTop: `1px solid ${rg.border}`,
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 7,
            fontSize: 11,
            color: rg.inkMuted,
            marginBottom: 8,
          }}
        >
          <Icons.bolt s={11} style={{ color: rg.warn }} />
          <span>Analyse requise avant publication</span>
        </div>
        <Btn
          variant="secondary"
          size="sm"
          icon={<Icons.upload s={11} />}
          style={{ width: '100%', justifyContent: 'center', opacity: 0.55, cursor: 'default' }}
        >
          Publier
        </Btn>
      </div>
    </div>
  );
}

export function FacetHeader({
  icon,
  label,
  title,
  hint,
  status,
  tools,
}: {
  icon: ReactNode;
  label: string;
  title: string;
  hint?: string;
  status?: ReactNode;
  tools?: ReactNode;
}) {
  return (
    <div
      style={{
        padding: '13px 22px',
        borderBottom: `1px solid ${rg.border}`,
        background: rg.surface,
        display: 'flex',
        alignItems: 'center',
        gap: 14,
      }}
    >
      <div
        style={{
          width: 36,
          height: 36,
          borderRadius: 8,
          background: rg.accentSoft,
          color: rg.accentInk,
          display: 'grid',
          placeItems: 'center',
          flexShrink: 0,
        }}
      >
        {icon}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div
          style={{
            fontSize: 10.5,
            fontWeight: 600,
            letterSpacing: 0.5,
            textTransform: 'uppercase',
            color: rg.inkSubtle,
            marginBottom: 1,
          }}
        >
          {label}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <h2
            style={{
              fontFamily: rg.serif,
              fontSize: 17,
              fontWeight: 600,
              margin: 0,
              letterSpacing: -0.2,
              color: rg.ink,
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
            }}
          >
            {title}
          </h2>
          {status}
        </div>
        {hint && (
          <div style={{ fontSize: 11.5, color: rg.inkSubtle, marginTop: 2 }}>{hint}</div>
        )}
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>{tools}</div>
    </div>
  );
}

export function WSInspector({
  width = 320,
  children,
}: {
  width?: number;
  children: ReactNode;
}) {
  return (
    <div
      style={{
        width,
        flexShrink: 0,
        borderRight: `1px solid ${rg.border}`,
        background: rg.surfaceAlt,
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
      }}
    >
      {children}
    </div>
  );
}

const PDF_PANEL_MIN = 320;
const PDF_PANEL_MAX = 820;

export function WSPdfPanel({
  open,
  onToggle,
  width,
  onResize,
  title = 'Aperçu PDF',
  subtitle = 'post-conversion',
  headerRight,
  children,
}: {
  open: boolean;
  onToggle: () => void;
  width: number;
  onResize: (w: number) => void;
  title?: string;
  subtitle?: string;
  headerRight?: ReactNode;
  children: ReactNode;
}) {
  const dragging = useRef(false);

  function startDrag(e: ReactMouseEvent<HTMLDivElement>) {
    e.preventDefault();
    dragging.current = true;
    const startX = e.clientX;
    const startW = width;
    function onMove(ev: globalThis.MouseEvent) {
      if (!dragging.current) return;
      const next = Math.min(
        PDF_PANEL_MAX,
        Math.max(PDF_PANEL_MIN, startW + (startX - ev.clientX)),
      );
      onResize(next);
    }
    function onUp() {
      dragging.current = false;
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
      document.body.style.userSelect = '';
    }
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    document.body.style.userSelect = 'none';
  }

  if (!open) {
    return (
      <div
        style={{
          width: 40,
          flexShrink: 0,
          borderLeft: `1px solid ${rg.border}`,
          background: rg.surfaceAlt,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          paddingTop: 12,
          gap: 12,
        }}
      >
        <button
          type="button"
          onClick={onToggle}
          title="Afficher l'aperçu PDF"
          aria-label="Afficher l'aperçu PDF"
          style={{
            border: 'none',
            background: 'transparent',
            cursor: 'pointer',
            color: rg.inkMuted,
            display: 'grid',
            placeItems: 'center',
          }}
        >
          <Icons.pdf s={18} />
        </button>
        <div
          style={{
            writingMode: 'vertical-rl',
            transform: 'rotate(180deg)',
            fontSize: 11,
            color: rg.inkSubtle,
            letterSpacing: 0.5,
          }}
        >
          Aperçu PDF
        </div>
      </div>
    );
  }

  return (
    <div
      style={{
        width,
        flexShrink: 0,
        position: 'relative',
        borderLeft: `1px solid ${rg.border}`,
        background: rg.surfaceSunk,
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
      }}
    >
      <div
        onMouseDown={startDrag}
        title="Glisser pour redimensionner"
        style={{
          position: 'absolute',
          left: 0,
          top: 0,
          bottom: 0,
          width: 6,
          cursor: 'col-resize',
          zIndex: 5,
        }}
      />
      <div
        style={{
          padding: '10px 12px',
          borderBottom: `1px solid ${rg.border}`,
          background: rg.surface,
          display: 'flex',
          alignItems: 'center',
          gap: 9,
        }}
      >
        <Icons.pdf s={14} style={{ color: rg.danger }} />
        <div style={{ minWidth: 0, flex: 1, lineHeight: 1.2 }}>
          <div
            style={{
              fontSize: 11.5,
              fontWeight: 600,
              color: rg.ink,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >
            {title}
          </div>
          <div style={{ fontSize: 10, color: rg.inkSubtle }}>{subtitle}</div>
        </div>
        {headerRight}
        <button
          type="button"
          onClick={onToggle}
          title="Masquer l'aperçu"
          aria-label="Masquer l'aperçu"
          style={{
            border: 'none',
            background: 'transparent',
            cursor: 'pointer',
            color: rg.inkSubtle,
            display: 'grid',
            placeItems: 'center',
          }}
        >
          <Icons.close s={13} />
        </button>
      </div>
      <div
        style={{
          flex: 1,
          overflow: 'hidden',
          background: rg.surfaceSunk,
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        {children}
      </div>
    </div>
  );
}

export function WSShellFrame({
  topBar,
  sidebar,
  header,
  children,
}: {
  topBar: ReactNode;
  sidebar: ReactNode;
  header: ReactNode;
  children: ReactNode;
}) {
  const root: CSSProperties = {
    height: '100vh',
    background: rg.surface,
    color: rg.ink,
    fontFamily: rg.sans,
    fontSize: 13,
    lineHeight: 1.45,
    display: 'flex',
    flexDirection: 'column',
    overflow: 'hidden',
  };
  return (
    <div style={root}>
      {topBar}
      <div style={{ display: 'flex', flex: 1, minHeight: 0 }}>
        {sidebar}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
          {header}
          <div style={{ display: 'flex', flex: 1, minHeight: 0 }}>{children}</div>
        </div>
      </div>
    </div>
  );
}
