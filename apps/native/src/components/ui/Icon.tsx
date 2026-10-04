import type { ComponentType } from 'react';
import type { StyleProp, ViewStyle } from 'react-native';
import { cssInterop, useColorScheme } from 'nativewind';

// ── Icon scale ────────────────────────────────────────────────────────────────
// Native port of components/ui/Icon.tsx — the same sizes and stroke weights.

export const ICON = {
  /** Bottom nav, tab bar */
  nav: { size: 20, strokeWidth: 2 },
  /** Primary CTAs — add/create buttons */
  action: { size: 18, strokeWidth: 2.5 },
  /** Standard UI controls — edit, delete, close, chevron */
  ui: { size: 16, strokeWidth: 2 },
  /** Decorative or secondary icons — eyebrow icons, status indicators */
  subtle: { size: 16, strokeWidth: 1.8 },
  /** Alongside body text */
  inline: { size: 14, strokeWidth: 2 },
  /** Small badges, status dots */
  badge: { size: 12, strokeWidth: 2 },
  /** Empty-state illustrations */
  hero: { size: 36, strokeWidth: 1.4 },
} as const;

export type IconVariant = keyof typeof ICON;

/** Any @tabler/icons-react-native icon. */
export type TablerIcon = ComponentType<{ size?: number; strokeWidth?: number; color?: string; style?: StyleProp<ViewStyle> }>;

interface IconProps {
  icon: TablerIcon;
  size?: number;
  strokeWidth?: number;
  /** Explicit color; otherwise taken from the className's `text-*` color. */
  color?: string;
  className?: string;
  style?: StyleProp<ViewStyle>;
}

/**
 * Renders a Tabler icon whose color comes from a `text-*` class — the way
 * every icon on the web gets it (`<IconX className="text-neutral-500
 * dark:text-neutral-400" />`, or by inheriting the button's text color).
 * NativeWind resolves the class (dark variant included) and hands the color
 * to the SVG as a prop. One interop registration covers every icon.
 */
function IconBase({ icon: Glyph, size = 16, strokeWidth = 2, color, style }: IconProps) {
  const { colorScheme } = useColorScheme();
  // react-native-svg has no CSS cascade, so `currentColor` with nothing to
  // inherit is black — invisible in dark mode. An uncolored icon takes the
  // theme's text color instead, which is what inheriting would have given.
  return <Glyph size={size} strokeWidth={strokeWidth} color={color ?? (colorScheme === 'dark' ? '#FFFFFF' : '#0A0A0A')} style={style} />;
}

cssInterop(IconBase, {
  className: { target: 'style', nativeStyleToProp: { color: true } },
});

export const Icon = IconBase;

/** Web's AppIcon wrapper: an icon at a named scale step. */
export function AppIcon({
  icon,
  variant = 'ui',
  size,
  strokeWidth,
  className,
}: {
  icon: TablerIcon;
  variant?: IconVariant;
  size?: number;
  strokeWidth?: number;
  className?: string;
}) {
  const defaults = ICON[variant];
  return <Icon icon={icon} size={size ?? defaults.size} strokeWidth={strokeWidth ?? defaults.strokeWidth} className={className} />;
}
