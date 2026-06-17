"use client";

import { useState } from "react";
import {
  categoryFromIcon,
  type SummaryConfig,
  type ProgressTracker,
  type Plan,
  type Schedule,
} from "@/lib/useScheduleDB";
import { uid } from "@/lib/id";
import { colorFromIcon, type AccentColor } from "@/lib/colorSystem";
import { SECTION_ICONS } from "@/components/SectionIcons";
import { IconPlus, IconX } from "@tabler/icons-react";
import BottomSheet from "@/components/ui/BottomSheet";
import SheetHeader from "@/components/ui/SheetHeader";
import Button from "@/components/ui/Button";
import Input from "@/components/ui/Input";
import { cycleAccentColor } from "@/components/ui/Badge";
import { stableFieldHash } from "@/lib/hash";
import {
  PLAN_TITLE_MAX,
  PlanColorPicker,
  DurationPresets,
  iconPickerClass,
} from "./planFormShared";

type SetScheduleFn = (updater: (prev: Schedule) => Schedule) => void;

function inferUnit(label: string): string {
  const key = label.toLowerCase();
  if (key.includes("calorie")) return "kcal";
  if (key.includes("protein") || key.includes("carb") || /\bfat\b/.test(key)) return "g";
  if (key.includes("duration") || key.includes("time")) return "min";
  if (key.includes("weight")) return "kg";
  return "";
}

function createSummaryFromMeta(metaFields: string[]): SummaryConfig[] {
  return metaFields.map((field) => ({
    label: field,
    metaKey: field,
    unit: inferUnit(field),
    colorClass: `accent-${cycleAccentColor(stableFieldHash(field))}`,
  }));
}

interface AddPlanSheetProps {
  open: boolean;
  onClose: () => void;
  setSchedule: SetScheduleFn;
}

export default function AddPlanSheet({ open, onClose, setSchedule }: AddPlanSheetProps) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [iconName, setIconName] = useState("brain");
  const [color, setColor] = useState<AccentColor>(() => colorFromIcon("brain"));
  const [metaFields, setMetaFields] = useState<string[]>([]);
  const [metaInput, setMetaInput] = useState("");

  function reset() {
    setTitle("");
    setDescription("");
    setStartDate("");
    setEndDate("");
    setIconName("brain");
    setColor(colorFromIcon("brain"));
    setMetaFields([]);
    setMetaInput("");
  }

  function handleClose() {
    reset();
    onClose();
  }

  function handleSubmit() {
    const trimmedTitle = title.trim();
    if (!trimmedTitle) return;
    const plan: Plan = {
      id: uid(),
      title: trimmedTitle,
      description: description.trim() || undefined,
      startDate: startDate || undefined,
      endDate: endDate || undefined,
      category: categoryFromIcon(iconName),
      emoji: iconName,
      color,
      items: [],
      metaFields,
      summary: createSummaryFromMeta(metaFields),
    };
    const trackers: ProgressTracker[] = metaFields.map((field) => ({
      id: uid(),
      planId: plan.id,
      title: field,
      type: "number",
      unit: inferUnit(field),
    }));
    setSchedule((prev) => ({
      ...prev,
      plans: [...prev.plans, plan],
      progressTrackers: [...prev.progressTrackers, ...trackers],
    }));
    reset();
    onClose();
  }

  function addMetaField() {
    const val = metaInput.trim();
    if (val && !metaFields.includes(val)) {
      setMetaFields((prev) => [...prev, val]);
      setMetaInput("");
    }
  }

  return (
    <BottomSheet open={open} onClose={handleClose}>
      <div className="space-y-4 p-5 pb-8">
        <SheetHeader eyebrow="New" title="Create Plan" onClose={handleClose} />

        <div className="space-y-2.5">
          <div>
            <Input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Plan title"
              autoFocus
              maxLength={PLAN_TITLE_MAX}
              onKeyDown={(e) => { if (e.key === "Enter" && title.trim()) handleSubmit(); }}
            />
            <p className="mt-1 text-right text-[11px] font-medium tabular-nums text-neutral-400 dark:text-neutral-500">
              {title.length}/{PLAN_TITLE_MAX}
            </p>
          </div>
          <Input
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Short description (optional)"
          />
          <div className="grid grid-cols-2 gap-2">
            <div>
              <p className="mb-1 text-[11px] font-semibold uppercase tracking-[0.08em] text-neutral-400 dark:text-neutral-500">Start date</p>
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="h-11 w-full min-w-0 rounded-xl border border-neutral-200 bg-neutral-50 px-3 text-[16px] text-neutral-900 outline-none transition-colors focus:border-neutral-300 focus:bg-neutral-100 dark:border-white/10 dark:bg-white/[0.04] dark:text-white dark:focus:border-white/20 dark:focus:bg-white/[0.07] dark:[color-scheme:dark]"
              />
            </div>
            <div>
              <p className="mb-1 text-[11px] font-semibold uppercase tracking-[0.08em] text-neutral-400 dark:text-neutral-500">
                End date
              </p>
              <input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="h-11 w-full min-w-0 rounded-xl border border-neutral-200 bg-neutral-50 px-3 text-[16px] text-neutral-900 outline-none transition-colors focus:border-neutral-300 focus:bg-neutral-100 dark:border-white/10 dark:bg-white/[0.04] dark:text-white dark:focus:border-white/20 dark:focus:bg-white/[0.07] dark:[color-scheme:dark]"
              />
            </div>
          </div>

          <DurationPresets
            startDate={startDate}
            endDate={endDate}
            onSelect={(s, e) => { setStartDate(s); setEndDate(e); }}
          />
        </div>

        <div>
          <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.08em] text-neutral-400 dark:text-neutral-500">Icon</p>
          <div className="grid grid-cols-5 gap-1.5">
            {SECTION_ICONS.map(({ name, label, icon: Icon }) => {
              const sel = iconName === name;
              return (
                <button
                  key={name}
                  type="button"
                  title={label}
                  onClick={() => setIconName(name)}
                  className={iconPickerClass(sel)}
                >
                  <Icon size={18} strokeWidth={1.5} />
                  <span className="text-[9px] font-semibold leading-none">
                    {label}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        <PlanColorPicker value={color} onChange={setColor} />

        <div>
          <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.08em] text-neutral-400 dark:text-neutral-500">
            Progress trackers <span className="normal-case font-normal text-neutral-400">(optional)</span>
          </p>
          <div className="flex gap-2">
            <Input
              value={metaInput}
              onChange={(e) => setMetaInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  addMetaField();
                }
              }}
              placeholder="e.g. Weight, Running Distance…"
            />
            <button
              type="button"
              onClick={addMetaField}
              className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-neutral-200 text-neutral-500 hover:bg-neutral-100 dark:border-white/10 dark:text-neutral-400 dark:hover:bg-white/[0.07]"
            >
              <IconPlus size={16} />
            </button>
          </div>
          {metaFields.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {metaFields.map((field) => (
                <span
                  key={field}
                  className="inline-flex items-center gap-1.5 rounded-full border border-neutral-200 bg-neutral-50 px-2.5 py-1 text-[12px] font-medium text-neutral-600 dark:border-white/10 dark:bg-white/[0.04] dark:text-neutral-300"
                >
                  {field}
                  <button
                    type="button"
                    onClick={() => setMetaFields((prev) => prev.filter((f) => f !== field))}
                    className="opacity-50 hover:opacity-100 hover:text-red-500 transition-opacity"
                  >
                    <IconX size={11} />
                  </button>
                </span>
              ))}
            </div>
          )}
        </div>

        <Button fullWidth onClick={handleSubmit} disabled={!title.trim()}>
          Create New Plan
        </Button>
      </div>
    </BottomSheet>
  );
}
