/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        surface: {
          950: '#080810',
          900: '#0d0d18',
          800: '#12121f',
          700: '#1a1a2e',
          600: '#22223a',
          500: '#2c2c48',
        },
      },
    },
  },
  plugins: [],
};
