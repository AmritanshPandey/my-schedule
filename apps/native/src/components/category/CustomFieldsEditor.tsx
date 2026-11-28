import { View } from 'react-native';
import { IconArrowDown, IconArrowUp, IconTrash } from '@tabler/icons-react-native';
import type { CustomTaskField, CustomTaskFieldType } from '@planr/core/lib/scheduleTypes';
import { CUSTOM_FIELD_LABEL_MAX, CUSTOM_FIELD_TYPES, MAX_CUSTOM_FIELDS, newCustomFieldKey, normalizeCustomFields } from '@planr/core/lib/taskFields';
import AddRowButton from '../ui/AddRowButton';
import IconButton from '../ui/IconButton';
import { ChipRow, ChoiceChip } from '../ui/FormChips';
import { FORM_INPUT_CLASS } from '../ui/Input';
import { Icon } from '../ui/Icon';
import { Text, TextInput } from '../ui/Text';

/** A field while it's being edited: choices stay raw text so typing a comma works. */
export interface CustomFieldDraft {
  key: string;
  label: string;
  type: CustomTaskFieldType;
  optionsText: string;
  role?: 'duration';
}

export function toFieldDrafts(fields: readonly CustomTaskField[] | undefined): CustomFieldDraft[] {
  return (fields ?? []).map((f) => ({ key: f.key, label: f.label, type: f.type, optionsText: (f.options ?? []).join(', '), role: f.role }));
}

export function fromFieldDrafts(drafts: readonly CustomFieldDraft[]): CustomTaskField[] {
  return normalizeCustomFields(drafts.map((d) => ({ key: d.key, label: d.label, type: d.type, options: d.optionsText.split(','), role: d.role })));
}

/** Native port of components/category/CustomFieldsEditor.tsx — a category's own task fields. */
export default function CustomFieldsEditor({ fields, onChange }: { fields: CustomFieldDraft[]; onChange: (next: CustomFieldDraft[]) => void }) {
  const update = (i: number, patch: Partial<CustomFieldDraft>) => onChange(fields.map((f, j) => (j === i ? { ...f, ...patch } : f)));
  const move = (i: number, by: -1 | 1) => {
    const next = [...fields];
    [next[i], next[i + by]] = [next[i + by], next[i]];
    onChange(next);
  };

  return (
    <View className="gap-3" testID="custom-fields-editor">
      {fields.length === 0 && (
        <Text className="text-[12px] text-neutral-500 dark:text-neutral-400">No fields yet. Add the things you want each task here to ask for.</Text>
      )}
      {fields.map((field, i) => (
        <View key={field.key} className="gap-2 rounded-2xl border border-neutral-200 p-3 dark:border-white/[0.08]">
          <View className="flex-row items-center gap-1">
            <TextInput
              value={field.label}
              maxLength={CUSTOM_FIELD_LABEL_MAX}
              onChangeText={(v) => update(i, { label: v })}
              placeholder="Field name"
              accessibilityLabel={`Field ${i + 1} name`}
              autoComplete="off"
              className={`${FORM_INPUT_CLASS} min-w-0 flex-1 px-3`}
            />
            <IconButton label={`Move ${field.label || 'field'} up`} variant="ghost" size="sm" disabled={i === 0} onPress={() => move(i, -1)}>
              <Icon icon={IconArrowUp} size={15} className="text-neutral-500 dark:text-neutral-400" />
            </IconButton>
            <IconButton label={`Move ${field.label || 'field'} down`} variant="ghost" size="sm" disabled={i === fields.length - 1} onPress={() => move(i, 1)}>
              <Icon icon={IconArrowDown} size={15} className="text-neutral-500 dark:text-neutral-400" />
            </IconButton>
            <IconButton label={`Remove ${field.label || 'field'}`} variant="destructive" size="sm" onPress={() => onChange(fields.filter((_, j) => j !== i))}>
              <Icon icon={IconTrash} size={15} className="text-neutral-500 dark:text-neutral-400" />
            </IconButton>
          </View>
          <ChipRow>
            {CUSTOM_FIELD_TYPES.map((t) => (
              <ChoiceChip key={t.type} active={field.type === t.type} label={t.label} onPress={() => update(i, { type: t.type })} />
            ))}
          </ChipRow>
          {field.type === 'select' && (
            <TextInput
              value={field.optionsText}
              onChangeText={(v) => update(i, { optionsText: v })}
              placeholder="Choices, separated by commas"
              accessibilityLabel={`Field ${i + 1} choices`}
              autoComplete="off"
              className={`${FORM_INPUT_CLASS} px-3`}
            />
          )}
          {field.type === 'minutes' && (
            <View className="flex-row">
              <ChoiceChip
                active={field.role === 'duration'}
                label="Counts toward the task's length"
                onPress={() => update(i, { role: field.role === 'duration' ? undefined : 'duration' })}
              />
            </View>
          )}
        </View>
      ))}
      {fields.length < MAX_CUSTOM_FIELDS && (
        <AddRowButton label="Add field" onClick={() => onChange([...fields, { key: newCustomFieldKey(), label: '', type: 'text', optionsText: '' }])} />
      )}
    </View>
  );
}
