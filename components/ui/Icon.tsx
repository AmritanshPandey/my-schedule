import type { ComponentType } from "react";

// ── Icon scale ────────────────────────────────────────────────────────────────
// Single source of truth for icon sizes and stroke weights.
// Spread onto any Tabler icon: <IconPlus {...ICON.action} />
// Or use the AppIcon wrapper: <AppIcon icon={IconPlus} variant="action" />

export const ICON = {
  /** Bottom nav, tab bar */
  nav:    { size: 20, strokeWidth: 2 },
  /** Primary CTAs — add/create buttons */
  action: { size: 18, strokeWidth: 2.5 },
  /** Standard UI controls — edit, delete, close, chevron */
  ui:     { size: 16, strokeWidth: 2 },
  /** Decorative or secondary icons — eyebrow icons, status indicators */
  subtle: { size: 16, strokeWidth: 1.8 },
  /** Alongside body text */
  inline: { size: 14, strokeWidth: 2 },
  /** Small badges, status dots */
  badge:  { size: 12, strokeWidth: 2 },
  /** Empty-state illustrations */
  hero:   { size: 36, strokeWidth: 1.4 },
} as const;

export type IconVariant = keyof typeof ICON;

// ── AppIcon wrapper ────────────────────────────────────────────────────────────

interface AppIconProps {
  icon: ComponentType<{ size?: number; strokeWidth?: number; className?: string }>;
  variant?: IconVariant;
  /** Override the size from the variant */
  size?: number;
  /** Override the strokeWidth from the variant */
  strokeWidth?: number;
  className?: string;
}

export function AppIcon({
  icon: IconComponent,
  variant = "ui",
  size,
  strokeWidth,
  className,
}: AppIconProps) {
  const defaults = ICON[variant];
  return (
    <IconComponent
      size={size ?? defaults.size}
      strokeWidth={strokeWidth ?? defaults.strokeWidth}
      className={className}
    />
  );
}
