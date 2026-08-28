import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./app/**/*.{ts,tsx}', './components/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        cream: '#FFFBF3',
        ink: '#2E2A3D',
        'ink-soft': '#726C8A',
        mint: {
          50: '#F1FBF6',
          100: '#DFF6EA',
          200: '#BEEBD4',
          300: '#93DCBA',
          400: '#63C89C',
          500: '#3FB081',
          600: '#2E8E66',
        },
        peach: {
          50: '#FFF6F0',
          100: '#FFE8D9',
          200: '#FFD1B3',
          300: '#FFB585',
          400: '#FF9D5C',
          500: '#F5813F',
          600: '#D9642A',
        },
        lilac: {
          50: '#F8F6FE',
          100: '#EDE7FC',
          200: '#DACCF8',
          300: '#C1AEF2',
          400: '#A78CE8',
          500: '#8C6DDB',
          600: '#7052C0',
        },
        sky: {
          50: '#F1FAFF',
          100: '#DDF2FF',
          200: '#B8E5FF',
          300: '#87D2FF',
          400: '#54BAF5',
          500: '#329BDA',
          600: '#217AB3',
        },
        rose: {
          50: '#FFF3F6',
          100: '#FFE1E9',
          200: '#FFC2D2',
          300: '#FF9EB5',
          400: '#FB7797',
          500: '#EF5178',
          600: '#CE3860',
        },
        butter: {
          50: '#FFFBEB',
          100: '#FFF3C4',
          200: '#FFE58A',
          300: '#FFD65C',
          400: '#FFC933',
          500: '#F2AE0E',
        },
      },
      fontFamily: {
        display: ['var(--font-display)'],
        body: ['var(--font-body)'],
        mono: ['var(--font-mono)'],
      },
      borderRadius: {
        xl2: '1.25rem',
        xl3: '1.75rem',
      },
      boxShadow: {
        soft: '0 2px 8px -2px rgba(46,42,61,0.08), 0 12px 28px -12px rgba(46,42,61,0.12)',
        pop: '0 6px 20px -6px rgba(46,42,61,0.22)',
      },
      keyframes: {
        'pop-in': {
          '0%': { opacity: '0', transform: 'scale(0.94) translateY(6px)' },
          '100%': { opacity: '1', transform: 'scale(1) translateY(0)' },
        },
        'slide-up': {
          '0%': { opacity: '0', transform: 'translateY(12px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
      },
      animation: {
        'pop-in': 'pop-in .18s ease-out',
        'slide-up': 'slide-up .22s ease-out',
      },
    },
  },
  plugins: [],
};

export default config;
