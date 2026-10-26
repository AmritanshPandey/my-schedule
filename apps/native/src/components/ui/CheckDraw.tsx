import { useEffect, useRef } from 'react';
import { Animated } from 'react-native';
import { IconCheck } from '@tabler/icons-react-native';
import { Icon } from './Icon';

/**
 * Native port of components/ui/CheckDraw.tsx — a completion check that pops in
 * on a fresh completion and renders static when mounting already-done. (The
 * web also draws the stroke; a scale pop carries the same "just done" beat
 * without a path-length animation library.)
 */
export default function CheckDraw({
  visible,
  size = 14,
  strokeWidth = 3,
  className = 'text-white',
}: {
  visible: boolean;
  size?: number;
  strokeWidth?: number;
  className?: string;
}) {
  const wasHiddenRef = useRef(!visible);
  const scale = useRef(new Animated.Value(1)).current;
  const fresh = visible && wasHiddenRef.current;

  useEffect(() => {
    if (!fresh) return;
    scale.setValue(0.4);
    Animated.spring(scale, { toValue: 1, stiffness: 420, damping: 16, mass: 0.6, useNativeDriver: true }).start();
  }, [fresh, scale]);

  if (!visible) {
    wasHiddenRef.current = true;
    return null;
  }

  return (
    <Animated.View style={{ transform: [{ scale }] }}>
      <Icon icon={IconCheck} size={size} strokeWidth={strokeWidth} className={className} />
    </Animated.View>
  );
}
