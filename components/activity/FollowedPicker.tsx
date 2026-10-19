"use client";

/**
 * "How closely did you follow it?" — the optional second beat after marking a
 * routine done.
 *
 * A slider, not a row of chips. Four coarse steps, because this is a feel for
 * the day rather than a measurement, so the rail snaps between them and shows
 * its detents; the knob is the liquid-glass material from the tab bar, shrunk
 * to a 28px capsule (see `.followed-slider` in globals.css).
 *
 * A native <input type="range"> does the work — keyboard, pointer capture and
 * the slider role come free — with the rail, fill and detents drawn behind it.
 * Dragging only moves a local draft; the rating is written once, on release,
 * so a single drag across the rail is one write rather than four.
 */
import { useEffect, useRef, useState } from "react";
import { FOLLOWED_OPTIONS } from "@/lib/routineDetails";
import { haptic } from "@/lib/haptics";

/** The rail runs between the first and last option; the steps are even. */
const MIN = FOLLOWED_OPTIONS[0];
const MAX = FOLLOWED_OPTIONS[FOLLOWED_OPTIONS.length - 1];
const STEP = (MAX - MIN) / (FOLLOWED_OPTIONS.length - 1);

/** Thumb diameter, mirroring `.followed-slider::-webkit-slider-thumb`. */
const THUMB = 28;

/** Where `pct` sits along the rail, as a fraction of its travel. */
const fraction = (pct: number) => (pct - MIN) / (MAX - MIN);

/** The centre of the knob at `pct` — what the fill ends at and a detent sits on. */
const offset = (pct: number) => `calc(${fraction(pct)} * (100% - ${THUMB}px) + ${THUMB / 2}px)`;

interface FollowedPickerProps {
  /** The current rating, or null when the day isn't rated/done. */
  value: number | null;
  onChange: (pct: number) => void;
  /** Names the routine for screen readers. */
  routineTitle: string;
  /** Smaller caption above the slider; omit for none. */
  prompt?: string;
  className?: string;
}

export default function FollowedPicker({ value, onChange, routineTitle, prompt, className = "" }: FollowedPickerProps) {
  // An unrated done day already counts as fully followed, so the knob starts
  // where the day actually stands rather than at an invented zero.
  const committed = value ?? MAX;
  const [draft, setDraft] = useState(committed);
  const dragging = useRef(false);

  // A rating changed elsewhere (the row and the detail view share a day) wins
  // whenever the knob is not under a finger.
  useEffect(() => {
    if (!dragging.current) setDraft(committed);
  }, [committed]);

  const commit = () => {
    if (!dragging.current) return;
    dragging.current = false;
    onChange(draft);
  };

  return (
    <div className={className}>
      <div className="mb-1.5 flex items-baseline justify-between gap-3">
        {prompt && <p className="text-[12px] font-semibold text-neutral-500 dark:text-neutral-400">{prompt}</p>}
        {/* Decorative: the slider announces its own value. */}
        <span aria-hidden="true" className="ml-auto text-[13px] font-extrabold tabular-nums text-neutral-900 dark:text-neutral-50">
          {draft}%
        </span>
      </div>

      <div data-glass className="relative h-11">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-x-0 top-1/2 h-2 -translate-y-1/2 rounded-full bg-neutral-200 dark:bg-white/[0.14]"
        />
        <div
          aria-hidden="true"
          style={{ width: offset(draft) }}
          className="pointer-events-none absolute left-0 top-1/2 h-2 -translate-y-1/2 rounded-full bg-green-600 dark:bg-emerald-500"
        />
        {/* Detents: the rail looks continuous, so the stops have to be visible. */}
        {FOLLOWED_OPTIONS.map((pct) => (
          <span
            key={pct}
            aria-hidden="true"
            style={{ left: offset(pct) }}
            className={`pointer-events-none absolute top-1/2 h-[3px] w-[3px] -translate-x-1/2 -translate-y-1/2 rounded-full ${
              pct <= draft ? "bg-white/70" : "bg-neutral-400/70 dark:bg-white/30"
            }`}
          />
        ))}

        <input
          type="range"
          min={MIN}
          max={MAX}
          step={STEP}
          value={draft}
          aria-label={`How closely you followed ${routineTitle}`}
          aria-valuetext={`${draft}%`}
          onChange={(event) => {
            const next = Number(event.target.value);
            if (next === draft) return;
            dragging.current = true;
            haptic("light");
            setDraft(next);
          }}
          onPointerDown={() => { dragging.current = true; }}
          onKeyDown={() => { dragging.current = true; }}
          onPointerUp={commit}
          onPointerCancel={commit}
          onKeyUp={commit}
          // The catch-all: a drag released off the element still commits.
          onBlur={commit}
          className="followed-slider relative"
        />
      </div>
    </div>
  );
}
