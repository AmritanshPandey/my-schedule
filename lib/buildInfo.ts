/**
 * Build identity, injected at build time by the `build` script in package.json:
 *   NEXT_PUBLIC_APP_VERSION  — package.json version (the human version number)
 *   NEXT_PUBLIC_BUILD_TIME   — ISO build timestamp (formatted for display)
 *   NEXT_PUBLIC_BUILD_ID     — git short SHA (precise identifier)
 * Surfaced in the settings footer so you can confirm the installed PWA is the
 * latest deploy. Falls back gracefully in local `next dev`.
 */
export const APP_VERSION = process.env.NEXT_PUBLIC_APP_VERSION || "0.0.0";
export const BUILD_ID = process.env.NEXT_PUBLIC_BUILD_ID || "dev";
export const BUILD_TIME = process.env.NEXT_PUBLIC_BUILD_TIME || "";

/** Human-readable build date in the viewer's locale, e.g. "Jun 21, 2026 at 5:54 PM". */
export function buildDateLabel(): string {
  if (!BUILD_TIME) return "";
  const d = new Date(BUILD_TIME);
  if (Number.isNaN(d.getTime())) return "";
  const date = d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
  const time = d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
  return `${date} at ${time}`;
}

/** "Version 0.1.0 · Updated Jun 21, 2026 at 5:54 PM" (or just the version). */
export function versionLabel(): string {
  const when = buildDateLabel();
  return when ? `Version ${APP_VERSION} · Updated ${when}` : `Version ${APP_VERSION}`;
}
