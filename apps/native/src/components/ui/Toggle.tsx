import { Pressable, View } from 'react-native';
import { haptic } from '../../lib/haptics';

interface ToggleProps {
  on: boolean;
  onChange: (next: boolean) => void;
  label: string;
  disabled?: boolean;
}

/** Native port of components/ui/Toggle.tsx — the app's switch control. */
export default function Toggle({ on, onChange, label, disabled = false }: ToggleProps) {
  return (
    <Pressable
      accessibilityRole="switch"
      accessibilityState={{ checked: on, disabled }}
      accessibilityLabel={label}
      disabled={disabled}
      onPress={() => {
        haptic('light');
        onChange(!on);
      }}
      className={`relative h-[26px] w-[44px] shrink-0 rounded-full ${disabled ? 'opacity-40' : ''} ${
        on ? 'bg-[#00A63E]' : 'bg-neutral-200 dark:bg-white/[0.12]'
      }`}
    >
      <View className={`absolute top-[3px] h-5 w-5 rounded-full bg-white ${on ? 'left-[21px]' : 'left-[3px]'}`} />
    </Pressable>
  );
}
