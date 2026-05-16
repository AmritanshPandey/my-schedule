export function haptic(style: "light" | "medium" | "heavy" = "light") {
  try {
    if (typeof navigator !== "undefined" && "vibrate" in navigator) {
      navigator.vibrate(style === "light" ? 6 : style === "medium" ? 14 : 28);
    }
  } catch {}
}
