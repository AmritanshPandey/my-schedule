"use client";

/**
 * Combined "log a meal" entry — one form for Calories/Protein/Carbs/Fat
 * instead of opening AddEntryModal four separate times. Writes ordinary
 * MetricEntry rows under the Wellness plan's trackers (see lib/wellness.ts);
 * no MetricEntry schema change.
 *
 * Deliberately no meal-name/label field: MetricEntry has no text field, and
 * normalizeMetricEntry (lib/useScheduleDB.ts) whitelists an exact key set —
 * anything extra would silently vanish on the next reload.
 */
import { useState } from "react";
import { IconCheck } from "@tabler/icons-react";
import BottomSheet from "@/components/ui/BottomSheet";
import SheetHeader from "@/components/ui/SheetHeader";
import Button from "@/components/ui/Button";
import Input from "@/components/ui/Input";
import { todayISO } from "@/lib/dateUtils";
import type { MealInput } from "@/lib/wellness";

interface LogMealSheetProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (input: MealInput) => void;
}

const FIELDS: { key: "calories" | "protein" | "carbs" | "fat"; label: string }[] = [
  { key: "calories", label: "Calories (kcal)" },
  { key: "protein", label: "Protein (g)" },
  { key: "carbs", label: "Carbs (g)" },
  { key: "fat", label: "Fat (g)" },
];

export default function LogMealSheet({ isOpen, onClose, onSave }: LogMealSheetProps) {
  const [date, setDate] = useState(todayISO);
  const [values, setValues] = useState<Record<string, string>>({});

  function reset() {
    setValues({});
    setDate(todayISO());
  }

  function handleClose() {
    reset();
    onClose();
  }

  function parsed(key: string): number | undefined {
    const raw = values[key];
    if (!raw) return undefined;
    const num = parseFloat(raw);
    return Number.isFinite(num) && num > 0 ? num : undefined;
  }

  const hasAnyValue = FIELDS.some((f) => parsed(f.key) !== undefined);

  function handleSave() {
    if (!hasAnyValue || !date) return;
    onSave({
      dateISO: date,
      calories: parsed("calories"),
      protein: parsed("protein"),
      carbs: parsed("carbs"),
      fat: parsed("fat"),
    });
    reset();
    onClose();
  }

  return (
    <BottomSheet open={isOpen} onClose={handleClose} maxHeight="85vh">
      <div className="space-y-4 px-5 pb-8 pt-4">
        <SheetHeader eyebrow="Log" title="Log a Meal" onClose={handleClose} />

        <div className="grid grid-cols-2 gap-3">
          {FIELDS.map((field, i) => (
            <Input
              key={field.key}
              label={field.label}
              type="number"
              inputMode="decimal"
              value={values[field.key] ?? ""}
              onChange={(e) => setValues((v) => ({ ...v, [field.key]: e.target.value }))}
              onKeyDown={(e) => { if (e.key === "Enter") handleSave(); }}
              placeholder="0"
              autoFocus={i === 0}
            />
          ))}
        </div>

        <Input
          label="Date"
          type="date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
        />

        <Button fullWidth onClick={handleSave} disabled={!hasAnyValue}>
          <IconCheck size={16} strokeWidth={2.5} />
          Save Meal
        </Button>
      </div>
    </BottomSheet>
  );
}
