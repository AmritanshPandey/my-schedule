/**
 * Build identity, injected at build time by the `build` script in package.json
 * (NEXT_PUBLIC_BUILD_ID = git short SHA, NEXT_PUBLIC_BUILD_TIME = build clock).
 * Surfaced in the settings footer so you can confirm the installed PWA is
 * running the latest deploy (compare the SHA to `git rev-parse --short HEAD`).
 * Falls back to "dev" in local `next dev`.
 */
export const BUILD_ID = process.env.NEXT_PUBLIC_BUILD_ID || "dev";
export const BUILD_TIME = process.env.NEXT_PUBLIC_BUILD_TIME || "";

/** Short label, e.g. "a1b2c3d · Jun 21 17:50" (or just the id when no time). */
export function buildLabel(): string {
  return BUILD_TIME ? `${BUILD_ID} · ${BUILD_TIME}` : BUILD_ID;
}
