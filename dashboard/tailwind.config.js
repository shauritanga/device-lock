/** @type {import('tailwindcss').Config} */
export default {
  content: ['./src/*/index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Inter', 'ui-sans-serif', 'system-ui', 'sans-serif'],
      },
      colors: {
        // Single brand anchor: indigo. Everything else is neutral or semantic.
        brand: {
          50: '#eef2ff',
          100: '#e0e7ff',
          200: '#c7d2fe',
          300: '#a5b4fc',
          400: '#818cf8',
          500: '#6366f1',
          600: '#4f46e5',
          700: '#4338ca',
          800: '#3730a3',
          900: '#312e81',
        },
        // Neutral ramp (slate). Named tokens keep components hex-free.
        canvas: '#f6f7f9', // app background
        surface: '#ffffff', // cards / raised
        line: '#e9edf3', // hairline borders / dividers
        ink: '#0f172a', // primary text (slate-900)
        'ink-soft': '#475569', // secondary text (slate-600)
        muted: '#64748b', // tertiary text / labels (slate-500, ≥4.5:1 on white)
        faint: '#94a3b8', // disabled / placeholder (slate-400)
      },
      boxShadow: {
        // One elevation scale, used consistently.
        card: '0 1px 2px rgba(15,23,42,0.04), 0 1px 3px rgba(15,23,42,0.05)',
        pop: '0 4px 12px rgba(15,23,42,0.08), 0 16px 40px rgba(15,23,42,0.12)',
      },
      borderRadius: {
        xl2: '1rem',
      },
      fontSize: {
        '2xs': ['0.6875rem', { lineHeight: '1rem' }],
      },
      ringColor: {
        brand: '#4f46e5',
      },
    },
  },
  plugins: [],
};
