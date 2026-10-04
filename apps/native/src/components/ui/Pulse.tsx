import { useEffect, useRef, type ReactNode } from 'react';
import { AccessibilityInfo, Animated } from 'react-native';

/**
 * The web's `motion-safe:animate-pulse` / `animate-status-pulse` — the app's
 * calm "alive" signal for the current task. Opacity breathing on RN's
 * Animated (NativeWind's animation classes would need Reanimated), and still
 * when the user has Reduce Motion on, like `motion-safe:`.
 */
export default function Pulse({ children, min = 0.45, duration = 1000 }: { children: ReactNode; min?: number; duration?: number }) {
  const opacity = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    let loop: Animated.CompositeAnimation | null = null;
    let cancelled = false;
    void AccessibilityInfo.isReduceMotionEnabled().then((reduced) => {
      if (cancelled || reduced) return;
      loop = Animated.loop(
        Animated.sequence([
          Animated.timing(opacity, { toValue: min, duration, useNativeDriver: true }),
          Animated.timing(opacity, { toValue: 1, duration, useNativeDriver: true }),
        ]),
      );
      loop.start();
    });
    return () => {
      cancelled = true;
      loop?.stop();
    };
  }, [duration, min, opacity]);

  return <Animated.View style={{ opacity }}>{children}</Animated.View>;
}
