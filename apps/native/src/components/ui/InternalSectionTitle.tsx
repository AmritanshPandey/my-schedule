import { memo, type ReactNode } from 'react';
import { Pressable, View } from 'react-native';
import { SectionTitle } from './Typography';
import { Text } from './Text';

/** Native port of components/ui/InternalSectionTitle.tsx. */
export function SectionIconButton({
  icon,
  saveIcon,
  saving = false,
  onClick,
  label,
}: {
  icon: ReactNode;
  saveIcon?: ReactNode;
  saving?: boolean;
  onClick: () => void;
  label?: string;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onClick}
      className={`h-[34px] w-[34px] items-center justify-center rounded-[9px] active:scale-[0.88] ${
        saving ? 'bg-neutral-950 dark:bg-white' : 'active:bg-neutral-100 dark:active:bg-white/[0.06]'
      }`}
    >
      {saving && saveIcon ? saveIcon : icon}
    </Pressable>
  );
}

export function SectionTextAction({ label, icon, onClick }: { label: string; icon?: ReactNode; onClick: () => void }) {
  return (
    <Pressable accessibilityRole="button" onPress={onClick} className="flex-row items-center gap-1.5">
      {icon}
      <Text className="text-[13px] font-semibold text-neutral-500 dark:text-neutral-400">{label}</Text>
    </Pressable>
  );
}

function InternalSectionTitleInner({
  title,
  actions,
  tabs,
  className = '',
}: {
  title: string;
  actions?: ReactNode;
  tabs?: ReactNode;
  className?: string;
}) {
  return (
    <View className={className}>
      <View className="flex-row items-center justify-between gap-3">
        <SectionTitle>{title}</SectionTitle>
        {actions && <View className="shrink-0 flex-row items-center gap-1">{actions}</View>}
      </View>
      {tabs && <View className="mt-3">{tabs}</View>}
    </View>
  );
}

export const InternalSectionTitle = memo(InternalSectionTitleInner);
