import { Fragment, type ReactNode } from 'react';
import { rg } from '../lib/theme';
import { Icons } from './ui/icons';

export function AppBar({ crumbs = [], right }: { crumbs?: string[]; right?: ReactNode }) {
  return (
    <div
      style={{
        height: 52,
        flexShrink: 0,
        borderBottom: `1px solid ${rg.border}`,
        display: 'flex',
        alignItems: 'center',
        padding: '0 20px',
        background: rg.surface,
        gap: 12,
      }}
    >
      <div
        style={{
          width: 26,
          height: 26,
          borderRadius: 6,
          background: rg.ink,
          color: '#F5F3EE',
          display: 'grid',
          placeItems: 'center',
          fontFamily: rg.serif,
          fontWeight: 600,
          fontSize: 14,
        }}
      >
        R
      </div>
      <div style={{ fontWeight: 600, letterSpacing: -0.1 }}>Report Gen</div>
      <div style={{ width: 1, height: 18, background: rg.border, margin: '0 6px' }} />
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          color: rg.inkMuted,
          fontSize: 13,
        }}
      >
        {crumbs.map((c, i) => (
          <Fragment key={i}>
            {i > 0 && <Icons.chevR s={12} style={{ opacity: 0.5 }} />}
            <span
              style={{
                color: i === crumbs.length - 1 ? rg.ink : rg.inkMuted,
                fontWeight: i === crumbs.length - 1 ? 500 : 400,
              }}
            >
              {c}
            </span>
          </Fragment>
        ))}
      </div>
      <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 8 }}>
        {right}
      </div>
    </div>
  );
}
