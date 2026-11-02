import { useRef, type ReactNode } from 'react';
import { View } from 'react-native';
import BottomSheet from './BottomSheet';
import Button from './Button';
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
  // The confirmed action runs once the sheet is off screen. Run first, it
  // often unmounts this sheet's owner (a deleted note's editor), and a sheet
  // unmounted mid-presentation stays stuck on screen.
  // Held from the moment of the tap: it still sees the state the caller's
  // onClose is about to clear (a pending backup, a pending id).
  const confirmed = useRef<(() => void) | null>(null);
  function handleConfirm() {
    confirmed.current = onConfirm;
    onClose();
  }

  return (
    <BottomSheet
      open={open}
      onClose={onClose}
      onDismissed={() => {
        const run = confirmed.current;
        confirmed.current = null;
        run?.();
      }}
    >
      {/* Same clearance under the grabber as SheetHeader gives the other sheets. */}
      <View className="px-5 pb-8 pt-5">
        <Text className="mb-1 text-[18px] font-bold text-neutral-900 dark:text-white">{title}</Text>
        {description && <Text className="mb-6 text-[14px] leading-relaxed text-neutral-500 dark:text-neutral-400">{description}</Text>}
        {!description && <View className="mb-6" />}

        {actions ?? (
          <View className="flex-row gap-3">
            <Button variant="secondary" onPress={onClose} className="flex-1">
              Cancel
            </Button>
            <Button variant="destructive" onPress={handleConfirm} className="flex-1">
              {confirmLabel}
            </Button>
          </View>
        )}
      </View>
    </BottomSheet>
  );
}
