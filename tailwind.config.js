/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      /*
       * Semantic, theme-driven colors.
       *
       * Each token maps to a CSS variable that holds SPACE-SEPARATED RGB
       * channels (e.g. `--color-bg: 15 15 15`). Wrapping them in
       * `rgb(... / <alpha-value>)` lets Tailwind's opacity modifiers keep
       * working — so `bg-base`, `text-content/40`, `border-content/10`,
       * `ring-accent/30` all resolve correctly and swap instantly when the
       * <body> theme class changes.
       *
       * Registered under `colors` (not just `backgroundColor`) so bg-, text-,
       * border-, ring-, fill-, from-/via-/to- utilities are all generated.
       */
      colors: {
        base: 'rgb(var(--color-bg) / <alpha-value>)',
        surface: 'rgb(var(--color-surface) / <alpha-value>)',
        primary: 'rgb(var(--color-primary) / <alpha-value>)',
        accent: 'rgb(var(--color-accent) / <alpha-value>)',
        content: 'rgb(var(--color-text) / <alpha-value>)',
      },
      fontFamily: {
        app: 'var(--font-app)',
      },
    },
  },
  plugins: [],
};
