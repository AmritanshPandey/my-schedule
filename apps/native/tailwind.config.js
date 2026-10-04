/** @type {import('tailwindcss').Config} */

/**
 * Mirrors the web app's Tailwind v4 theme (app/globals.css `@theme`) on
 * NativeWind's Tailwind v3, so the class strings ported from the PWA resolve to
 * the same values here:
 *
 * - `green` AND `emerald` are both the brand ramp (#00A63E at 600), exactly as
 *   globals.css overrides them — Tailwind's stock emerald (#10B981) would make
 *   every progress bar and success state a different green from the PWA.
 * - The one type ladder (`text-label`, `text-caption`, ... `text-display`).
 * - Tailwind v4's radius scale (`rounded-sm` is 4px there, 2px in v3) plus the
 *   app's `rounded-pr-sm`.
 * - The weight ceiling: globals.css caps `font-bold`/`extrabold`/`black` at
 *   600 ("hierarchy comes from scale, color, and spacing rather than heavy
 *   type"), so they map to Avenir Next Demi Bold here too.
 *
 * Spacing needs no override: metro.config.js sets `inlineRem: 16`, the web's
 * root size, so `p-4` is 16px on both.
 */
const brandGreen = {
  50: '#F0FDF4',
  100: '#DCFCE7',
  200: '#B9F8CF',
  300: '#74E5A0',
  400: '#2FD46E',
  500: '#00C950',
  600: '#00A63E',
  700: '#008236',
  800: '#096B30',
  900: '#0C4F28',
  950: '#052E16',
};

module.exports = {
  darkMode: 'class',
  // packages/core included: its colorSystem/needsAttention helpers return
  // ready-made class strings (accentStyles, PLAN_NEUTRAL, ...), and a class
  // Tailwind never sees in `content` is never generated.
  content: ['./App.tsx', './src/**/*.{js,jsx,ts,tsx}', '../../packages/core/lib/**/*.ts'],
  presets: [require('nativewind/preset')],
  theme: {
    extend: {
      // The actual web font — app/globals.css's --font-sans. "Avenir Next" is
      // an iOS/macOS system font, so no custom font file/linking is needed.
      fontFamily: {
        sans: ['Avenir Next'],
      },
      fontWeight: {
        bold: '600',
        extrabold: '600',
        black: '600',
      },
      fontSize: {
        micro: '10px',
        label: '11px',
        caption: '12px',
        body: '13px',
        bodylg: '14px',
        title: '15px',
        subtitle: '16px',
        lead: '18px',
        headline: '20px',
        display: '28px',
      },
      colors: {
        green: brandGreen,
        emerald: brandGreen,
        'momentum-green': '#00A63E',
        'momentum-green-accent': '#2FD46E',
        'streak-green': '#00C950',
        'green-pressed': '#008236',
        ink: '#0A0A0A',
        'ink-soft': '#171717',
        'surface-light': '#FAFAFA',
        'surface-dark': '#0A0A0A',
        'card-dark': '#171717',
        muted: '#737373',
        danger: '#FB2C36',
        'at-risk': '#E17100',
        info: '#155DFC',
      },
      borderRadius: {
        xs: '2px',
        sm: '4px',
        'pr-sm': '6px',
      },
      // Tailwind v4 accepts any integer opacity modifier (`bg-amber-500/12`);
      // v3 only knows its 5-step scale and silently emits nothing for the rest,
      // which left those surfaces transparent. Every integer, like v4.
      opacity: Object.fromEntries(Array.from({ length: 101 }, (_, i) => [String(i), String(i / 100)])),
    },
  },
  plugins: [],
};
