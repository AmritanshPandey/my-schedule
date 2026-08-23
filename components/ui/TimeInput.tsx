"use client";

import { useEffect, useState } from "react";
import { IconChevronDown } from "@tabler/icons-react";
import { displayToInputTime, formatDisplayTime, minutesToInputTime, parseTimeToMinutes } from "@/lib/timeUtils";
import { stopTextEditKeyPropagation } from "@/lib/keyboardEvents";

interface TimeInputProps {
  value: string;
  onChange: (value: string) => void;
  label?: string;
  ariaLabel?: string;
  onFocus?: () => void;
  disabled?: boolean;
  className?: string;
}

function partsFor(value: string): { draft: string; period: "AM" | "PM" } {
  const input = displayToInputTime(value);
  const minutes = parseTimeToMinutes(input || value);
  if (minutes === null) return { draft: "", period: "AM" };
  const hour = Math.floor(minutes / 60) % 12 || 12;
  return {
    draft: `${String(hour).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`,
    period: minutes >= 720 ? "PM" : "AM",
  };
}

function parseDraft(draft: string, period: "AM" | "PM"): string | null {
  const match = draft.trim().match(/^(\d{1,2})(?::(\d{1,2}))?$/);
  if (!match) return null;
  const hour = Number(match[1]);
  const minute = Number(match[2] ?? "0");
  if (hour < 1 || hour > 12 || minute < 0 || minute > 59) return null;
  let hour24 = hour % 12;
  if (period === "PM") hour24 += 12;
  return minutesToInputTime(hour24 * 60 + minute);
}

export default function TimeInput({
  value,
  onChange,
  label,
  ariaLabel,
  onFocus,
  disabled = false,
  className = "",
}: TimeInputProps) {
  const initial = partsFor(value);
  const [draft, setDraft] = useState(initial.draft);
  const [period, setPeriod] = useState<"AM" | "PM">(initial.period);

  useEffect(() => {
    const next = partsFor(value);
    setDraft(next.draft);
    setPeriod(next.period);
  }, [value]);

  function commit(nextDraft = draft, nextPeriod = period) {
    const normalized = parseDraft(nextDraft, nextPeriod);
    if (normalized) {
      onChange(normalized);
      const next = partsFor(normalized);
      setDraft(next.draft);
      setPeriod(next.period);
    }
  }

  return (
    <div>
      {label && <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-[0.08em] text-neutral-400 dark:text-neutral-500">{label}</p>}
      <div className={`flex h-11 min-w-0 overflow-hidden rounded-xl border border-neutral-200 bg-neutral-50 transition-colors focus-within:border-neutral-300 focus-within:bg-white dark:border-white/10 dark:bg-white/[0.04] dark:focus-within:border-white/20 dark:focus-within:bg-white/[0.07] ${className}`}>
        <input
          type="text"
          inputMode="numeric"
          value={draft}
          aria-label={ariaLabel ?? label ?? "Time"}
          placeholder="08:00"
          disabled={disabled}
          onFocus={onFocus}
          onChange={(event) => {
            const next = event.currentTarget.value.replace(/[^0-9:]/g, "").slice(0, 5);
            setDraft(next);
            commit(next, period);
          }}
          onBlur={() => commit()}
          onKeyDown={(event) => {
            stopTextEditKeyPropagation(event);
            if (event.key === "Enter") commit();
          }}
          className="min-w-0 flex-1 bg-transparent px-3 text-[16px] font-semibold tabular-nums text-neutral-900 outline-none placeholder:text-neutral-400 disabled:cursor-not-allowed disabled:opacity-60 dark:text-white dark:placeholder:text-neutral-600"
        />
        <div className="relative shrink-0 border-l border-neutral-200 dark:border-white/10">
          {/* appearance-none strips each browser's own native chrome (Safari in
              particular renders a <select> as its own rounded, separately-
              filled pill no matter what background/border classes it's given)
              so this reads as one seamless control with TimeInput's digits,
              not two visually disconnected boxes. The chevron below replaces
              the native arrow that appearance-none removes. */}
          <select
            aria-label={`${ariaLabel ?? label ?? "Time"} period`}
            value={period}
            disabled={disabled}
            onChange={(event) => {
              const next = event.currentTarget.value as "AM" | "PM";
              setPeriod(next);
              commit(draft, next);
            }}
            className="w-[76px] cursor-pointer appearance-none bg-transparent py-0 pl-2 pr-6 text-[15px] font-semibold text-neutral-700 outline-none disabled:cursor-not-allowed disabled:opacity-60 dark:text-white dark:[color-scheme:dark]"
          >
            <option value="AM">AM</option>
            <option value="PM">PM</option>
          </select>
          <IconChevronDown
            size={12}
            strokeWidth={2.4}
            className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-neutral-400"
          />
        </div>
      </div>
      <span className="sr-only">{formatDisplayTime(value)}</span>
    </div>
  );
}
