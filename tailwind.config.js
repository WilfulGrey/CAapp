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
    },
  },
  plugins: [],
};
