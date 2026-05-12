/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        bg: '#FAFAFA',
        ink: '#1F2937',
        muted: '#6B7280',
        accent: '#2563EB',
        accentHover: '#1D4ED8',
        line: '#E5E7EB',
        surface: '#FFFFFF',
        danger: '#DC2626',
        success: '#16A34A',
      },
      fontFamily: {
        sans: [
          'Inter Variable',
          'Inter',
          '-apple-system',
          'BlinkMacSystemFont',
          'Segoe UI',
          'sans-serif',
        ],
      },
      borderRadius: {
        lg: '0.625rem',
      },
    },
  },
  plugins: [],
};
