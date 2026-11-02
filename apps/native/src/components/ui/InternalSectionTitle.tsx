import { memo, type ReactNode } from 'react';
import { View } from 'react-native';
import { SectionTitle } from './Typography';
import Button from './Button';
import IconButton from './IconButton';

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
    <IconButton label={label ?? ''} variant="ghost" size="md" selected={saving} onPress={onClick}>
      {saving && saveIcon ? saveIcon : icon}
    </IconButton>
  );
}

export function SectionTextAction({ label, icon, onClick }: { label: string; icon?: ReactNode; onClick: () => void }) {
  return (
    <Button variant="ghost" size="sm" onPress={onClick} icon={icon}>
      {label}
    </Button>
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
