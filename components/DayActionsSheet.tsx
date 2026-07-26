"use client";

import { useEffect, useState } from "react";
import { m, AnimatePresence } from "framer-motion";
import { IconArrowLeft, IconArrowsExchange, IconCopy } from "@tabler/icons-react";
import BottomSheet from "@/components/ui/BottomSheet";
import SheetHeader from "@/components/ui/SheetHeader";
import Button from "@/components/ui/Button";
import IconButton from "@/components/ui/IconButton";
import { DAYS, DAY_LABELS, type DayKey } from "@/lib/scheduleConstants";
import { haptic } from "@/lib/haptics";

interface DayActionsSheetProps {
  open: boolean;
  sourceDay: DayKey;
  onClose: () => void;
  /** Swap the whole source day with the chosen day. */
  onSwap: (target: DayKey) => void;
  /** Copy the source day's tasks onto the chosen day(s). */
  onDuplicate: (targets: DayKey[]) => void;
}

const SECTION_LABEL =
  "text-[11px] font-bold uppercase tracking-[0.08em] text-neutral-500 dark:text-neutral-400";

/**
 * Day-level actions: swap two whole weekdays or duplicate a day onto others.
 * Shared by the mobile (IOSScheduleApp) and desktop (ScheduleApp) surfaces.
 */
export default function DayActionsSheet({
  open,
  sourceDay,
  onClose,
  onSwap,
  onDuplicate,
}: DayActionsSheetProps) {
  const [step, setStep] = useState<"menu" | "swap" | "duplicate">("menu");
  const [dupDays, setDupDays] = useState<DayKey[]>([]);

  useEffect(() => {
    if (open) {
      setStep("menu");
      setDupDays([]);
    }
  }, [open]);

  const otherDays = DAYS.filter((d) => d !== sourceDay);

  function handleSwap(target: DayKey) {
    haptic("light");
    onSwap(target);
    onClose();
  }

  function handleDuplicate() {
    if (dupDays.length === 0) return;
    haptic("light");
    onDuplicate(dupDays);
    onClose();
  }

  return (
    <BottomSheet open={open} onClose={step === "menu" ? onClose : () => setStep("menu")}>
      <div className="px-5 pb-6 pt-4">
        <AnimatePresence mode="wait" initial={false}>
          {step === "menu" && (
            <m.div
              key="menu"
              initial={{ opacity: 0, x: -24 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -24 }}
              transition={{ duration: 0.18, ease: [0.22, 1, 0.36, 1] }}
            >
              <SheetHeader eyebrow="Day" title={`${DAY_LABELS[sourceDay]} actions`} onClose={onClose} />
              <div className="mt-4 space-y-2">
                <button
                  type="button"
                  onClick={() => setStep("swap")}
                  className="flex w-full items-center gap-3 rounded-2xl border border-neutral-200 bg-white px-4 py-3.5 text-left transition-colors hover:border-neutral-300 dark:border-white/[0.08] dark:bg-white/[0.03] dark:hover:border-white/20"
                >
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-neutral-100 text-neutral-600 dark:bg-white/[0.08] dark:text-neutral-200">
                    <IconArrowsExchange size={18} strokeWidth={2} />
                  </span>
                  <span className="min-w-0">
                    <span className="block text-[15px] font-bold text-neutral-900 dark:text-white">Swap with day…</span>
                    <span className="block text-[12px] font-medium text-neutral-500 dark:text-neutral-400">Exchange this day&apos;s whole schedule</span>
                  </span>
                </button>
                <button
                  type="button"
                  onClick={() => setStep("duplicate")}
                  className="flex w-full items-center gap-3 rounded-2xl border border-neutral-200 bg-white px-4 py-3.5 text-left transition-colors hover:border-neutral-300 dark:border-white/[0.08] dark:bg-white/[0.03] dark:hover:border-white/20"
                >
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-neutral-100 text-neutral-600 dark:bg-white/[0.08] dark:text-neutral-200">
                    <IconCopy size={18} strokeWidth={2} />
                  </span>
                  <span className="min-w-0">
                    <span className="block text-[15px] font-bold text-neutral-900 dark:text-white">Duplicate day to…</span>
                    <span className="block text-[12px] font-medium text-neutral-500 dark:text-neutral-400">Copy these tasks onto other days</span>
                  </span>
                </button>
              </div>
            </m.div>
          )}

          {step === "swap" && (
            <m.div
              key="swap"
              initial={{ opacity: 0, x: 24 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 24 }}
              transition={{ duration: 0.18, ease: [0.22, 1, 0.36, 1] }}
            >
              <div className="mb-5 flex items-center gap-3">
                <IconButton label="Back" variant="soft" size="md" radius="full" onClick={() => setStep("menu")}>
                  <IconArrowLeft size={18} strokeWidth={2} />
                </IconButton>
                <p className="text-[18px] font-bold text-neutral-900 dark:text-white">Swap {DAY_LABELS[sourceDay]} with</p>
              </div>
              <div className="flex flex-wrap gap-2">
                {otherDays.map((day) => (
                  <button
                    key={day}
                    type="button"
                    onClick={() => handleSwap(day)}
                    className="h-10 rounded-full border border-neutral-200 bg-white px-4 text-[13px] font-semibold text-neutral-700 transition-colors hover:border-neutral-900 hover:bg-neutral-900 hover:text-white dark:border-white/10 dark:bg-white/[0.04] dark:text-neutral-200 dark:hover:border-white dark:hover:bg-white dark:hover:text-neutral-950"
                  >
                    {DAY_LABELS[day]}
                  </button>
                ))}
              </div>
            </m.div>
          )}

          {step === "duplicate" && (
            <m.div
              key="duplicate"
              initial={{ opacity: 0, x: 24 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 24 }}
              transition={{ duration: 0.18, ease: [0.22, 1, 0.36, 1] }}
            >
              <div className="mb-5 flex items-center gap-3">
                <IconButton label="Back" variant="soft" size="md" radius="full" onClick={() => setStep("menu")}>
                  <IconArrowLeft size={18} strokeWidth={2} />
                </IconButton>
                <p className="text-[18px] font-bold text-neutral-900 dark:text-white">Copy {DAY_LABELS[sourceDay]} to</p>
              </div>
              <p className={`mb-2.5 ${SECTION_LABEL}`}>Target days</p>
              <div className="mb-6 flex flex-wrap gap-2">
                {otherDays.map((day) => {
                  const sel = dupDays.includes(day);
                  return (
                    <button
                      key={day}
                      type="button"
                      onClick={() =>
                        setDupDays((prev) => (sel ? prev.filter((d) => d !== day) : [...prev, day]))
                      }
                      className={`h-10 rounded-full px-4 text-[13px] font-semibold transition-colors ${
                        sel
                          ? "bg-neutral-900 text-white dark:bg-white dark:text-neutral-950"
                          : "border border-neutral-200 bg-white text-neutral-500 dark:border-white/10 dark:bg-white/[0.04] dark:text-neutral-400"
                      }`}
                    >
                      {DAY_LABELS[day]}
                    </button>
                  );
                })}
              </div>
              <Button fullWidth onClick={handleDuplicate} disabled={dupDays.length === 0}>
                <IconCopy size={15} />
                Duplicate to {dupDays.length || ""} {dupDays.length === 1 ? "day" : "days"}
              </Button>
            </m.div>
          )}
        </AnimatePresence>
      </div>
    </BottomSheet>
  );
}
