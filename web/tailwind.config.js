/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        // Palette « papier / encre » éditoriale (design Claude Design).
        // Les noms hérités (bg, line, muted, accentHover, success) sont conservés
        // et remappés pour que les écrans existants continuent de résoudre.
        bg: '#F5F3EE',
        paper: '#F5F3EE',
        surface: '#FFFFFF',
        surfaceAlt: '#FAF8F3',
        surfaceSunk: '#F1EEE7',

        line: '#E7E2D7',
        border: '#E7E2D7',
        borderStrong: '#D8D1C2',

        ink: '#1C1B18',
        muted: '#615C53',
        inkMuted: '#615C53',
        inkSubtle: '#8E8878',

        accent: '#2A4A7F',
        accentHover: '#1B3360',
        accentInk: '#1B3360',
        accentSoft: '#E8EEF8',

        warn: '#B57614',
        warnSoft: '#F7EFD9',
        ok: '#5B7B3F',
        success: '#5B7B3F',
        okSoft: '#E7EFDD',
        danger: '#9A3B2E',
      },
      fontFamily: {
        sans: [
          'Geist',
          'ui-sans-serif',
          'system-ui',
          '-apple-system',
          'Segoe UI',
          'sans-serif',
        ],
        serif: [
          'Source Serif 4',
          'Source Serif Pro',
          'Iowan Old Style',
          'Georgia',
          'serif',
        ],
        mono: [
          'Geist Mono',
          'ui-monospace',
          'JetBrains Mono',
          'SF Mono',
          'monospace',
        ],
      },
      borderRadius: {
        lg: '0.625rem',
      },
    },
  },
  plugins: [],
};
