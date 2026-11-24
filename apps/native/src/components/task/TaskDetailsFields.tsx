import { View } from 'react-native';
import type { ProgressTracker } from '@planr/core/lib/scheduleTypes';
import type { TaskFieldDef, TaskFieldTemplate } from '@planr/core/lib/taskFields';
import Input, { FORM_LABEL, Textarea } from '../ui/Input';
import DateInput from '../ui/DateInput';
import { ChipRow, ChoiceChip } from '../ui/FormChips';
import { typography } from '../ui/Typography';
import { Text } from '../ui/Text';

const SUFFIX: Partial<Record<TaskFieldDef['type'], string>> = { minutes: 'min', percent: '%' };

/**
 * Native port of components/task/TaskDetailsFields.tsx: the category-specific
 * fields of a task (lib/taskFields.ts), as form inputs. Values are the raw
 * typed strings; TaskSheet converts them on save. Every field is optional.
 */
export default function TaskDetailsFields({
  template,
  values,
  onChange,
  trackers,
}: {
  template: TaskFieldTemplate;
  values: Record<string, string>;
  onChange: (key: string, value: string) => void;
  /** The plan's trackers, for a Finance task's "Log amount to". */
  trackers: readonly ProgressTracker[];
}) {
  return (
    <View className="gap-4" testID="task-details-fields">
      <Text className={typography.eyebrow}>{template.label} details</Text>
      {template.fields.map((def) => {
        const value = values[def.key] ?? '';
        const set = (v: string) => onChange(def.key, v);
        switch (def.type) {
          case 'longtext':
            return <Textarea key={def.key} label={def.label} value={value} onChangeText={set} placeholder={def.placeholder} />;
          case 'date':
            return (
              <View key={def.key}>
                <Text className={FORM_LABEL}>{def.label}</Text>
                <DateInput value={value} onChange={set} placeholder={def.placeholder ?? 'Optional'} clearable />
              </View>
            );
          case 'select':
            return (
              <ChipRow key={def.key} label={def.label}>
                {def.options!.map((option) => (
                  <ChoiceChip key={option} active={value === option} label={option} onPress={() => set(value === option ? '' : option)} />
                ))}
              </ChipRow>
            );
          case 'tracker':
            if (trackers.length === 0) return null;
            return (
              <ChipRow key={def.key} label={def.label}>
                <ChoiceChip active={!value} label="Don't log" onPress={() => set('')} />
                {trackers.map((t) => (
                  <ChoiceChip key={t.id} active={value === t.id} label={t.title} onPress={() => set(t.id)} />
                ))}
              </ChipRow>
            );
          case 'number':
          case 'minutes':
          case 'money':
          case 'percent': {
            const suffix = SUFFIX[def.type];
            return (
              <Input
                key={def.key}
                label={suffix ? `${def.label} (${suffix})` : def.label}
                keyboardType={def.type === 'money' ? 'decimal-pad' : 'number-pad'}
                value={value}
                onChangeText={(raw) => set(raw.replace(',', '.'))}
                placeholder={def.placeholder}
                autoComplete="off"
              />
            );
          }
          default:
            return <Input key={def.key} label={def.label} value={value} onChangeText={set} placeholder={def.placeholder} autoComplete="off" />;
        }
      })}
    </View>
  );
}
