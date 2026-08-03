"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { PointerEvent as ReactPointerEvent, MouseEvent as ReactMouseEvent } from "react";
import { DRAG_THRESHOLD_PX } from "@/lib/timeline/dragTimeUtils";
import { haptic } from "@/lib/haptics";

/**
 * 500ms, deliberately slower than the timeline's LONG_PRESS_MS (300).
 *
 * There the competing gesture is a scroll, so a false positive costs nothing.
 * Here the competing gesture is a tap that completes a task, so a false
 * positive silently un-completes it. 500ms is the platform value on both iOS
 * and Android.
 */
export const MISSED_LONG_PRESS_MS = 500;

export interface UseLongPressResult {
  /** Spread onto the pressable control itself (the checkbox button). */
  pressHandlers: {
    onPointerDown?: (e: ReactPointerEvent<HTMLElement>) => void;
    onPointerMove?: (e: ReactPointerEvent<HTMLElement>) => void;
    onPointerUp?: (e: ReactPointerEvent<HTMLElement>) => void;
    onPointerCancel?: (e: ReactPointerEvent<HTMLElement>) => void;
    onPointerLeave?: (e: ReactPointerEvent<HTMLElement>) => void;
    onContextMenu?: (e: ReactMouseEvent<HTMLElement>) => void;
  };
  /**
   * Spread onto the ROW/CARD root, not the control. Swallows the click that
   * follows a fired long-press — which covers both the control itself and a
   * finger that drifted onto the card body, where a card-level onClick would
   * otherwise toggle completion right after the task was marked missed.
   */
  clickGuard: { onClickCapture?: (e: ReactMouseEvent<HTMLElement>) => void };
  /** True while the pointer is held and the timer is still running. */
  pressing: boolean;
}

const INERT: UseLongPressResult = { pressHandlers: {}, clickGuard: {}, pressing: false };

/**
 * Press-and-hold on a control that also handles plain taps.
 *
 * Pass `undefined` to disable — the caller then attaches no handlers at all,
 * which is how read-only days, commitments and already-completed tasks opt out.
 */
export function useLongPress(
  onLongPress: (() => void) | undefined,
  delayMs: number = MISSED_LONG_PRESS_MS
): UseLongPressResult {
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const originRef = useRef<{ x: number; y: number } | null>(null);
  const firedRef = useRef(false);
  const [pressing, setPressing] = useState(false);

  const cancel = useCallback(() => {
    if (timerRef.current !== null) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    originRef.current = null;
    setPressing(false);
  }, []);

  useEffect(() => cancel, [cancel]);

  const onPointerDown = useCallback(
    (e: ReactPointerEvent<HTMLElement>) => {
      // Secondary mouse buttons open menus; they are not a hold.
      if (e.pointerType === "mouse" && e.button !== 0) return;
      // A second pointerdown before the matching pointerup would orphan the
      // running timer and both would fire. Against a toggle callback that nets
      // to no visible change — reachable with two fingers on one checkbox, or
      // whenever a pointerup/pointercancel is never delivered.
      cancel();
      originRef.current = { x: e.clientX, y: e.clientY };
      firedRef.current = false;
      setPressing(true);
      timerRef.current = setTimeout(() => {
        timerRef.current = null;
        firedRef.current = true;
        setPressing(false);
        haptic("medium");
        onLongPress?.();
      }, delayMs);
    },
    [cancel, delayMs, onLongPress]
  );

  const onPointerMove = useCallback(
    (e: ReactPointerEvent<HTMLElement>) => {
      const origin = originRef.current;
      if (!origin) return;
      // Reuses the timeline's drag threshold so a scroll started over the
      // control always wins. Note we never set touch-action: none — that would
      // make the page unscrollable wherever a checkbox sits.
      if (Math.hypot(e.clientX - origin.x, e.clientY - origin.y) > DRAG_THRESHOLD_PX) cancel();
    },
    [cancel]
  );

  const onClickCapture = useCallback((e: ReactMouseEvent<HTMLElement>) => {
    if (!firedRef.current) return;
    firedRef.current = false;
    e.preventDefault();
    e.stopPropagation();
  }, []);

  if (!onLongPress) return INERT;

  return {
    pressHandlers: {
      onPointerDown,
      onPointerMove,
      onPointerUp: cancel,
      // The browser fires pointercancel when it claims the gesture for a scroll.
      onPointerCancel: cancel,
      onPointerLeave: cancel,
      // Suppresses the Android long-press context menu.
      onContextMenu: (e) => e.preventDefault(),
    },
    clickGuard: { onClickCapture },
    pressing,
  };
}
