import { memo } from 'react';
import { Pressable, ScrollView } from 'react-native';
import { Text } from './Text';

/** Native port of components/ui/TrackerTabs.tsx. */
function TrackerTabsInner({ tabs, activeId, onChange }: { tabs: { id: string; label: string }[]; activeId: string; onChange: (id: string) => void }) {
  if (tabs.length <= 1) return null;
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerClassName="gap-1.5 pb-0.5">
      {tabs.map((tab) => {
        const isActive = tab.id === activeId;
        return (
          <Pressable
            key={tab.id}
            accessibilityRole="tab"
            accessibilityState={{ selected: isActive }}
            onPress={() => onChange(tab.id)}
            className={`min-h-[44px] flex-none items-center justify-center rounded-[13px] px-[18px] py-[9px] active:scale-[0.94] ${
              isActive ? 'bg-neutral-950 dark:bg-white' : 'border-[1.5px] border-neutral-200 dark:border-white/10'
            }`}
          >
            <Text
              className={`text-[14px] font-semibold tracking-[-0.15px] ${
                isActive ? 'text-white dark:text-neutral-950' : 'text-neutral-500 dark:text-neutral-400'
              }`}
            >
              {tab.label}
            </Text>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

export const TrackerTabs = memo(TrackerTabsInner);
