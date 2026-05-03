"use client";

import { useEffect, useState } from "react";
import { IconCheck } from "@tabler/icons-react";
import BottomSheet from "@/components/ui/BottomSheet";
import SheetHeader from "@/components/ui/SheetHeader";
import Button from "@/components/ui/Button";
import Input from "@/components/ui/Input";

interface AddEntryModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (value: number, date: string) => void;
  metric?: { name: string; unit: string };
}

function todayISO(): string {
  return new Date().toISOString().split("T")[0];
}

export default function AddEntryModal({ isOpen, onClose, onSave, metric }: AddEntryModalProps) {
  const [value, setValue] = useState("");
  const [date, setDate] = useState(todayISO);

  useEffect(() => {
    if (!isOpen) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [isOpen, onClose]);

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

  const metricLabel = metric
    ? `${metric.name}${metric.unit ? ` (${metric.unit})` : ""}`
    : "Value";

  return (
    <BottomSheet open={isOpen} onClose={handleClose} maxHeight="80vh">
      <div className="space-y-4 px-5 pb-8 pt-4">
        <SheetHeader eyebrow="Log" title="New Entry" onClose={handleClose} />

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
          <Button variant="secondary" onClick={handleClose}>
            Cancel
          </Button>
        </div>
      </div>
    </BottomSheet>
  );
}
