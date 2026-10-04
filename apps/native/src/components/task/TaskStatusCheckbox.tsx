import { Pressable } from 'react-native';
import { IconMinus, IconX } from '@tabler/icons-react-native';
import { taskStatusLabel, type TaskState } from '@planr/core/lib/taskCompletion';
import CheckDraw from '../ui/CheckDraw';
import { Icon } from '../ui/Icon';

const sizeClasses = {
  sm: 'h-6 w-6 rounded-pr-sm',
  md: 'h-7 w-7 rounded-lg',
} as const;

/** Native port of components/task/TaskStatusCheckbox.tsx. */
export default function TaskStatusCheckbox({
  state,
  checked,
  size = 'sm',
  readOnly = false,
  label,
  onClick,
}: {
  state: TaskState;
  checked?: boolean;
  size?: 'sm' | 'md';
  readOnly?: boolean;
  label: string;
  onClick?: () => void;
}) {
  const done = checked ?? state === 'completed';
  const partial = !checked && state === 'partial';
  const missed = !done && state === 'missed';
  const effectiveState: TaskState = done ? 'completed' : missed ? 'missed' : partial ? 'partial' : 'incomplete';
  const statusLabel = taskStatusLabel(effectiveState, readOnly, readOnly ? undefined : label);

  return (
    <Pressable
      disabled={readOnly}
      accessibilityRole="checkbox"
      accessibilityLabel={statusLabel}
      accessibilityState={{ checked: done ? true : partial ? 'mixed' : false, disabled: readOnly }}
      hitSlop={10}
      onPress={() => {
        if (!readOnly) onClick?.();
      }}
      className={`shrink-0 items-center justify-center border-2 ${sizeClasses[size]} ${readOnly ? '' : 'active:scale-95'} ${
        done || partial
          ? 'border-transparent bg-green-600'
          : missed
            ? 'border-transparent bg-rose-500'
            : readOnly
              ? 'border-neutral-200 bg-neutral-100/80 dark:border-white/[0.08] dark:bg-white/[0.04]'
              : 'border-green-600/70 bg-transparent dark:border-green-500/70'
      }`}
    >
      <CheckDraw visible={done} size={14} strokeWidth={3} className="text-white" />
      {partial && <Icon icon={IconMinus} size={14} strokeWidth={3} className="text-white" />}
      {missed && <Icon icon={IconX} size={14} strokeWidth={3} className="text-white" />}
    </Pressable>
  );
}
