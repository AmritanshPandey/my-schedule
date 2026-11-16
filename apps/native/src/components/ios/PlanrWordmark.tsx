import { View } from 'react-native';
import Svg, { Rect } from 'react-native-svg';
import { useColorScheme } from 'nativewind';
import { Text } from '../ui/Text';

/**
 * The planr. wordmark — three descending bars and the name — at the top of
 * the main tabs. Native twin of components/ios/PlanrWordmark.tsx.
 */
export default function PlanrWordmark() {
  const { colorScheme } = useColorScheme();
  const ink = colorScheme === 'dark' ? '#FFFFFF' : '#0A0A0A';
  return (
    <View accessible accessibilityLabel="planr." className="flex-row items-center gap-2.5 pl-1">
      <Svg width={22} height={20} viewBox="0 0 22 20">
        <Rect x={0} y={0.5} width={22} height={4.5} rx={2.25} fill={ink} />
        <Rect x={0} y={7.75} width={15} height={4.5} rx={2.25} fill={ink} />
        <Rect x={0} y={15} width={8.5} height={4.5} rx={2.25} fill={ink} />
      </Svg>
      <Text className="text-[26px] font-bold tracking-[-0.8px] text-neutral-950 dark:text-white">planr.</Text>
    </View>
  );
}
