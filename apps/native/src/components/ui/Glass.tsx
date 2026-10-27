import { View, type ViewProps } from 'react-native';
import { cssInterop, useColorScheme } from 'nativewind';
import { LiquidGlassContainerView, LiquidGlassView, isLiquidGlassSupported } from '@callstack/liquid-glass';

/**
 * The floating-chrome material — native counterpart of the web's
 * `.liquid-glass` (app/globals.css). On iOS 26+ this is UIKit's own
 * UIGlassEffect: it refracts what scrolls beneath it, shifts light/dark with
 * that content, and honors Reduce Transparency with no work here. Below iOS 26
 * (and on Android) it is the solid translucent surface the app used before, so
 * labels keep their contrast.
 *
 * For genuinely floating chrome only (DESIGN.md §4): the tab bar and header
 * controls. Each glass view is a live compositor effect — keep them few and
 * small, never on list rows or cards.
 */

export { isLiquidGlassSupported };

// Third-party host components need NativeWind told that className is style.
cssInterop(LiquidGlassView, { className: 'style' });
cssInterop(LiquidGlassContainerView, { className: 'style' });

/** Fallback surface where the system material isn't available. */
const FALLBACK = 'border border-neutral-200/70 bg-white/95 dark:border-white/[0.09] dark:bg-neutral-900/95';

interface GlassProps extends ViewProps {
  className?: string;
  /** Grows and shimmers under the finger — for a single tappable control. */
  interactive?: boolean;
}

export function Glass({ className = '', interactive, ...props }: GlassProps) {
  // Follow the app's theme, which can be set apart from the system's.
  const { colorScheme } = useColorScheme();
  if (!isLiquidGlassSupported) return <View {...props} className={`${FALLBACK} ${className}`} />;
  return <LiquidGlassView {...props} effect="regular" interactive={interactive} colorScheme={colorScheme === 'dark' ? 'dark' : 'light'} className={className} />;
}

/**
 * Groups neighbouring glass views so they render in one pass and melt into
 * each other when they get close, the way iOS's own toolbar buttons do. A
 * plain View when the material isn't available.
 */
export function GlassGroup({ spacing = 8, ...props }: ViewProps & { className?: string; spacing?: number }) {
  if (!isLiquidGlassSupported) return <View {...props} />;
  return <LiquidGlassContainerView {...props} spacing={spacing} />;
}
