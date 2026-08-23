"use client";

import { useState } from "react";
import { IconCheck } from "@tabler/icons-react";
import BottomSheet from "@/components/ui/BottomSheet";
import SheetHeader from "@/components/ui/SheetHeader";
import Button from "@/components/ui/Button";
import Input from "@/components/ui/Input";
import { todayISO } from "@/lib/dateUtils";

interface AddEntryModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (value: number, date: string) => void;
  metric?: { name: string; unit: string };
  /** Preset amounts (e.g. [100, 250, 500] for an "ml" tracker). Tapping a
   *  chip increments the value field rather than saving immediately, so a
   *  misfire doesn't write a bad row. Omit/empty = no chip row, unchanged
   *  behavior — see lib/quickAmounts.ts's quickAmountsForUnit. */
  quickAmounts?: number[];
  /** Today's already-logged total for this tracker, shown as a small line
   *  under the label when > 0. See lib/metricEntries.ts's sumEntriesForDate. */
  todayTotal?: number;
}

export default function AddEntryModal({ isOpen, onClose, onSave, metric, quickAmounts, todayTotal }: AddEntryModalProps) {
  const [value, setValue] = useState("");
  const [date, setDate] = useState(todayISO);

  function handleSave() {
    const num = parseFloat(value);
    if (isNaN(num) || !date) return;
    onSave(num, date);
    setValue("");
    setDate(todayISO());
    onClose();
  }

  function handleClose() {
    setValue("");
    setDate(todayISO());
    onClose();
  }

  function addQuickAmount(amount: number) {
    // Functional updater — two chip taps in quick succession must each build
    // on the other's result, not both read the same stale `value` closure.
    setValue((current) => String((parseFloat(current) || 0) + amount));
  }

  const metricLabel = metric
    ? `${metric.name}${metric.unit ? ` (${metric.unit})` : ""}`
    : "Value";

  return (
    <BottomSheet open={isOpen} onClose={handleClose} maxHeight="80vh">
      <div className="space-y-4 px-5 pb-8 pt-4">
        <SheetHeader eyebrow="Log" title="New Entry" onClose={handleClose} />

        {!!todayTotal && todayTotal > 0 && (
          <p className="text-[12px] font-medium text-neutral-400 dark:text-neutral-500">
            Today: {todayTotal}{metric?.unit ? ` ${metric.unit}` : ""}
          </p>
        )}

        <Input
          label={metricLabel}
          type="number"
          inputMode="decimal"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") handleSave(); }}
          placeholder="0"
          autoFocus
        />

        {!!quickAmounts?.length && (
          <div className="flex flex-wrap gap-1.5">
            {quickAmounts.map((amount) => (
              <button
                key={amount}
                type="button"
                onClick={() => addQuickAmount(amount)}
                className="rounded-lg border border-neutral-200 px-2.5 py-1.5 text-[12px] font-semibold text-neutral-600 hover:bg-neutral-50 dark:border-white/[0.08] dark:text-neutral-300 dark:hover:bg-white/[0.05]"
              >
                +{amount}{metric?.unit ? ` ${metric.unit}` : ""}
              </button>
            ))}
          </div>
        )}

        <Input
          label="Date"
          type="date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
        />

        <div className="flex gap-2 pt-1">
          <Button
            fullWidth
            onClick={handleSave}
            disabled={!value || isNaN(parseFloat(value))}
          >
            <IconCheck size={16} strokeWidth={2.5} />
            Save Entry
          </Button>
         
        </div>
      </div>
    </BottomSheet>
  );
}
