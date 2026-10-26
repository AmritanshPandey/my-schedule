import { View } from 'react-native';
import { IconX } from '@tabler/icons-react-native';
import { Eyebrow, SheetTitle } from './Typography';
import { ICON, Icon } from './Icon';
import IconButton, { ICON_BUTTON_TONE } from './IconButton';

interface SheetHeaderProps {
  eyebrow: string;
  title: string;
  onClose: () => void;
  className?: string;
}

/** Native port of components/ui/SheetHeader.tsx. */
export default function SheetHeader({ eyebrow, title, onClose, className = '' }: SheetHeaderProps) {
  return (
    <View className={`flex-row items-start justify-between gap-3 ${className}`}>
      <View className="min-w-0 flex-1">
        <Eyebrow>{eyebrow}</Eyebrow>
        <SheetTitle className="mt-0.5">{title}</SheetTitle>
      </View>
      <IconButton label="Close" variant="outline" size="sm" radius="xl" onPress={onClose}>
        <Icon icon={IconX} {...ICON.ui} className={ICON_BUTTON_TONE.outline} />
      </IconButton>
    </View>
  );
}
