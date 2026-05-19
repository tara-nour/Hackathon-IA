/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        base: '#f8fafc',
        surface: '#ffffff',
        'surface-alt': '#f1f5f9',
        accent: '#2563eb',
        'accent-hover': '#1d4ed8',
        'accent-light': '#eff6ff',
        'accent-border': '#bfdbfe',
        border: '#e2e8f0',
        'border-strong': '#cbd5e1',
        // text colors — use slate-900/600/500 directly in JSX
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
        mono: ['"IBM Plex Mono"', 'monospace'],
      },
      boxShadow: {
        card: '0 1px 3px 0 rgb(0 0 0 / 0.07), 0 1px 2px -1px rgb(0 0 0 / 0.07)',
        'card-hover': '0 4px 12px 0 rgb(0 0 0 / 0.10)',
        focus: '0 0 0 3px rgb(37 99 235 / 0.25)',
      },
    },
  },
  plugins: [],
};
