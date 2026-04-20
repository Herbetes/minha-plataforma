/** Preset Tailwind compartilhado. Cores base (override via branding por org em runtime). */
/** @type {import('tailwindcss').Config} */
module.exports = {
  theme: {
    extend: {
      colors: {
        primary: {
          DEFAULT: 'var(--cor-primaria, #00796b)',
          contraste: 'var(--cor-primaria-contraste, #ffffff)',
        },
        secondary: {
          DEFAULT: 'var(--cor-secundaria, #ff6f00)',
          contraste: 'var(--cor-secundaria-contraste, #ffffff)',
        },
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
      },
    },
  },
  plugins: [],
};
