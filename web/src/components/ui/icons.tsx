import type { CSSProperties, ReactNode } from 'react';

export type IconProps = {
  s?: number;
  sw?: number;
  fill?: string;
  className?: string;
  style?: CSSProperties;
};

type BaseProps = IconProps & { d?: string; children?: ReactNode };

function Icon({ d, s = 16, sw = 1.5, fill = 'none', children, className, style }: BaseProps) {
  return (
    <svg
      width={s}
      height={s}
      viewBox="0 0 24 24"
      fill={fill}
      stroke="currentColor"
      strokeWidth={sw}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      style={style}
    >
      {d ? <path d={d} /> : children}
    </svg>
  );
}

export const Icons = {
  doc: (p: IconProps) => (
    <Icon {...p} d="M7 3h7l5 5v13a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1Z M14 3v5h5" />
  ),
  pdf: (p: IconProps) => (
    <Icon {...p}>
      <path d="M7 3h7l5 5v13a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1Z M14 3v5h5" />
      <path d="M9 14h1.5a1.5 1.5 0 0 1 0 3H9v-3Zm0 0v3M14 14v3 M14 14h2 M14 15.5h1.5 M18.5 14H20 M18.5 14v3" />
    </Icon>
  ),
  image: (p: IconProps) => (
    <Icon {...p}>
      <rect x="3.5" y="4.5" width="17" height="15" rx="1.5" />
      <circle cx="9" cy="10" r="1.6" />
      <path d="m4 17 4.5-4.5 4 4L16 13l4 4" />
    </Icon>
  ),
  table: (p: IconProps) => (
    <Icon {...p}>
      <rect x="3.5" y="4.5" width="17" height="15" rx="1.5" />
      <path d="M3.5 9.5h17 M3.5 14.5h17 M9 4.5v15 M15 4.5v15" />
    </Icon>
  ),
  kv: (p: IconProps) => (
    <Icon {...p}>
      <rect x="3.5" y="4.5" width="17" height="15" rx="1.5" />
      <path d="M3.5 9.5h17 M3.5 14.5h17 M11 4.5v15" />
    </Icon>
  ),
  text: (p: IconProps) => <Icon {...p} d="M5 6h14 M5 10h14 M5 14h10 M5 18h6" />,
  address: (p: IconProps) => (
    <Icon {...p}>
      <path d="M12 21s-7-7.5-7-12a7 7 0 1 1 14 0c0 4.5-7 12-7 12Z" />
      <circle cx="12" cy="9.5" r="2.5" />
    </Icon>
  ),
  person: (p: IconProps) => (
    <Icon {...p}>
      <circle cx="12" cy="8" r="3.5" />
      <path d="M5 20c.8-3.5 3.6-5.5 7-5.5s6.2 2 7 5.5" />
    </Icon>
  ),
  tag: (p: IconProps) => <Icon {...p} d="M4 12 12 4h7v7l-8 8-7-7Z M15 9.5h.01" />,
  link: (p: IconProps) => (
    <Icon
      {...p}
      d="M10 14a4 4 0 0 0 5.66 0l3-3a4 4 0 0 0-5.66-5.66l-1 1 M14 10a4 4 0 0 0-5.66 0l-3 3a4 4 0 0 0 5.66 5.66l1-1"
    />
  ),
  check: (p: IconProps) => <Icon {...p} d="m5 12.5 4.5 4.5L19 7" />,
  plus: (p: IconProps) => <Icon {...p} d="M12 5v14 M5 12h14" />,
  search: (p: IconProps) => (
    <Icon {...p}>
      <circle cx="11" cy="11" r="6.5" />
      <path d="m20 20-4.5-4.5" />
    </Icon>
  ),
  filter: (p: IconProps) => <Icon {...p} d="M4 5h16 M7 12h10 M10 19h4" />,
  more: (p: IconProps) => (
    <Icon {...p}>
      <circle cx="5" cy="12" r="1" />
      <circle cx="12" cy="12" r="1" />
      <circle cx="19" cy="12" r="1" />
    </Icon>
  ),
  chevR: (p: IconProps) => <Icon {...p} d="m9 5 7 7-7 7" />,
  chevD: (p: IconProps) => <Icon {...p} d="m5 9 7 7 7-7" />,
  close: (p: IconProps) => <Icon {...p} d="M6 6l12 12 M18 6 6 18" />,
  download: (p: IconProps) => <Icon {...p} d="M12 4v12 m-5-5 5 5 5-5 M5 20h14" />,
  upload: (p: IconProps) => <Icon {...p} d="M12 20V8 m-5 5 5-5 5 5 M5 4h14" />,
  eye: (p: IconProps) => (
    <Icon {...p}>
      <path d="M2.5 12s3.5-7 9.5-7 9.5 7 9.5 7-3.5 7-9.5 7S2.5 12 2.5 12Z" />
      <circle cx="12" cy="12" r="3" />
    </Icon>
  ),
  grid: (p: IconProps) => (
    <Icon {...p}>
      <rect x="3.5" y="3.5" width="7" height="7" rx="1" />
      <rect x="13.5" y="3.5" width="7" height="7" rx="1" />
      <rect x="3.5" y="13.5" width="7" height="7" rx="1" />
      <rect x="13.5" y="13.5" width="7" height="7" rx="1" />
    </Icon>
  ),
  layers: (p: IconProps) => (
    <Icon {...p} d="m12 3 9 5-9 5-9-5 9-5Z m9 9-9 5-9-5 m18 4-9 5-9-5" />
  ),
  source: (p: IconProps) => (
    <Icon {...p}>
      <ellipse cx="12" cy="5" rx="7" ry="2.5" />
      <path d="M5 5v7c0 1.4 3.1 2.5 7 2.5s7-1.1 7-2.5V5 M5 12v7c0 1.4 3.1 2.5 7 2.5s7-1.1 7-2.5v-7" />
    </Icon>
  ),
  drag: (p: IconProps) => (
    <Icon {...p}>
      <circle cx="9" cy="6" r=".8" fill="currentColor" stroke="none" />
      <circle cx="15" cy="6" r=".8" fill="currentColor" stroke="none" />
      <circle cx="9" cy="12" r=".8" fill="currentColor" stroke="none" />
      <circle cx="15" cy="12" r=".8" fill="currentColor" stroke="none" />
      <circle cx="9" cy="18" r=".8" fill="currentColor" stroke="none" />
      <circle cx="15" cy="18" r=".8" fill="currentColor" stroke="none" />
    </Icon>
  ),
  pin: (p: IconProps) => <Icon {...p} d="M12 17v5 M8 3h8l-1 6 3 3H6l3-3-1-6Z" />,
  edit: (p: IconProps) => <Icon {...p} d="M4 20h4l10-10-4-4L4 16v4Z M14 6l4 4" />,
  bolt: (p: IconProps) => <Icon {...p} d="M13 3 4 14h7l-1 7 9-11h-7l1-7Z" />,
  history: (p: IconProps) => (
    <Icon {...p}>
      <path d="M3 12a9 9 0 1 0 3-6.7L3 8 M3 3v5h5" />
      <path d="M12 7v5l3 2" />
    </Icon>
  ),
  logout: (p: IconProps) => (
    <Icon {...p} d="M9 4H6a1 1 0 0 0-1 1v14a1 1 0 0 0 1 1h3 M15 8l4 4-4 4 M19 12H9" />
  ),
};

export type IconName = keyof typeof Icons;
