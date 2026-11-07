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
        background: 'var(--background)',
        foreground: 'var(--foreground)',
        brand: {
          blue: '#1749F5',
          'blue-hover': '#113AC8',
          'blue-light': '#5B8EFF',
          lavender: '#ECEEFF',
          'lavender-border': '#DFE3F8',
          cyan: '#19D9F2',
          navy: '#06142F',
          ice: '#F3F8FF',
        },
        light: {
          bg: '#FFFFFF',
          secondary: '#F7F8FC',
          soft: '#F0F2FF',
          card: '#FFFFFF',
          'alt-card': '#F3F5FF',
          border: '#E2E8F0',
          'border-hover': 'rgba(23, 73, 245, 0.25)',
          text: {
            primary: '#090B12',
            body: '#303747',
            secondary: '#667085',
            muted: '#9299A8',
          },
        },
        dark: {
          bg: '#050B1B',
          surface: '#09152D',
          elevated: '#101F3B',
          alt: '#142443',
          border: 'rgba(255, 255, 255, 0.08)',
          'border-hover': 'rgba(25, 217, 242, 0.3)',
          text: {
            primary: '#F5F8FF',
            secondary: '#A9B9D5',
            muted: '#7184A6',
          },
        },
        paidx: {
          heading: '#090B12',
          body: '#303747',
          muted: '#667085',
          border: '#E2E8F0',
          success: '#10B981',
          danger: '#EF4444',
          warning: '#F59E0B',
          blue: '#1749F5',
          'blue-hover': '#113AC8',
        },
      },
      borderRadius: {
        none: '0px',
        sm: '8px',
        DEFAULT: '10px',
        md: '12px',
        lg: '16px',
        xl: '20px',
        '2xl': '24px',
        '3xl': '28px',
        '4xl': '32px',
      },
      boxShadow: {
        'soft-light': '0 4px 20px -2px rgba(17, 24, 39, 0.05), 0 2px 6px -1px rgba(17, 24, 39, 0.02)',
        'elevated-light': '0 10px 30px -5px rgba(23, 73, 245, 0.08), 0 4px 12px -2px rgba(17, 24, 39, 0.04)',
        'card-soft': '0 4px 20px -2px rgba(17, 24, 39, 0.05), 0 2px 6px -1px rgba(17, 24, 39, 0.02)',
        'card-elevated': '0 16px 45px rgba(31, 45, 88, 0.08)',
        'card-dark': '0 10px 30px -10px rgba(0, 0, 0, 0.5), 0 0 0 1px rgba(255, 255, 255, 0.08)',
      },
      fontFamily: {
        sans: ['var(--font-archivo)', 'Archivo', 'system-ui', '-apple-system', 'BlinkMacSystemFont', 'sans-serif'],
        archivo: ['var(--font-archivo)', 'Archivo', 'system-ui', '-apple-system', 'BlinkMacSystemFont', 'sans-serif'],
        mono: [
          'ui-monospace',
          'SFMono-Regular',
          'Menlo',
          'Monaco',
          'Consolas',
          'Liberation Mono',
          'Courier New',
          'monospace',
        ],
      },
    },
  },
  plugins: [],
};

export default config;
