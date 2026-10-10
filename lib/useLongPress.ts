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
  /** Tears down the listeners that disarm the click guard — see `arm`. */
  const disarmRef = useRef<(() => void) | null>(null);
  const [pressing, setPressing] = useState(false);

  /**
   * Swallow only the click that belongs to THIS gesture.
   *
   * That click is not guaranteed to arrive: when the long-press re-renders the
   * control mid-hold (the checkbox turning into its "missed" state), the
   * browser drops the trailing click. Left armed, the guard then ate the
   * user's next deliberate action in the row — clicking or pressing Enter on
   * the details chip right after marking a task missed did nothing the first
   * time. Any new pointer-down or key press is a new intent, so it disarms.
   */
  const disarm = useCallback(() => {
    firedRef.current = false;
    disarmRef.current?.();
    disarmRef.current = null;
  }, []);

  const arm = useCallback(() => {
    disarmRef.current?.();
    firedRef.current = true;
    const listeners = new AbortController();
    const opts = { capture: true, signal: listeners.signal } as const;
    window.addEventListener("pointerdown", disarm, opts);
    window.addEventListener("keydown", disarm, opts);
    disarmRef.current = () => listeners.abort();
  }, [disarm]);

  useEffect(() => () => disarmRef.current?.(), []);

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
      disarm();
      setPressing(true);
      timerRef.current = setTimeout(() => {
        timerRef.current = null;
        arm();
        setPressing(false);
        haptic("medium");
        onLongPress?.();
      }, delayMs);
    },
    [cancel, delayMs, onLongPress, arm, disarm]
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
    disarm();
    e.preventDefault();
    e.stopPropagation();
  }, [disarm]);

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
