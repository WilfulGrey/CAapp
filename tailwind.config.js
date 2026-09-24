/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      // Portal-wide readability bump — the default Tailwind type scale
      // (xs 12 / sm 14 / base 16 …) felt too small across the board.
      // ~+1px per step. Layout/spacing (rem-based) is left untouched;
      // only the named font-size utilities grow. Each value is
      // [font-size, line-height].
      fontSize: {
        xs: ['0.8125rem', '1.125rem'],   // 13px (was 12)
        sm: ['0.9375rem', '1.375rem'],   // 15px (was 14)
        base: ['1.0625rem', '1.625rem'], // 17px (was 16)
        lg: ['1.1875rem', '1.8rem'],     // 19px (was 18)
        xl: ['1.3125rem', '1.85rem'],    // 21px (was 20)
      },
      // Primundus-Look wie auf primundus.de (tailwind.config.ts dort) und im
      // Kostenrechner (Portal-Redesign 24.09.2026). Nur ERGÄNZT: bestehende
      // Hex-Werte im Portal bleiben gültig, bis ihre Stelle umgebaut wird.
      colors: {
        pm: {
          ink: '#1C1C1C',
          body: '#2E2E2E',
          // Kleine Schrift braucht mehr Kontrast als mute (#8B8B8B, 3,5:1 auf Weiß)
          muted: '#6B6B6B',
          mute: '#8B8B8B',
          taupe: { DEFAULT: '#8B7355', light: '#A89279', deep: '#7D6E5D', ink: '#6B5A44' },
          paper: '#F8F7F5',
          shell: '#F2EDE6',
          line: { DEFAULT: '#E5E3DF', soft: '#F0EDE8' },
          chip: '#DDD5C8',
          green: { DEFAULT: '#3D7A5C', deep: '#2A5C3F' },
          mint: '#E8F5EE',
          coral: { DEFAULT: '#E76F63', deep: '#D45F53', tint: '#FDF0EE', ink: '#8B3E2F' },
          amber: { DEFAULT: '#D97706', ink: '#8B5A12', tint: '#FDF1E2' },
          error: { DEFAULT: '#D9534F', ink: '#B03A36' },
          gold: '#D4A843',
          whatsapp: '#25D366',
        },
      },
      fontFamily: {
        pm: ['"Inter Variable"', 'Inter', 'system-ui', '-apple-system', 'sans-serif'],
      },
      boxShadow: {
        lift: '0 1px 2px rgba(28,28,28,.04), 0 14px 38px -16px rgba(28,28,28,.18)',
      },
      borderRadius: {
        card: '20px',
      },
    },
  },
  plugins: [],
};
