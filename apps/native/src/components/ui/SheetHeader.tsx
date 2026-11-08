import { useContext, useEffect, useLayoutEffect, useRef, type ReactNode } from 'react';
import { Pressable, View } from 'react-native';
import { IconX } from '@tabler/icons-react-native';
import { Icon } from './Icon';
import { Text } from './Text';
import { Glass, isLiquidGlassSupported } from './Glass';
import { SheetHeaderSlotContext } from './BottomSheet';

interface SheetHeaderProps {
  eyebrow: string;
  title: string;
  onClose: () => void;
  /** Glass actions on the right (a refresh, an info button), balancing the close button. */
  right?: ReactNode;
  className?: string;
}

/**
 * Native port of components/ui/SheetHeader.tsx, laid out the way iOS's own
 * sheets are: a round close button on the left, one centered title level
 * with it, room for actions on the right, and clear space under the
 * grabber. The eyebrow ("Edit routine") isn't drawn, since a second line
 * crowded the top of the sheet; it stays as the screen-reader hint. On iOS
 * 26+ the buttons are liquid glass.
 */
export default function SheetHeader({ eyebrow, title, onClose, right, className = '' }: SheetHeaderProps) {
  // Wide enough for the close button, or for right-side actions when there are any.
  const side = right ? 'w-[88px]' : 'w-12';
  const slot = useContext(SheetHeaderSlotContext);
  const id = useRef(Symbol('sheet-header')).current;
  const header = (
    <View className={`mt-3 mb-2 min-h-[48px] flex-row items-center ${className}`}>
      {/* Equal side columns keep the title centered on the sheet, not between the buttons. */}
      <View className={`${side} flex-row items-center`}>
        <Pressable accessibilityRole="button" accessibilityLabel="Close" onPress={onClose} hitSlop={4} className="active:scale-[0.94]">
          {isLiquidGlassSupported ? (
            <Glass interactive className="h-11 w-11 items-center justify-center rounded-full">
              <Icon icon={IconX} size={20} strokeWidth={2} className="text-neutral-900 dark:text-white" />
            </Glass>
          ) : (
            <View className="h-11 w-11 items-center justify-center rounded-full border border-neutral-200 bg-white dark:border-white/10 dark:bg-neutral-800">
              <Icon icon={IconX} size={20} strokeWidth={2} className="text-neutral-900 dark:text-white" />
            </View>
          )}
        </Pressable>
      </View>
      <View className="min-w-0 flex-1 items-center px-1">
        <Text accessibilityRole="header" accessibilityHint={eyebrow} numberOfLines={2} className="text-center text-[17px] font-bold tracking-[-0.2px] text-neutral-950 dark:text-white">
          {title}
        </Text>
      </View>
      <View className={`${side} flex-row items-center justify-end`}>{right}</View>
    </View>
  );

  // In a native sheet the header lives in the sheet's fixed header, so it stays
  // put while the body scrolls (BottomSheet); republished so it stays current.
  useLayoutEffect(() => {
    slot?.set(id, header);
  });
  useEffect(() => () => slot?.set(id, null), [slot, id]);

  return slot ? null : header;
}
