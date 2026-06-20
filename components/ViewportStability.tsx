"use client";

import { useEffect } from "react";

export default function ViewportStability() {
  useEffect(() => {
    const preventGesture = (event: Event) => {
      event.preventDefault();
    };

    // Pinch-zoom is blocked by these iOS gesture events (plus `touch-action`
    // in globals.css). We deliberately do NOT add a non-passive `touchmove`
    // listener: that would sit on the scroll fast-path and make every scroll
    // frame janky on iOS — the gesture handlers already cover multi-touch.
    document.addEventListener("gesturestart", preventGesture, { passive: false });
    document.addEventListener("gesturechange", preventGesture, { passive: false });
    document.addEventListener("gestureend", preventGesture, { passive: false });

    return () => {
      document.removeEventListener("gesturestart", preventGesture);
      document.removeEventListener("gesturechange", preventGesture);
      document.removeEventListener("gestureend", preventGesture);
    };
  }, []);

  return null;
}
