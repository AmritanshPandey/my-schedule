"use client";

/**
 * A short, skippable, spotlight-driven tour over real UI elements already on
 * screen — never a separate tutorial mode, never blocking access to the
 * product (per the onboarding principle: show, don't tell; context over
 * ceremony). Steps are 2-4 per page, each pointing at one real control.
 *
 * Positioning: the spotlight is a single absolutely-positioned box whose
 * oversized box-shadow dims everything except a cutout matching the target's
 * rect — no SVG mask needed, and it composes cleanly with border-radius.
 * The callout sits below the target by default, flips above if there's not
 * enough room, and clamps horizontally so it never runs off-screen.
 *
 * Portal-rendered to <body> (matching BottomSheet's approach) so it never
 * gets clipped by an ancestor's overflow. Carries data-glass — this overlay
 * is exactly the "floating chrome" case DESIGN.md's shadow ban exempts.
 */

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, m } from "framer-motion";
import { IconArrowRight, IconX } from "@tabler/icons-react";
import { useReducedMotion } from "@/lib/performance/useReducedMotion";
import { haptic } from "@/lib/haptics";

export interface CoachMarkStep {
  /** A `data-tour="<id>"` value on the element to spotlight (looked up fresh
   *  on every step change via document.querySelector) — not a React ref, so
   *  a step can target an element mounted by a totally different part of
   *  the tree (e.g. the sidebar's "New Task" button from a Today-tab tour)
   *  without threading refs through the component tree. */
  target: string;
  title: string;
  body: string;
}

interface CoachMarksProps {
  open: boolean;
  steps: CoachMarkStep[];
  onFinish: () => void;
}

const SPOTLIGHT_PADDING = 8;
const CALLOUT_GAP = 12;
const CALLOUT_MAX_WIDTH = 320;
const VIEWPORT_MARGIN = 16;
// The callout's real height depends on its content and isn't known until
// after it renders — this is a generous estimate used only for the
// above/below placement decision and the final on-screen clamp, so a step
// with more or less text never ends up positioned off-screen.
const CALLOUT_EST_HEIGHT = 220;

export default function CoachMarks({ open, steps, onFinish }: CoachMarksProps) {
  const [index, setIndex] = useState(0);
  const [rect, setRect] = useState<DOMRect | null>(null);
  const [viewport, setViewport] = useState({ w: 0, h: 0 });
  const reducedMotion = useReducedMotion();
  const frameRef = useRef<number | null>(null);
  // AnimatePresence's exit transition keeps the outgoing step's callout
  // (and its Next/Got it button) mounted and clickable for the ~180ms it
  // takes to fade out, while the new step's callout hasn't mounted yet.
  // A fast second click in that window would otherwise land on the stale
  // button and re-fire `advance` with the OLD step's `isLast`/index still
  // closed over, double-advancing (or overshooting past the last step,
  // which silently dropped the whole tour). Lock advancing until the
  // index we asked for actually commits.
  const advanceLockRef = useRef(false);

  const step = steps[index];

  useEffect(() => {
    if (open) setIndex(0);
    advanceLockRef.current = false;
  }, [open]);

  // Unlocks once the index we asked for has actually committed and
  // re-rendered — i.e. once a fresh, correctly-closured button exists for
  // the new step. Any click before that (including one delivered to the
  // stale, still-exiting old button) is ignored by the lock in `advance`.
  useEffect(() => {
    advanceLockRef.current = false;
  }, [index]);

  useLayoutEffect(() => {
    if (!open || !step) return;

    function measure() {
      setViewport({ w: window.innerWidth, h: window.innerHeight });
      const el = document.querySelector<HTMLElement>(`[data-tour="${step.target}"]`);
      setRect(el ? el.getBoundingClientRect() : null);
    }
    measure();

    function onScrollOrResize() {
      if (frameRef.current) cancelAnimationFrame(frameRef.current);
      frameRef.current = requestAnimationFrame(measure);
    }
    window.addEventListener("resize", onScrollOrResize);
    window.addEventListener("scroll", onScrollOrResize, true);
    return () => {
      window.removeEventListener("resize", onScrollOrResize);
      window.removeEventListener("scroll", onScrollOrResize, true);
      if (frameRef.current) cancelAnimationFrame(frameRef.current);
    };
  }, [open, step, index]);

  const finish = useCallback(() => {
    haptic("light");
    onFinish();
  }, [onFinish]);

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") finish();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, finish]);

  if (!open || typeof document === "undefined" || !step) return null;

  const isLast = index === steps.length - 1;

  function advance() {
    if (advanceLockRef.current) return;
    advanceLockRef.current = true;
    haptic("light");
    if (isLast) {
      finish();
      return;
    }
    setIndex((i) => i + 1);
  }

  const spot = rect
    ? {
        top: rect.top - SPOTLIGHT_PADDING,
        left: rect.left - SPOTLIGHT_PADDING,
        width: rect.width + SPOTLIGHT_PADDING * 2,
        height: rect.height + SPOTLIGHT_PADDING * 2,
      }
    : null;

  const viewportH = viewport.h || 812;
  const calloutWidth = Math.min(CALLOUT_MAX_WIDTH, (viewport.w || 375) - VIEWPORT_MARGIN * 2);
  let calloutTop: number;
  if (spot) {
    const spaceBelow = viewportH - (spot.top + spot.height);
    const spaceAbove = spot.top;
    // A target can be small (a button) or nearly the whole page (a section
    // wrapper) — when there isn't genuinely enough room on either side (the
    // large-target case), skip trying to stay outside the spotlight and just
    // anchor to whichever edge has more room; the clamp below guarantees
    // it's fully on-screen regardless.
    const placeAbove = spaceAbove > spaceBelow;
    calloutTop = placeAbove ? spot.top - CALLOUT_GAP - CALLOUT_EST_HEIGHT : spot.top + spot.height + CALLOUT_GAP;
  } else {
    calloutTop = viewportH / 2 - CALLOUT_EST_HEIGHT / 2;
  }
  calloutTop = Math.min(Math.max(VIEWPORT_MARGIN, calloutTop), viewportH - CALLOUT_EST_HEIGHT - VIEWPORT_MARGIN);
  const idealLeft = spot
    ? spot.left + spot.width / 2 - calloutWidth / 2
    : (viewport.w || 375) / 2 - calloutWidth / 2;
  const calloutLeft = Math.min(
    Math.max(VIEWPORT_MARGIN, idealLeft),
    (viewport.w || 375) - calloutWidth - VIEWPORT_MARGIN,
  );

  const content = (
    <AnimatePresence mode="wait">
      <m.div
        key={`coachmark-${index}`}
        data-glass
        className="fixed inset-0 z-[55]"
        initial={reducedMotion ? { opacity: 1 } : { opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={reducedMotion ? { opacity: 1 } : { opacity: 0 }}
        transition={{ duration: reducedMotion ? 0 : 0.18 }}
      >
        {/* Dimmed backdrop with a spotlight cutout */}
        <div
          className="pointer-events-none absolute rounded-2xl"
          style={
            spot
              ? {
                  top: spot.top,
                  left: spot.left,
                  width: spot.width,
                  height: spot.height,
                  boxShadow: "0 0 0 9999px rgba(10,10,10,0.72)",
                  transition: reducedMotion ? "none" : "top 0.25s, left 0.25s, width 0.25s, height 0.25s",
                }
              : { inset: 0, boxShadow: "inset 0 0 0 9999px rgba(10,10,10,0.72)" }
          }
        />

        {/* Backdrop dismiss target */}
        <button type="button" aria-label="Skip tour" onClick={finish} className="absolute inset-0 cursor-default" />

        {/* Callout */}
        <div
          role="dialog"
          aria-modal="true"
          aria-label={step.title}
          className="absolute rounded-2xl border border-neutral-200 bg-white p-4 shadow-popover dark:border-white/[0.08] dark:bg-neutral-900"
          style={{ top: calloutTop, left: calloutLeft, width: calloutWidth }}
          onClick={(e) => e.stopPropagation()}
        >
          <div className="mb-2 flex items-center justify-between">
            <p className="text-[11px] font-bold uppercase tracking-[0.08em] text-neutral-400 dark:text-neutral-500">
              {index + 1} of {steps.length}
            </p>
            <button
              type="button"
              onClick={finish}
              aria-label="Skip tour"
              className="flex h-6 w-6 items-center justify-center rounded-full text-neutral-400 hover:bg-neutral-100 dark:hover:bg-white/[0.06]"
            >
              <IconX size={13} strokeWidth={2} />
            </button>
          </div>
          <p className="text-[15px] font-bold text-neutral-900 dark:text-white">{step.title}</p>
          <p className="mt-1 text-[13px] leading-relaxed text-neutral-500 dark:text-neutral-400">{step.body}</p>
          <div className="mt-4 flex items-center justify-between">
            <button
              type="button"
              onClick={finish}
              className="text-[12px] font-semibold text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-300"
            >
              Skip
            </button>
            <m.button
              type="button"
              onClick={advance}
              whileTap={{ scale: 0.97 }}
              className="flex items-center gap-1 rounded-full bg-neutral-900 px-4 py-2 text-[13px] font-bold text-white dark:bg-white dark:text-neutral-900"
            >
              {isLast ? "Got it" : "Next"}
              {!isLast && <IconArrowRight size={14} strokeWidth={2.4} />}
            </m.button>
          </div>
        </div>
      </m.div>
    </AnimatePresence>
  );

  return createPortal(content, document.body);
}
