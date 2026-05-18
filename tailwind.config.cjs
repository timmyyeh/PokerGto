/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./src/renderer/index.html', './src/renderer/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        felt: {
          900: '#0c2a1d',
          800: '#11402c',
          700: '#16553a',
        },
        chip: {
          red: '#c0392b',
          blue: '#2980b9',
          green: '#27ae60',
          black: '#1c1c1c',
          gold: '#d4af37',
        },
      },
      fontFamily: {
        card: ['"SF Pro Display"', 'system-ui', 'sans-serif'],
      },
    },
  },
  plugins: [],
};
