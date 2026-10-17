import { useLayoutEffect, type ReactNode } from 'react';
import { ScrollView, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';

/**
 * Shared page shell. The title and the Notes / Settings / create buttons are
 * handed to the navigator's native header (UINavigationBar) rather than drawn
 * here, so on iOS 26 they get the system's Liquid Glass bar buttons and the
 * large-title collapse for free. Body is a ScrollView with automatic content
 * insets, which is what lets the native header and tab bar sit over it and
 * pick up their scroll-edge effect.
 *
 * Notes/Settings navigate to the stack-level screens registered in
 * RootNavigator — every screen using this shell gets them. `onCreate` is
 * opt-in per screen (Today/Routine/Plans/Tracking each open their own
 * "new X" flow).
 */
export default function Screen({
  title,
  onCreate,
  createLabel,
  children,
}: {
  title: string;
  onCreate?: () => void;
  createLabel?: string;
  children: ReactNode;
}) {
  const navigation = useNavigation<NativeStackNavigationProp<Record<string, undefined>>>();

  useLayoutEffect(() => {
    navigation.setOptions({
      title,
      unstable_headerRightItems: () => [
        {
          type: 'button',
          label: 'Notes',
          icon: { type: 'image', source: require('../assets/nav-icons/bar-notes.png') },
          accessibilityLabel: 'Notes',
          onPress: () => navigation.navigate('Notes'),
        },
        {
          type: 'button',
          label: 'Settings',
          icon: { type: 'image', source: require('../assets/nav-icons/bar-settings.png') },
          accessibilityLabel: 'Settings',
          onPress: () => navigation.navigate('Settings'),
        },
        ...(onCreate
          ? [
              {
                type: 'button' as const,
                label: createLabel ?? 'Create',
                icon: { type: 'image' as const, source: require('../assets/nav-icons/bar-plus.png') },
                accessibilityLabel: createLabel ?? 'Create',
                variant: 'prominent' as const,
                tintColor: '#008236', // green-700: the shade DESIGN.md allows under white text
                onPress: onCreate,
              },
            ]
          : []),
      ],
    });
  }, [navigation, title, onCreate, createLabel]);

  return (
    <View className="flex-1 bg-[#F3F4F1] dark:bg-[#0E0E0E]">
      <ScrollView
        className="flex-1"
        contentInsetAdjustmentBehavior="automatic"
        contentContainerClassName="gap-3 px-4 pt-4"
        contentContainerStyle={{ paddingBottom: 24 }}
      >
        {children}
      </ScrollView>
    </View>
  );
}
