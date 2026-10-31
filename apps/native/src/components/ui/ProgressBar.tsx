import { useCallback, useEffect, useRef, useState } from 'react';
import { Animated, Easing, View, type LayoutChangeEvent } from 'react-native';
import { useReducedMotion } from '../../lib/useReducedMotion';

interface ProgressBarProps {
  pct: number;
  height?: number;
  fillClassName?: string;
  fillColor?: string;
  rounded?: string;
  minVisible?: boolean;
  animate?: boolean;
  animateOnMount?: boolean;
  className?: string;
  trackClassName?: string;
}

/**
 * Native port of components/ui/ProgressBar.tsx — the one progress bar.
 *
 * The fill is the track's full width, slid left by the unfilled share
 * (`translateX`), rather than an animated `width`: width can't run on the
 * native driver, so every bar's animation would tick on the JS thread, and
 * one task toggle animates several bars at once. The track's rounded,
 * clipped edge stands in for the fill's left end, so it reads the same.
 */
export default function ProgressBar({
  pct,
  height = 6,
  fillClassName = 'bg-emerald-500',
  fillColor,
  rounded = 'rounded-full',
  minVisible = true,
  animate = true,
  animateOnMount = false,
  className = '',
  trackClassName = '',
}: ProgressBarProps) {
  const clamped = Math.max(0, Math.min(100, pct));
  const width = clamped <= 0 ? 0 : minVisible ? Math.max(clamped, 6) : clamped;
  const value = useRef(new Animated.Value(animateOnMount ? 0 : width)).current;
  const [trackWidth, setTrackWidth] = useState(0);
  const reducedMotion = useReducedMotion();

  useEffect(() => {
    if (!animate || reducedMotion) {
      value.setValue(width);
      return;
    }
    Animated.timing(value, { toValue: width, duration: 450, easing: Easing.out(Easing.cubic), useNativeDriver: true }).start();
  }, [animate, reducedMotion, value, width]);

  const onLayout = useCallback((e: LayoutChangeEvent) => setTrackWidth(e.nativeEvent.layout.width), []);

  return (
    <View
      className={`relative w-full overflow-hidden bg-neutral-200 dark:bg-white/10 ${rounded} ${trackClassName} ${className}`}
      style={{ height }}
      onLayout={onLayout}
    >
      <Animated.View
        style={{
          position: 'absolute',
          top: 0,
          bottom: 0,
          left: 0,
          width: '100%',
          // Hidden until the track is measured, so it never flashes full.
          opacity: trackWidth > 0 ? 1 : 0,
          transform: [{ translateX: value.interpolate({ inputRange: [0, 100], outputRange: [-trackWidth, 0] }) }],
        }}
      >
        <View className={`flex-1 ${rounded} ${fillColor ? '' : fillClassName}`} style={fillColor ? { backgroundColor: fillColor } : undefined} />
      </Animated.View>
    </View>
  );
}
