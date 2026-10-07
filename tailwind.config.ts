import type { Config } from 'tailwindcss';

const config: Config = {
  content: [
    './app/**/*.{js,ts,jsx,tsx}',
    './components/**/*.{js,ts,jsx,tsx}',
  ],
  theme: {
    extend: {
      colors: {
        // Base palette
        'plate-darkest': '#0A0E27',
        'plate-dark': '#1A1F3A',
        'plate-medium': '#2D3456',
        'plate-light': '#A0A7B8',
        'plate-lightest': '#E8EAEF',

        // Instrument accents
        magenta: {
          50: '#faf0ff',
          100: '#f5e1ff',
          200: '#ecc2ff',
          300: '#e0a2ff',
          400: '#d460ff',
          500: '#c81eff',
          600: '#a31be6',
          700: '#8516cc',
          800: '#6811b3',
          900: '#4d0d99',
        },
        cyan: {
          50: '#f0f9ff',
          100: '#e1f7ff',
          200: '#b3eaff',
          300: '#85ddff',
          400: '#2dd4ff',
          500: '#06d6ff',
          600: '#04b3d1',
          700: '#0390a3',
          800: '#036d85',
          900: '#024a67',
        },
        coral: {
          50: '#fff5f3',
          100: '#ffe5e0',
          200: '#ffccc1',
          300: '#ffb3a2',
          400: '#ff7a63',
          500: '#ff4124',
          600: '#e63b21',
          700: '#cc351e',
          800: '#b32f1b',
          900: '#992918',
        },
        orange: {
          50: '#fff8f0',
          100: '#ffe8d6',
          200: '#ffd1ad',
          300: '#ffba84',
          400: '#ff933c',
          500: '#ff6b00',
          600: '#e65c00',
          700: '#cc4d00',
          800: '#b34000',
          900: '#993300',
        },
        purple: {
          50: '#f9f5ff',
          100: '#f3ebff',
          200: '#e6d7ff',
          300: '#d9c3ff',
          400: '#bf94ff',
          500: '#a566ff',
          600: '#8c38ff',
          700: '#7a2cff',
          800: '#6820e6',
          900: '#5618cc',
        },
        teal: {
          50: '#f0fffe',
          100: '#e0fffd',
          200: '#b3fffb',
          300: '#85fff9',
          400: '#2dfff6',
          500: '#00fef2',
          600: '#00d4c7',
          700: '#00aa9c',
          800: '#008071',
          900: '#005d54',
        },
      },
      backgroundImage: {
        'gradient-plate': 'linear-gradient(to bottom right, #0A0E27, #1A1F3A)',
      },
    },
  },
  plugins: [],
};

export default config;
