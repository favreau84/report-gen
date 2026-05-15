import { useNavigate } from 'react-router-dom';
import { rg } from '../lib/theme';
import { useAuth } from '../lib/auth';
import { Icons } from './ui/icons';

type NavId = 'templates' | 'documents' | 'sources' | 'objects' | 'history';

const ITEMS: { id: NavId; label: string; icon: JSX.Element; count?: number }[] = [
  { id: 'templates', label: 'Templates', icon: <Icons.doc s={15} />, count: 14 },
  { id: 'documents', label: 'Documents', icon: <Icons.layers s={15} />, count: 87 },
  { id: 'sources', label: 'Sources', icon: <Icons.source s={15} />, count: 6 },
  { id: 'objects', label: 'Objets', icon: <Icons.tag s={15} />, count: 12 },
  { id: 'history', label: 'Historique', icon: <Icons.history s={15} /> },
];

function identity(email: string | undefined) {
  if (!email) return { name: 'Julie Favreau', sub: 'Cabinet Favreau · Pro', initials: 'JF' };
  const local = email.split('@')[0];
  const parts = local.split(/[._-]+/).filter(Boolean);
  const name = parts
    .map((p) => p.charAt(0).toUpperCase() + p.slice(1))
    .join(' ');
  const initials =
    (parts.length > 1
      ? parts[0][0] + parts[1][0]
      : local.slice(0, 2)
    ).toUpperCase();
  return { name: name || local, sub: email, initials };
}

export function NavRail({ active = 'templates' }: { active?: NavId }) {
  const { user, signOut } = useAuth();
  const navigate = useNavigate();
  const { name, sub, initials } = identity(user?.email);

  async function handleSignOut() {
    await signOut();
    navigate('/login');
  }

  return (
    <div
      style={{
        width: 200,
        flexShrink: 0,
        background: rg.surfaceAlt,
        borderRight: `1px solid ${rg.border}`,
        padding: '14px 10px',
        display: 'flex',
        flexDirection: 'column',
        gap: 1,
      }}
    >
      <div
        style={{
          fontSize: 10.5,
          fontWeight: 600,
          letterSpacing: 0.6,
          textTransform: 'uppercase',
          color: rg.inkSubtle,
          padding: '6px 10px 8px',
        }}
      >
        Espace de travail
      </div>
      {ITEMS.map((it) => {
        const a = it.id === active;
        return (
          <div
            key={it.id}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 10,
              padding: '7px 10px',
              borderRadius: 6,
              fontSize: 13,
              color: a ? rg.ink : rg.inkMuted,
              background: a ? rg.surface : 'transparent',
              fontWeight: a ? 600 : 500,
              boxShadow: a ? `0 0 0 1px ${rg.border}` : 'none',
              cursor: 'pointer',
            }}
          >
            <span style={{ color: a ? rg.ink : rg.inkSubtle }}>{it.icon}</span>
            <span style={{ flex: 1 }}>{it.label}</span>
            {it.count != null && (
              <span style={{ fontSize: 11, color: rg.inkSubtle, fontFamily: rg.mono }}>
                {it.count}
              </span>
            )}
          </div>
        );
      })}
      <div style={{ flex: 1 }} />
      <div
        style={{
          padding: '10px',
          borderTop: `1px solid ${rg.border}`,
          marginTop: 8,
          fontSize: 12,
          color: rg.inkMuted,
          display: 'flex',
          alignItems: 'center',
          gap: 8,
        }}
      >
        <div
          style={{
            width: 26,
            height: 26,
            borderRadius: '50%',
            background: '#D8C9AF',
            color: rg.ink,
            display: 'grid',
            placeItems: 'center',
            fontWeight: 600,
            fontSize: 11,
            flexShrink: 0,
          }}
        >
          {initials}
        </div>
        <div style={{ lineHeight: 1.2, minWidth: 0, flex: 1 }}>
          <div
            style={{
              color: rg.ink,
              fontWeight: 500,
              fontSize: 12.5,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >
            {name}
          </div>
          <div
            style={{
              fontSize: 10.5,
              color: rg.inkSubtle,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >
            {sub}
          </div>
        </div>
        <button
          type="button"
          onClick={handleSignOut}
          title="Déconnexion"
          aria-label="Déconnexion"
          style={{
            display: 'grid',
            placeItems: 'center',
            width: 24,
            height: 24,
            border: 'none',
            background: 'transparent',
            color: rg.inkSubtle,
            cursor: 'pointer',
            borderRadius: 5,
            flexShrink: 0,
          }}
        >
          <Icons.logout s={14} />
        </button>
      </div>
    </div>
  );
}
