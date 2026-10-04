import type { ReactNode } from 'react';
import { Pressable, View } from 'react-native';
import BottomSheet from './BottomSheet';
import { Text } from './Text';

interface ConfirmSheetProps {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  description?: string;
  confirmLabel?: string;
  actions?: ReactNode;
}

/** Native port of components/ui/ConfirmSheet.tsx. */
export default function ConfirmSheet({
  open,
  onClose,
  onConfirm,
  title,
  description,
  confirmLabel = 'Delete',
  actions,
}: ConfirmSheetProps) {
  function handleConfirm() {
    onConfirm();
    onClose();
  }

  return (
    <BottomSheet open={open} onClose={onClose}>
      <View className="px-5 pb-8 pt-2">
        <Text className="mb-1 text-[18px] font-bold text-neutral-900 dark:text-white">{title}</Text>
        {description && <Text className="mb-6 text-[14px] leading-relaxed text-neutral-500 dark:text-neutral-400">{description}</Text>}
        {!description && <View className="mb-6" />}

        {actions ?? (
          <View className="flex-row gap-3">
            <Pressable
              accessibilityRole="button"
              onPress={onClose}
              className="flex-1 items-center rounded-2xl border border-neutral-200 bg-white py-3.5 active:scale-[0.97] active:bg-neutral-100 dark:border-white/[0.08] dark:bg-neutral-900 dark:active:bg-white/[0.07]"
            >
              <Text className="text-[16px] font-semibold text-neutral-700 dark:text-neutral-300">Cancel</Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              onPress={handleConfirm}
              className="flex-1 items-center rounded-2xl bg-rose-500 py-3.5 active:scale-[0.97] active:bg-rose-600"
            >
              <Text className="text-[16px] font-semibold text-white">{confirmLabel}</Text>
            </Pressable>
          </View>
        )}
      </View>
    </BottomSheet>
  );
}
