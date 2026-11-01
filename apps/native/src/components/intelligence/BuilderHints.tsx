import { View } from 'react-native';
import { IconAlertTriangle, IconBulb } from '@tabler/icons-react-native';
import type { BuilderHint } from '@planr/core/lib/intelligence/builderChecks';
import { haptic } from '../../lib/haptics';
import { SOFT_PANEL } from '../ui/surfaces';
import Button from '../ui/Button';
import { Icon } from '../ui/Icon';
import { Text } from '../ui/Text';

/**
 * Native port of components/intelligence/BuilderHints.tsx — advisory notes
 * under a goal / milestone / task form, from the same deterministic checks
 * (@planr/core/lib/intelligence/builderChecks). Never blocks saving, renders
 * nothing when there is nothing worth saying.
 */
export default function BuilderHints({
  hints,
  onAction,
  className = '',
}: {
  hints: BuilderHint[];
  /** Called with the hint whose one-tap fix was pressed. */
  onAction?: (hint: BuilderHint) => void;
  className?: string;
}) {
  if (hints.length === 0) return null;

  return (
    <View accessibilityLiveRegion="polite" className={`${SOFT_PANEL} px-3.5 ${className}`}>
      {hints.map((hint, index) => {
        const warn = hint.tone === 'warn';
        return (
          <View
            key={hint.id}
            className={`flex-row items-start gap-2.5 py-2.5 ${index > 0 ? 'border-t border-neutral-200/70 dark:border-white/[0.06]' : ''}`}
          >
            <Icon
              icon={warn ? IconAlertTriangle : IconBulb}
              size={15}
              strokeWidth={2}
              // amber-700 rather than 500: AA at 12-13px on the light panel.
              className={`mt-0.5 shrink-0 ${warn ? 'text-amber-700 dark:text-amber-400' : 'text-neutral-500 dark:text-neutral-400'}`}
            />
            <View className="min-w-0 flex-1">
              <Text className="text-[13px] font-medium leading-snug text-neutral-700 dark:text-neutral-200">{hint.message}</Text>
              {hint.action && onAction && (
                <Button
                  variant="secondary"
                  // md, not sm: 44pt is the floor for a tap target.
                  size="md"
                  onPress={() => {
                    haptic('light');
                    onAction(hint);
                  }}
                  className="mt-1.5 self-start"
                >
                  {hint.action.label}
                </Button>
              )}
            </View>
          </View>
        );
      })}
    </View>
  );
}
