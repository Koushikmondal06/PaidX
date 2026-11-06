import type { Config } from 'tailwindcss';

const config: Config = {
  darkMode: 'class',
  content: [
    './app/**/*.{js,ts,jsx,tsx,mdx}',
    './pages/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        brand: {
          blue: '#1749F5',
          'blue-hover': '#113AC8',
          cyan: '#19D9F2',
          navy: '#06142F',
          violet: '#927CFF',
          coral: '#EB5160',
          ice: '#F3F8FF',
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
        light: {
          bg: '#FFFFFF',
          secondary: '#F7F8FC',
          soft: '#F0F2FF',
          card: '#FFFFFF',
          'alt-card': '#F3F5FF',
          border: 'rgba(9, 11, 18, 0.08)',
          'border-hover': 'rgba(23, 73, 245, 0.25)',
          text: {
            primary: '#090B12',
            body: '#303747',
            secondary: '#667085',
            muted: '#9299A8',
          },
        },
      },
      borderRadius: {
        sm: '8px',
        DEFAULT: '10px',
        md: '12px',
        lg: '16px',
        xl: '20px',
        '2xl': '24px',
      },
      boxShadow: {
        'soft-light': '0 4px 20px -2px rgba(17, 24, 39, 0.05), 0 2px 6px -1px rgba(17, 24, 39, 0.02)',
        'elevated-light': '0 10px 30px -5px rgba(23, 73, 245, 0.08), 0 4px 12px -2px rgba(17, 24, 39, 0.04)',
        'glow-cyan': '0 0 30px -5px rgba(25, 217, 242, 0.3)',
        'glow-blue': '0 0 35px -5px rgba(23, 73, 245, 0.45)',
        'card-dark': '0 10px 30px -10px rgba(0, 0, 0, 0.5), 0 0 0 1px rgba(255, 255, 255, 0.08)',
      },
      fontFamily: {
        sans: ['var(--font-archivo)', 'Archivo', 'system-ui', '-apple-system', 'BlinkMacSystemFont', 'sans-serif'],
        archivo: ['var(--font-archivo)', 'Archivo', 'system-ui', '-apple-system', 'BlinkMacSystemFont', 'sans-serif'],
      },
    },
  },
  plugins: [],
};

export default config;
