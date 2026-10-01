/**
 * Raw color values for places NativeWind's `className` can't reach — SVG icon
 * `color` props, mainly. Kept in sync with tailwind.config.js's `theme.extend.colors`
 * and DESIGN.md's `colors:` frontmatter by hand; there's no single source of
 * truth to generate this from yet on the native side.
 */
export const colors = {
  light: {
    ink: '#0A0A0A',
    surface: '#F3F4F1', // IOSScheduleApp.tsx's actual mobile-shell background, not the raw surface-light token
    card: '#FFFFFF',
    border: 'rgba(23, 23, 23, 0.09)', // neutral-200/70 equivalent
    text: '#0A0A0A',
    muted: '#737373',
    momentumGreen: '#00A63E',
    danger: '#FB2C36',
    atRisk: '#E17100',
    info: '#155DFC',
  },
  dark: {
    ink: '#FFFFFF',
    surface: '#0E0E0E', // IOSScheduleApp.tsx's actual mobile-shell background
    card: '#171717',
    border: 'rgba(255, 255, 255, 0.09)',
    text: '#FFFFFF',
    muted: '#A3A3A3',
    momentumGreen: '#2FD46E',
    danger: '#FB2C36',
    atRisk: '#E17100',
    info: '#155DFC',
  },
} as const;

// Widened to plain `string` per field — `typeof colors.light` alone types each
// value as its exact literal, which colors.dark's (different) literals then
// fail to satisfy wherever a variable is typed from this.
export type ThemeColors = { [K in keyof typeof colors.light]: string };
