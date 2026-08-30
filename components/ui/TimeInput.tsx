"use client";

import { useEffect, useRef, useState } from "react";
import { displayToInputTime, formatDisplayTime, minutesToInputTime, parseTimeToMinutes, punctuateTimeDigits } from "@/lib/timeUtils";
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

type Period = "AM" | "PM";

/** How far one arrow-key press moves the time. */
const STEP_MINUTES = 5;

function partsFor(value: string): { draft: string; period: Period } {
  const input = displayToInputTime(value);
  const minutes = parseTimeToMinutes(input || value);
  if (minutes === null) return { draft: "", period: "AM" };
  const hour = Math.floor(minutes / 60) % 12 || 12;
  return {
    draft: `${String(hour).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`,
    period: minutes >= 720 ? "PM" : "AM",
  };
}

function parseDraft(draft: string, period: Period): string | null {
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
  const [period, setPeriod] = useState<Period>(initial.period);
  const groupRef = useRef<HTMLDivElement>(null);
  const typingRef = useRef(false);

  useEffect(() => {
    // Never re-format under the user's fingers. Committing on each keystroke
    // pushes a normalised value back down as a prop, and echoing that into the
    // draft used to overwrite what was being typed: entering "9" snapped the
    // field to "09:00", and every digit after it was then swallowed, because
    // "09:004" reduces right back to "09:00". Typing a time from scratch was
    // impossible. The draft is the user's while they hold the caret; it is
    // reconciled with the committed value the moment they leave.
    if (typingRef.current) return;
    const next = partsFor(value);
    setDraft(next.draft);
    setPeriod(next.period);
  }, [value]);

  /** Publish the value without touching what is on screen. */
  function emit(nextDraft: string, nextPeriod: Period) {
    const normalized = parseDraft(nextDraft, nextPeriod);
    if (normalized) onChange(normalized);
  }

  /** Settle the display to the canonical form — on blur, Enter, or a tap. */
  function commit(nextDraft = draft, nextPeriod = period) {
    const normalized = parseDraft(nextDraft, nextPeriod);
    if (!normalized) return;
    onChange(normalized);
    const next = partsFor(normalized);
    setDraft(next.draft);
    setPeriod(next.period);
  }

  function selectPeriod(next: Period) {
    setPeriod(next);
    // A half-typed draft would be discarded by parseDraft; keep the digits and
    // just republish with the new period.
    emit(draft, next);
  }

  /** Nudge the committed time, wrapping across noon/midnight as it goes. */
  function step(deltaMinutes: number) {
    const current = parseTimeToMinutes(parseDraft(draft, period) ?? value);
    if (current === null) return;
    onChange(minutesToInputTime(current + deltaMinutes));
  }

  // No digits yet means no real time is set. The period still has to show
  // *something*, but at full strength next to a "--:--" placeholder it read as
  // an already-set time. Keeping the selected segment quiet until there are
  // digits makes the whole control read as one unset field.
  const isEmpty = draft === "";

  return (
    <div>
      {label && (
        <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-[0.08em] text-neutral-400 dark:text-neutral-500">
          {label}
        </p>
      )}

      <div
        className={`flex h-11 min-w-0 items-stretch overflow-hidden rounded-xl border border-neutral-200 bg-neutral-50 transition-colors focus-within:border-neutral-300 focus-within:bg-white dark:border-white/10 dark:bg-white/[0.04] dark:focus-within:border-white/20 dark:focus-within:bg-white/[0.07] ${className}`}
      >
        <input
          type="text"
          inputMode="numeric"
          value={draft}
          aria-label={ariaLabel ?? label ?? "Time"}
          placeholder="--:--"
          disabled={disabled}
          onFocus={onFocus}
          onChange={(event) => {
            const raw = event.currentTarget.value;
            // A pasted "10:15 PM" carries its own period; honour it rather than
            // silently dropping the half that says which end of the day it is.
            const pasted = /p/i.test(raw) ? "PM" : /a/i.test(raw) ? "AM" : null;
            const next = punctuateTimeDigits(raw);
            setDraft(next);
            if (pasted && pasted !== period) setPeriod(pasted);
            emit(next, pasted ?? period);
          }}
          onFocusCapture={() => { typingRef.current = true; }}
          onBlur={() => {
            typingRef.current = false;
            commit();
          }}
          onKeyDown={(event) => {
            stopTextEditKeyPropagation(event);
            if (event.key === "Enter") {
              commit();
              return;
            }
            // Arrow-stepping is what makes this feel like a time field rather
            // than a text box that happens to hold digits.
            if (event.key === "ArrowUp" || event.key === "ArrowDown") {
              event.preventDefault();
              step(event.key === "ArrowUp" ? STEP_MINUTES : -STEP_MINUTES);
            }
          }}
          className="min-w-0 flex-1 bg-transparent px-3 text-[16px] font-semibold tabular-nums text-neutral-900 outline-none placeholder:text-neutral-400 disabled:cursor-not-allowed disabled:opacity-60 dark:text-white dark:placeholder:text-neutral-600"
        />

        {/*
          A segmented pair, not a <select>.

          AM/PM is a binary choice, and a dropdown charged two interactions
          (open, then pick) for it while hiding the alternative until opened.
          Two segments show both states and cost one tap. It also retires a
          standing fight with the platform: the old control needed
          `appearance-none` purely to stop Safari drawing the <select> as its
          own separately-filled pill, plus a hand-placed chevron to replace the
          native arrow that removed.

          The alignment bug lived here too. The <select> sat in a `display:
          block` wrapper, so it kept its own 23px intrinsic height inside a 43px
          row and hung 8.8px above centre. `items-stretch` on the row plus a
          flex group means the segments are centred by construction, with no
          height to keep in sync by hand.
        */}
        <div
          ref={groupRef}
          role="radiogroup"
          aria-label={`${ariaLabel ?? label ?? "Time"} period`}
          className="flex shrink-0 items-center gap-1 border-l border-neutral-200 p-1 dark:border-white/10"
          onKeyDown={(event) => {
            if (!["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(event.key)) return;
            // Two options, so any arrow simply moves to the other one — the
            // behaviour a radio group is expected to have.
            event.preventDefault();
            const next: Period = period === "AM" ? "PM" : "AM";
            selectPeriod(next);
            groupRef.current?.querySelector<HTMLButtonElement>(`[data-period="${next}"]`)?.focus();
          }}
        >
          {(["AM", "PM"] as const).map((option) => {
            const active = period === option;
            return (
              <button
                key={option}
                type="button"
                role="radio"
                aria-checked={active}
                data-period={option}
                disabled={disabled}
                // Roving tabindex: the group is one stop, arrows move within it.
                tabIndex={active ? 0 : -1}
                onClick={() => selectPeriod(option)}
                className={`flex h-full w-[34px] items-center justify-center rounded-lg text-[13px] font-bold transition-colors disabled:cursor-not-allowed disabled:opacity-60 ${
                  active
                    ? isEmpty
                      ? "bg-neutral-200/70 text-neutral-500 dark:bg-white/[0.08] dark:text-neutral-400"
                      : "bg-neutral-900 text-white dark:bg-white dark:text-neutral-900"
                    : // The unselected half is not decoration — it is the other
                      // option, and a segmented control only works if you can
                      // read it. Measured against this field's own background:
                      // neutral-400/500 gave 3.79:1 and neutral-500/400 still
                      // only 4.12:1 in dark, both under the 4.5:1 floor for
                      // 13px. Selection is carried by the FILL, so the text can
                      // be this strong without blurring which one is chosen.
                      "text-neutral-600 hover:text-neutral-900 dark:text-neutral-300 dark:hover:text-white"
                }`}
              >
                {option}
              </button>
            );
          })}
        </div>
      </div>

      <span className="sr-only">{formatDisplayTime(value)}</span>
    </div>
  );
}
