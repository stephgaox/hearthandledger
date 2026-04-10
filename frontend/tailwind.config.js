/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      fontFamily: {
        sans:  ['Libre Baskerville', 'Georgia', 'serif'],
        serif: ['Lora', 'Georgia', 'serif'],
        mono:  ['IBM Plex Mono', 'Menlo', 'monospace'],
      },
      colors: {
        // ── Semantic tokens ───────────────────────────────────────────────────
        // Warm parchment theme — amber/sienna primary, kraft paper surfaces
        // Dark mode overrides are handled via CSS in index.css (.dark overrides)

        // Brand accent — warm sienna brown
        primary: {
          DEFAULT: '#a67c52',
          hover:   '#8d6e4c',
          light:   '#ece5d8',
          text:    '#735a3a',
        },

        // Financial states
        income: {
          DEFAULT: '#4a7c59',
          light:   '#eef4f0',
          text:    '#3a6347',
        },
        expense: {
          DEFAULT: '#b54a35',
          light:   '#faeae7',
          text:    '#8f3a28',
        },
        net: {
          DEFAULT: '#a67c52',
          light:   '#f5f1e6',
          text:    '#735a3a',
        },
        savings: {
          DEFAULT: '#6b7a3e',
          light:   '#f2f4ea',
          text:    '#535f2f',
        },
        warning: {
          DEFAULT: '#b45309',
          light:   '#fdf4e7',
          text:    '#92400e',
        },

        // Surface tokens — parchment palette
        surface: {
          DEFAULT: '#f5f1e6',
          card:    '#fffcf5',
          border:  '#dbd0ba',
          hover:   '#ece5d8',
        },

        // Text tokens — dark brown foreground
        text: {
          DEFAULT: '#4a3f35',
          muted:   '#7d6b56',
          faint:   '#a89882',
        },

        // Chart palette (matches --chart-1 through --chart-5)
        chart: {
          1: '#a67c52',
          2: '#8d6e4c',
          3: '#735a3a',
          4: '#b3906f',
          5: '#c0a080',
        },
      },
    },
  },
  plugins: [],
}
