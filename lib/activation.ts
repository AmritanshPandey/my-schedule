/**
 * "Has this person added their first task yet?" — the moment the app stops
 * being empty. Prompts that ask for something (install the app, sign in to
 * back up) wait for it: before then there's nothing worth installing or
 * backing up, and they only got between a new user and their first step.
 *
 * Remembered in localStorage once reached, since the prompts live outside the
 * schedule's own state (PWAInstallPrompt mounts in the root layout).
 */

const KEY = "planr-activated";

export function isActivated(): boolean {
  try {
    return localStorage.getItem(KEY) === "1";
  } catch {
    return false;
  }
}

/** Called by the app shells whenever the schedule holds at least one task. */
export function markActivated(): void {
  if (isActivated()) return;
  try {
    localStorage.setItem(KEY, "1");
  } catch {
    /* remembered for this page view only */
  }
}
