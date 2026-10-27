import { Pressable } from 'react-native';
import { haptic } from '../../lib/haptics';
import CheckDraw from '../ui/CheckDraw';

interface RoutineCompletionControlProps {
  title: string;
  done: boolean;
  missed: boolean;
  onPress: () => void;
}

/**
 * Native port of components/activity/RoutineCompletionControl.tsx — the one
 * completion control every routine shares: a 44px ring you tap to say "done".
 * Whatever the routine tracks — an amount, a checklist — finishing it for the
 * day is the same single tap; the detail is reference, and how closely it was
 * followed is a separate, optional rating.
 *
 * The caller decides what a tap means (mark, open the rating, take the mark
 * back) — see RoutineRow.
 */
export default function RoutineCompletionControl({ title, done, missed, onPress }: RoutineCompletionControlProps) {
  return (
    <Pressable
      accessibilityRole="checkbox"
      accessibilityLabel={done ? `Mark ${title} not done` : missed ? `Mark ${title} done for that day` : `Mark ${title} done`}
      accessibilityState={{ checked: done }}
      onPress={() => {
        haptic(done ? 'light' : 'medium');
        onPress();
      }}
      className={`h-11 w-11 shrink-0 items-center justify-center rounded-full border-[2.5px] active:scale-[0.86] ${
        done
          ? 'border-transparent bg-green-500'
          : missed
            ? 'border-neutral-300 bg-neutral-200 dark:border-white/15 dark:bg-white/10'
            : 'border-neutral-300 bg-transparent dark:border-neutral-600'
      }`}
    >
      <CheckDraw visible={done} size={24} strokeWidth={3} className="text-white" />
    </Pressable>
  );
}
