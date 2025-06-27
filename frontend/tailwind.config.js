/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{vue,js,ts,jsx,tsx}",
  ],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        primary: {
          50: '#fef5ea',
          100: '#fde7ca',
          200: '#fcd098',
          300: '#fab05b',
          400: '#f78f2f',
          500: '#F0812A',
          600: '#e46a16',
          700: '#bd4f13',
          800: '#973f17',
          900: '#7a3616',
        },
        success: '#10b981',
        danger: '#ef4444',
        warning: '#f59e0b',
      }
    },
  },
  plugins: [],
}