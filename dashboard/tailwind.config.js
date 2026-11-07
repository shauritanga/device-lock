/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class',
  content: ['./src/*/index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        // Inter by default; the admin console swaps in DM Sans via --font-sans.
        sans: ['var(--font-sans)', 'Inter', 'ui-sans-serif', 'system-ui', 'sans-serif'],
      },
      colors: {
        // Single brand anchor: indigo. Everything else is neutral or semantic.
        // Single brand anchor. Defined as CSS variables so the admin console can
        // re-point it (blue, with a dark-mode scale) without touching the seller console.
        brand: {
          50: 'rgb(var(--brand-50) / <alpha-value>)',
          100: 'rgb(var(--brand-100) / <alpha-value>)',
          200: 'rgb(var(--brand-200) / <alpha-value>)',
          300: 'rgb(var(--brand-300) / <alpha-value>)',
          400: 'rgb(var(--brand-400) / <alpha-value>)',
          500: 'rgb(var(--brand-500) / <alpha-value>)',
          600: 'rgb(var(--brand-600) / <alpha-value>)',
          700: 'rgb(var(--brand-700) / <alpha-value>)',
          800: 'rgb(var(--brand-800) / <alpha-value>)',
          900: 'rgb(var(--brand-900) / <alpha-value>)',
        },
        // Theme tokens (see index.css :root / .dark).
        canvas: 'var(--canvas)',
        surface: 'var(--surface)',
        line: 'var(--line)',
        'line-soft': 'var(--line-soft)',
        elevated: 'var(--elevated)',
        hover: 'var(--hover)',
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
        xl2: 'var(--radius-card)',
      },
      fontSize: {
        '2xs': ['0.6875rem', { lineHeight: '1rem' }],
      },
      ringColor: {
        brand: 'rgb(var(--brand-600))',
      },
    },
  },
  plugins: [
    // `admin:` utilities apply only inside the admin console (<html data-app="admin">).
    ({ addVariant }) => addVariant('admin', '[data-app="admin"] &'),
  ],
};
