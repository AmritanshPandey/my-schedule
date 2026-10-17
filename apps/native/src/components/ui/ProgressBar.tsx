import { useEffect, useRef } from 'react';
import { Animated, View } from 'react-native';

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
 * Native port of components/ui/ProgressBar.tsx — the one progress bar. Width
 * animates with RN's Animated (the web uses framer's data transition).
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

  useEffect(() => {
    if (!animate) {
      value.setValue(width);
      return;
    }
    Animated.timing(value, { toValue: width, duration: 450, useNativeDriver: false }).start();
  }, [animate, value, width]);

  return (
    <View
      className={`relative w-full overflow-hidden bg-neutral-200 dark:bg-white/10 ${rounded} ${trackClassName} ${className}`}
      style={{ height }}
    >
      <Animated.View
        style={{
          position: 'absolute',
          top: 0,
          bottom: 0,
          left: 0,
          width: value.interpolate({ inputRange: [0, 100], outputRange: ['0%', '100%'] }),
        }}
      >
        <View className={`flex-1 ${rounded} ${fillColor ? '' : fillClassName}`} style={fillColor ? { backgroundColor: fillColor } : undefined} />
      </Animated.View>
    </View>
  );
}
