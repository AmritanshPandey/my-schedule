/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: 'class',
  content: ['./App.tsx', './src/**/*.{js,jsx,ts,tsx}'],
  presets: [require('nativewind/preset')],
  theme: {
    extend: {
      // The actual web font — app/globals.css's --font-sans, not DESIGN.md's
      // frontmatter (which still says "Nunito"; that's stale, the app moved
      // to Avenir Next and the doc was never updated). "Avenir Next" is an
      // iOS/macOS system font, so no custom font file/linking is needed here
      // — RN just needs the family name and it resolves from the OS. Applied
      // as the default `sans` so every existing `font-*` weight class picks
      // it up without touching each screen.
      fontFamily: {
        sans: ['Avenir Next'],
      },
      // Mirrors DESIGN.md's token list (`colors:` frontmatter) — the same
      // values app/globals.css defines as CSS variables for the web app.
      colors: {
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
        // Category accents (lib/colorSystem.ts's CATEGORY_HEX) — timeline
        // blocks and plan icons only, never general UI chrome.
        'cat-orange': '#FF6900',
        'cat-lime': '#5EA500',
        'cat-blue': '#155DFC',
        'cat-amber': '#E17100',
        'cat-pink': '#EC003F',
        'cat-purple': '#AD46FF',
        'cat-cyan': '#00A6F4',
      },
      borderRadius: {
        sm: '6px',
        md: '12px',
        lg: '16px',
        xl: '24px',
      },
    },
  },
  plugins: [],
};
