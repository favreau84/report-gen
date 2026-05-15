import type { ReactNode } from 'react';
import { rg } from '../../lib/theme';
import { Icons } from './icons';

// Atomes de formulaire de l'inspecteur (port fidèle du design — affichage
// statique pour l'instant ; deviendront interactifs avec les facettes
// ultérieures).

export function ConfigSection({
  title,
  children,
  foot,
}: {
  title?: string;
  children: ReactNode;
  foot?: ReactNode;
}) {
  return (
    <div style={{ padding: '12px 14px', borderBottom: `1px solid ${rg.border}` }}>
      {title && (
        <div
          style={{
            fontSize: 10,
            fontWeight: 600,
            letterSpacing: 0.5,
            textTransform: 'uppercase',
            color: rg.inkSubtle,
            marginBottom: 8,
          }}
        >
          {title}
        </div>
      )}
      {children}
      {foot && <div style={{ marginTop: 8, fontSize: 10.5, color: rg.inkSubtle }}>{foot}</div>}
    </div>
  );
}

export function FormLabel({ children, hint }: { children: ReactNode; hint?: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
      <span style={{ fontSize: 11.5, fontWeight: 500, color: rg.ink }}>{children}</span>
      {hint && <span style={{ fontSize: 10.5, color: rg.inkSubtle }}>{hint}</span>}
    </div>
  );
}

export function FormInput({
  value,
  mono,
  placeholder,
}: {
  value?: string;
  mono?: boolean;
  placeholder?: string;
}) {
  return (
    <div
      style={{
        padding: '7px 10px',
        background: rg.surface,
        border: `1px solid ${rg.border}`,
        borderRadius: 5,
        fontSize: 12,
        color: value ? rg.ink : rg.inkSubtle,
        fontFamily: mono ? rg.mono : rg.sans,
        fontStyle: value ? 'normal' : 'italic',
      }}
    >
      {value || placeholder || ''}
    </div>
  );
}

export function FormSelect({ value }: { value: string }) {
  return (
    <div
      style={{
        padding: '7px 10px',
        background: rg.surface,
        border: `1px solid ${rg.border}`,
        borderRadius: 5,
        fontSize: 12,
        color: rg.ink,
        display: 'flex',
        alignItems: 'center',
      }}
    >
      {value}
      <Icons.chevD s={11} style={{ marginLeft: 'auto', color: rg.inkSubtle }} />
    </div>
  );
}

export function FormCheck({
  label,
  hint,
  on,
}: {
  label: string;
  hint?: string;
  on?: boolean;
}) {
  return (
    <label
      style={{
        display: 'flex',
        alignItems: 'flex-start',
        gap: 8,
        padding: '5px 0',
        cursor: 'pointer',
      }}
    >
      <div
        style={{
          width: 14,
          height: 14,
          borderRadius: 3,
          marginTop: 2,
          border: `1.5px solid ${on ? rg.accent : rg.borderStrong}`,
          background: on ? rg.accent : 'transparent',
          display: 'grid',
          placeItems: 'center',
        }}
      >
        {on && <Icons.check s={10} sw={3} style={{ color: '#fff' }} />}
      </div>
      <div>
        <div style={{ fontSize: 12, color: rg.ink, fontWeight: 500 }}>{label}</div>
        {hint && <div style={{ fontSize: 10.5, color: rg.inkSubtle, marginTop: 1 }}>{hint}</div>}
      </div>
    </label>
  );
}
