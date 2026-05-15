import type { CSSProperties, ReactNode } from 'react';
import { rg } from '../../lib/theme';

// ── Pill ─────────────────────────────────────────────────────────────────────
type PillTone = 'default' | 'muted' | 'accent' | 'ok' | 'warn' | 'danger';

export function Pill({
  tone = 'default',
  children,
  icon,
}: {
  tone?: PillTone;
  children: ReactNode;
  icon?: ReactNode;
}) {
  const tones: Record<PillTone, { bg: string; fg: string; bd: string }> = {
    default: { bg: '#EFEBE0', fg: rg.ink, bd: 'transparent' },
    muted: { bg: 'transparent', fg: rg.inkMuted, bd: rg.border },
    accent: { bg: rg.accentSoft, fg: rg.accentInk, bd: 'transparent' },
    ok: { bg: rg.okSoft, fg: '#3F5A28', bd: 'transparent' },
    warn: { bg: rg.warnSoft, fg: '#7B4F0C', bd: 'transparent' },
    danger: { bg: '#F4DFDB', fg: '#7A2C22', bd: 'transparent' },
  };
  const t = tones[tone];
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 5,
        padding: '2px 8px',
        borderRadius: 999,
        fontSize: 11,
        fontWeight: 500,
        letterSpacing: 0.1,
        lineHeight: 1.5,
        background: t.bg,
        color: t.fg,
        border: `1px solid ${t.bd}`,
      }}
    >
      {icon}
      {children}
    </span>
  );
}

// ── Btn ──────────────────────────────────────────────────────────────────────
type BtnVariant = 'primary' | 'accent' | 'secondary' | 'ghost';

export function Btn({
  variant = 'ghost',
  size = 'md',
  icon,
  children,
  style,
  onClick,
  title,
  type = 'button',
}: {
  variant?: BtnVariant;
  size?: 'sm' | 'md';
  icon?: ReactNode;
  children?: ReactNode;
  style?: CSSProperties;
  onClick?: () => void;
  title?: string;
  type?: 'button' | 'submit';
}) {
  const v: Record<BtnVariant, { bg: string; fg: string; bd: string }> = {
    primary: { bg: rg.ink, fg: '#FAF8F3', bd: rg.ink },
    accent: { bg: rg.accent, fg: '#fff', bd: rg.accent },
    secondary: { bg: rg.surface, fg: rg.ink, bd: rg.borderStrong },
    ghost: { bg: 'transparent', fg: rg.ink, bd: 'transparent' },
  };
  const palette = v[variant];
  const s = size === 'sm' ? { h: 26, px: 9, fs: 12 } : { h: 32, px: 12, fs: 13 };
  return (
    <button
      type={type}
      onClick={onClick}
      title={title}
      style={{
        height: s.h,
        padding: `0 ${s.px}px`,
        fontSize: s.fs,
        fontWeight: 500,
        background: palette.bg,
        color: palette.fg,
        border: `1px solid ${palette.bd}`,
        borderRadius: 6,
        display: 'inline-flex',
        alignItems: 'center',
        gap: 6,
        cursor: 'pointer',
        fontFamily: rg.sans,
        lineHeight: 1,
        ...style,
      }}
    >
      {icon}
      {children}
    </button>
  );
}

// ── Progress (barre fine linéaire) ───────────────────────────────────────────
export function Progress({
  value,
  tone = 'default',
  height = 4,
  width = '100%',
}: {
  value: number;
  tone?: 'default' | 'ok' | 'warn';
  height?: number;
  width?: number | string;
}) {
  const fg = tone === 'ok' ? rg.ok : tone === 'warn' ? rg.warn : rg.ink;
  return (
    <div
      style={{
        width,
        height,
        background: '#E7E2D7',
        borderRadius: 999,
        overflow: 'hidden',
      }}
    >
      <div style={{ width: `${value}%`, height: '100%', background: fg, borderRadius: 999 }} />
    </div>
  );
}

// ── Gauge (jauge circulaire) ─────────────────────────────────────────────────
export function Gauge({
  value,
  size = 26,
  stroke = 2.5,
  tone = 'default',
}: {
  value: number;
  size?: number;
  stroke?: number;
  tone?: 'default' | 'ok' | 'warn';
}) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const off = c * (1 - value / 100);
  const fg = tone === 'ok' ? rg.ok : tone === 'warn' ? rg.warn : rg.ink;
  return (
    <svg
      width={size}
      height={size}
      viewBox={`0 0 ${size} ${size}`}
      style={{ transform: 'rotate(-90deg)' }}
    >
      <circle cx={size / 2} cy={size / 2} r={r} stroke="#E7E2D7" strokeWidth={stroke} fill="none" />
      <circle
        cx={size / 2}
        cy={size / 2}
        r={r}
        stroke={fg}
        strokeWidth={stroke}
        strokeLinecap="round"
        fill="none"
        strokeDasharray={c}
        strokeDashoffset={off}
      />
    </svg>
  );
}

// ── TagChip (balise inline monospace) ────────────────────────────────────────
export function TagChip({
  children,
  tone = 'default',
}: {
  children: ReactNode;
  tone?: 'default' | 'mapped' | 'unmapped';
}) {
  const fg = tone === 'mapped' ? rg.accentInk : tone === 'unmapped' ? rg.warn : rg.ink;
  const bg = tone === 'mapped' ? rg.accentSoft : tone === 'unmapped' ? rg.warnSoft : '#EFEBE0';
  return (
    <code
      style={{
        fontFamily: rg.mono,
        fontSize: 11.5,
        padding: '2px 6px',
        borderRadius: 4,
        background: bg,
        color: fg,
        letterSpacing: 0,
      }}
    >
      {children}
    </code>
  );
}
