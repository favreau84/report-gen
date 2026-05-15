// Jetons du design « papier / encre » (Claude Design). Source unique pour les
// composants qui s'expriment en styles inline (parité pixel avec la maquette).
// Le fichier tailwind.config.js en miroite les valeurs pour les classes utilitaires.
export const rg = {
  paper: '#F5F3EE',
  surface: '#FFFFFF',
  surfaceAlt: '#FAF8F3',
  surfaceSunk: '#F1EEE7',
  border: '#E7E2D7',
  borderStrong: '#D8D1C2',
  ink: '#1C1B18',
  inkMuted: '#615C53',
  inkSubtle: '#8E8878',
  accent: '#2A4A7F',
  accentSoft: '#E8EEF8',
  accentInk: '#1B3360',
  warn: '#B57614',
  warnSoft: '#F7EFD9',
  ok: '#5B7B3F',
  okSoft: '#E7EFDD',
  danger: '#9A3B2E',
  sans: '"Geist", ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif',
  mono: '"Geist Mono", ui-monospace, "JetBrains Mono", "SF Mono", monospace',
  serif: '"Source Serif 4", "Source Serif Pro", "Iowan Old Style", Georgia, serif',
} as const;
