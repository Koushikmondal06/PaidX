import type { Config } from 'tailwindcss';

const config: Config = {
  content: [
    './app/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        background: '#071013',
        surface: '#0B161B',
        'surface-hover': '#0E1D24',
        border: '#1A2E38',
        'paidx-blue': '#5465FF',
        'paidx-red': '#EB5160',
        'paidx-green': '#10B981',
        'text-main': '#DFE0E2',
        'text-muted': '#AAAAAA',
      },
      fontFamily: {
        mono: [
          'JetBrains Mono',
          'ui-monospace',
          'SFMono-Regular',
          'Menlo',
          'Monaco',
          'Consolas',
          'monospace',
        ],
      },
    },
  },
  plugins: [],
};

export default config;
