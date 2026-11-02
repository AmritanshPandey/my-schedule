"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import { IconCalendar, IconChevronLeft, IconChevronRight } from "@tabler/icons-react";
import { localISODate, todayISO } from "@/lib/dateUtils";
import { FORM_CONTROL_CHROME } from "@/components/ui/Input";
import Button from "@/components/ui/Button";

/**
 * The one date field — same "YYYY-MM-DD" | "" value as `<input type="date">`.
 *
 * Touch devices get the platform's own picker: on iPhone that is the iOS
 * date wheel/calendar, on Android the system dialog, both of which know the
 * locale, the accessibility settings and the thumb better than anything drawn
 * here. The field around it carries the house chrome so it sits flush with
 * every other input.
 *
 * With a mouse, the browser's own popup is the off-brand part (a grey
 * Chrome/Firefox panel that ignores the theme), so it is replaced by
 * <Calendar>: a month grid in the app's own ink, keyboard-complete per the
 * ARIA date-grid pattern.
 */

interface DateInputProps {
  value: string;
  onChange: (value: string) => void;
  min?: string;
  max?: string;
  id?: string;
  ariaLabel?: string;
  placeholder?: string;
  disabled?: boolean;
  /** Offer a "Clear" action that sets the value back to "". */
  clearable?: boolean;
  /** "sm" is the 40px settings/row height; "md" the 44px form field. */
  size?: "sm" | "md";
  /** Classes for the field box — width and flex sizing. */
  className?: string;
  "aria-invalid"?: boolean;
}

const FINE_POINTER = "(hover: hover) and (pointer: fine)";

function subscribePointer(onChange: () => void) {
  const mq = window.matchMedia(FINE_POINTER);
  mq.addEventListener("change", onChange);
  return () => mq.removeEventListener("change", onChange);
}

/** True with a mouse or trackpad; false on touch and during SSR. */
export function useFinePointer() {
  return useSyncExternalStore(
    subscribePointer,
    () => window.matchMedia(FINE_POINTER).matches,
    () => false,
  );
}

function parseISO(value: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  return m ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])) : null;
}

function formatField(value: string): string {
  const d = parseISO(value);
  return d ? d.toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" }) : "";
}

export default function DateInput({
  value,
  onChange,
  min,
  max,
  id,
  ariaLabel,
  placeholder = "Select date",
  disabled = false,
  clearable = false,
  size = "md",
  className = "",
  "aria-invalid": ariaInvalid,
}: DateInputProps) {
  const fine = useFinePointer();
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const box = `${FORM_CONTROL_CHROME} relative flex w-full items-center ${size === "sm" ? "h-10" : "h-11"} ${
    disabled ? "opacity-60" : ""
  } ${className}`;
  const text = size === "sm" ? "text-[15px] font-semibold" : "text-[16px] font-medium";

  if (!fine) {
    return (
      <div className={`${box} focus-within:border-emerald-600/60 dark:focus-within:border-emerald-400/50`}>
        <IconCalendar size={16} strokeWidth={2} aria-hidden="true" className="pointer-events-none absolute left-3 text-neutral-500 dark:text-neutral-400" />
        <input
          id={id}
          type="date"
          value={value}
          min={min}
          max={max}
          disabled={disabled}
          aria-label={ariaLabel}
          aria-invalid={ariaInvalid}
          onChange={(e) => onChange(e.target.value)}
          className={`[&::-webkit-calendar-picker-indicator]:hidden h-full w-full min-w-0 bg-transparent pl-9 pr-3 outline-none disabled:cursor-not-allowed dark:[color-scheme:dark] ${text}`}
        />
        {/* iOS draws an empty date field as blank; say what goes there.
            Chromium's trailing picker icon is hidden above — the leading one
            is ours, and a tap anywhere still opens the system picker. */}
        {!value && (
          <span aria-hidden="true" className={`pointer-events-none absolute left-9 text-neutral-500 dark:text-neutral-400 ${text}`}>
            {placeholder}
          </span>
        )}
      </div>
    );
  }

  return (
    <>
      <button
        ref={triggerRef}
        id={id}
        type="button"
        disabled={disabled}
        aria-label={ariaLabel ? `${ariaLabel}${value ? `, ${formatField(value)}` : ""}` : undefined}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-invalid={ariaInvalid}
        onClick={() => setOpen((v) => !v)}
        className={`${box} gap-2 px-3 text-left hover:border-neutral-300 disabled:cursor-not-allowed dark:hover:border-white/20 ${
          open ? "border-emerald-600/60 bg-neutral-100 dark:border-emerald-400/50 dark:bg-white/[0.07]" : ""
        }`}
      >
        <IconCalendar size={16} strokeWidth={2} aria-hidden="true" className="shrink-0 text-neutral-500 dark:text-neutral-400" />
        <span className={`min-w-0 truncate tabular-nums ${text} ${value ? "" : "text-neutral-500 dark:text-neutral-400"}`}>
          {value ? formatField(value) : placeholder}
        </span>
      </button>
      {open && (
        <CalendarPopover
          anchor={triggerRef}
          value={value}
          min={min}
          max={max}
          clearable={clearable}
          label={ariaLabel}
          onSelect={(next) => {
            onChange(next);
            setOpen(false);
            triggerRef.current?.focus();
          }}
          onClose={(refocus) => {
            setOpen(false);
            if (refocus) triggerRef.current?.focus();
          }}
        />
      )}
    </>
  );
}

const POPOVER_WIDTH = 304;
const GAP = 6;

function CalendarPopover({
  anchor,
  onClose,
  label,
  ...calendar
}: {
  anchor: React.RefObject<HTMLButtonElement | null>;
  onClose: (refocus: boolean) => void;
  label?: string;
} & CalendarProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);

  // Fixed to the viewport and portalled, so a sheet's scroll container can't
  // clip it; it flips above the field when there isn't room below.
  const place = useCallback(() => {
    const a = anchor.current?.getBoundingClientRect();
    const h = ref.current?.offsetHeight ?? 360;
    if (!a) return;
    const below = a.bottom + GAP + h <= window.innerHeight - 8;
    const top = below ? a.bottom + GAP : Math.max(8, a.top - GAP - h);
    const left = Math.min(Math.max(8, a.left), window.innerWidth - POPOVER_WIDTH - 8);
    setPos({ top, left });
  }, [anchor]);

  useLayoutEffect(place, [place]);

  useEffect(() => {
    function onPointer(e: PointerEvent) {
      const t = e.target as Node;
      if (ref.current?.contains(t) || anchor.current?.contains(t)) return;
      onClose(false);
    }
    window.addEventListener("pointerdown", onPointer, true);
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, true);
    return () => {
      window.removeEventListener("pointerdown", onPointer, true);
      window.removeEventListener("resize", place);
      window.removeEventListener("scroll", place, true);
    };
  }, [anchor, onClose, place]);

  return createPortal(
    <div
      ref={ref}
      role="dialog"
      aria-label={label ? `Choose ${label.toLowerCase()}` : "Choose date"}
      data-glass
      onKeyDown={(e) => {
        if (e.key === "Escape") {
          e.stopPropagation();
          onClose(true);
          return;
        }
        // A dialog keeps Tab to itself. Handled here, and stopped, because the
        // sheet underneath traps Tab at the window and would otherwise pull
        // focus out of this portalled popover and back to its own first field.
        if (e.key === "Tab") {
          e.preventDefault();
          e.stopPropagation();
          const items = Array.from(ref.current?.querySelectorAll<HTMLButtonElement>("button:not([disabled])") ?? []).filter(
            (b) => b.tabIndex !== -1,
          );
          if (!items.length) return;
          const at = items.indexOf(document.activeElement as HTMLButtonElement);
          items[(at + (e.shiftKey ? -1 : 1) + items.length) % items.length].focus();
        }
      }}
      style={{ top: pos?.top ?? -9999, left: pos?.left ?? -9999, width: POPOVER_WIDTH }}
      className="fixed z-[70] rounded-2xl border border-neutral-200/80 bg-white p-3 shadow-popover dark:border-white/[0.08] dark:bg-neutral-900"
    >
      <Calendar {...calendar} />
    </div>,
    document.body,
  );
}

interface CalendarProps {
  value: string;
  onSelect: (value: string) => void;
  min?: string;
  max?: string;
  clearable?: boolean;
}

const WEEKDAYS = ["Mo", "Tu", "We", "Th", "Fr", "Sa", "Su"];

function addDays(d: Date, n: number) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
}

function addMonths(d: Date, n: number) {
  const target = new Date(d.getFullYear(), d.getMonth() + n, 1);
  const last = new Date(target.getFullYear(), target.getMonth() + 1, 0).getDate();
  return new Date(target.getFullYear(), target.getMonth(), Math.min(d.getDate(), last));
}

/**
 * A month grid, Monday first like the rest of the app. The selected day takes
 * the same solid ink as every other selected segment; today carries the green
 * "now" dot the timeline's now-line uses — the one place green appears, since
 * it reports where you are, not decoration.
 */
export function Calendar({ value, onSelect, min, max, clearable }: CalendarProps) {
  const today = todayISO();
  const selected = parseISO(value);
  const [focus, setFocus] = useState<Date>(() => selected ?? parseISO(today)!);
  const gridRef = useRef<HTMLDivElement>(null);
  // The month arrows keep focus on themselves, so they can be pressed again.
  const paging = useRef(false);

  const inRange = (iso: string) => (!min || iso >= min) && (!max || iso <= max);

  // Six rows from the Monday on or before the 1st, so the grid never jumps.
  const first = new Date(focus.getFullYear(), focus.getMonth(), 1);
  const start = addDays(first, -((first.getDay() + 6) % 7));
  const days = Array.from({ length: 42 }, (_, i) => addDays(start, i));
  const focusISO = localISODate(focus);

  useEffect(() => {
    if (paging.current) {
      paging.current = false;
      return;
    }
    // Focus follows the active day — onto it when the calendar opens (the
    // date-picker dialog pattern) and along with every arrow-key move.
    gridRef.current?.querySelector<HTMLButtonElement>(`[data-iso="${focusISO}"]`)?.focus({ preventScroll: true });
  }, [focusISO]);

  function move(next: Date) {
    setFocus(next);
  }

  function onKeyDown(e: React.KeyboardEvent) {
    const map: Record<string, () => Date> = {
      ArrowLeft: () => addDays(focus, -1),
      ArrowRight: () => addDays(focus, 1),
      ArrowUp: () => addDays(focus, -7),
      ArrowDown: () => addDays(focus, 7),
      Home: () => addDays(focus, -((focus.getDay() + 6) % 7)),
      End: () => addDays(focus, 6 - ((focus.getDay() + 6) % 7)),
      PageUp: () => addMonths(focus, e.shiftKey ? -12 : -1),
      PageDown: () => addMonths(focus, e.shiftKey ? 12 : 1),
    };
    const next = map[e.key];
    if (!next) return;
    e.preventDefault();
    move(next());
  }

  const navButton =
    "flex h-9 w-9 items-center justify-center rounded-full text-neutral-600 transition-colors hover:bg-neutral-100 hover:text-neutral-900 dark:text-neutral-300 dark:hover:bg-white/[0.07] dark:hover:text-white";

  return (
    <div>
      <div className="mb-2 flex items-center justify-between pl-2">
        <p aria-live="polite" className="text-[15px] font-semibold text-neutral-950 dark:text-white">
          {focus.toLocaleDateString(undefined, { month: "long", year: "numeric" })}
        </p>
        <div className="flex items-center">
          <button type="button" aria-label="Previous month" onClick={() => { paging.current = true; setFocus(addMonths(focus, -1)); }} className={navButton}>
            <IconChevronLeft size={18} strokeWidth={2} />
          </button>
          <button type="button" aria-label="Next month" onClick={() => { paging.current = true; setFocus(addMonths(focus, 1)); }} className={navButton}>
            <IconChevronRight size={18} strokeWidth={2} />
          </button>
        </div>
      </div>

      <div role="grid" ref={gridRef} onKeyDown={onKeyDown} className="grid grid-cols-7 gap-y-0.5">
        <div role="row" className="contents">
          {WEEKDAYS.map((d) => (
            <div key={d} role="columnheader" className="flex h-8 items-center justify-center text-[11px] font-semibold uppercase tracking-wide text-neutral-500 dark:text-neutral-400">
              {d}
            </div>
          ))}
        </div>
        {Array.from({ length: 6 }, (_, row) => (
          <div key={row} role="row" className="contents">
            {days.slice(row * 7, row * 7 + 7).map((d) => {
              const iso = localISODate(d);
              const isSelected = iso === value;
              const isToday = iso === today;
              const outside = d.getMonth() !== focus.getMonth();
              const enabled = inRange(iso);
              return (
                <div key={iso} role="gridcell" aria-selected={isSelected} className="flex items-center justify-center">
                  <button
                    type="button"
                    data-iso={iso}
                    tabIndex={iso === focusISO ? 0 : -1}
                    disabled={!enabled}
                    aria-current={isToday ? "date" : undefined}
                    aria-label={d.toLocaleDateString(undefined, { weekday: "long", day: "numeric", month: "long", year: "numeric" })}
                    onClick={() => onSelect(iso)}
                    className={`relative flex h-10 w-10 items-center justify-center rounded-full text-[14px] tabular-nums transition-colors disabled:cursor-not-allowed ${
                      isSelected
                        ? "bg-neutral-900 font-bold text-white dark:bg-white dark:text-neutral-900"
                        : !enabled
                          ? "text-neutral-300 dark:text-neutral-700"
                          : outside
                            ? "text-neutral-400 hover:bg-neutral-100 dark:text-neutral-500 dark:hover:bg-white/[0.07]"
                            : `text-neutral-800 hover:bg-neutral-100 dark:text-neutral-100 dark:hover:bg-white/[0.07] ${isToday ? "font-bold" : "font-medium"}`
                    }`}
                  >
                    {d.getDate()}
                    {isToday && !isSelected && (
                      <span aria-hidden="true" className="absolute bottom-1.5 h-1 w-1 rounded-full bg-[#00A63E] dark:bg-[#2FD46E]" />
                    )}
                  </button>
                </div>
              );
            })}
          </div>
        ))}
      </div>

      <div className="mt-2 flex items-center justify-between border-t border-neutral-200/70 pt-2 dark:border-white/[0.07]">
        <Button variant="secondary" size="sm" disabled={!inRange(today)} onClick={() => onSelect(today)}>
          Today
        </Button>
        {clearable && value && (
          <Button variant="ghost" size="sm" onClick={() => onSelect("")}>
            Clear
          </Button>
        )}
      </div>
    </div>
  );
}
