/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class',
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
        // Theme tokens (see index.css :root / .dark).
        canvas: 'var(--canvas)',
        surface: 'var(--surface)',
        line: 'var(--line)',
        ink: 'var(--ink)',
        'ink-soft': 'var(--ink-soft)',
        muted: 'var(--muted)',
        faint: 'var(--faint)',
      },
      boxShadow: {
        // One elevation scale, used consistently.
        card: 'var(--shadow-card)',
        pop: 'var(--shadow-pop)',
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
