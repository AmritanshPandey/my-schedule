import type { ReactNode } from 'react';
import { ScrollView, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import Header from './Header';

/**
 * Shared page shell — header + scrollable body on the off-white/off-black
 * mobile-shell background, matching IOSScheduleApp.tsx's `<main>` +
 * `IOSHeader` pairing. Bottom padding clears the floating tab bar.
 *
 * Notes/Settings buttons navigate to the stack-level screens registered in
 * RootNavigator — every tab screen gets them for free. `onCreate` is opt-in
 * per screen (Today/Routine/Plans/Tracking each open their own "new X" flow).
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
  const navigation = useNavigation();

  return (
    <View className="flex-1 bg-[#F3F4F1] dark:bg-[#0E0E0E]">
      <Header
        title={title}
        onNotes={() => navigation.navigate('Notes' as never)}
        onSettings={() => navigation.navigate('Settings' as never)}
        onCreate={onCreate}
        createLabel={createLabel}
      />
      <ScrollView
        className="flex-1"
        contentContainerClassName="gap-3 px-4 pt-4"
        contentContainerStyle={{ paddingBottom: 140 }}
      >
        {children}
      </ScrollView>
    </View>
  );
}
