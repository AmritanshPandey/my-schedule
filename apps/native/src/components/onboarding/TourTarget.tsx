import { useCallback, type ComponentRef, type ReactNode } from 'react';
import { View, type StyleProp, type ViewStyle } from 'react-native';
import { registerTourTarget } from '../../lib/onboarding/tourTargets';

/** Marks a view as a coach-mark target — the native `data-tour="<id>"`. */
export default function TourTarget({ id, children, className, style }: { id: string; children: ReactNode; className?: string; style?: StyleProp<ViewStyle> }) {
  const ref = useCallback((view: ComponentRef<typeof View> | null) => registerTourTarget(id, view), [id]);
  return (
    <View ref={ref} collapsable={false} className={className} style={style}>
      {children}
    </View>
  );
}
