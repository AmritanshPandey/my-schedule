/**
 * Auth failure vocabulary — the single place that decides whether a sign-in
 * error is worth showing the user, and what it should say.
 *
 * Sign-in used to fail silently in three separate places: every call site
 * swallowed the exception with an empty `catch`, so "you closed the popup" and
 * "this domain isn't authorized" looked identical (i.e. like nothing at all).
 * Keeping the swallow-list here means it can't drift apart again.
 */

/**
 * Thrown by `login()` when Firebase was never initialized (missing env vars).
 *
 * Carries a `code` in the Firebase namespace so it flows through the same
 * lookup as a real `FirebaseError` — one map handles both.
 */
export class AuthUnavailableError extends Error {
  readonly code = "auth/not-configured";

  constructor() {
    super(
      "Firebase auth is not configured (missing NEXT_PUBLIC_FIREBASE_* env vars).",
    );
    this.name = "AuthUnavailableError";
  }
}

/** Best-effort read of the `code` off a FirebaseError-shaped unknown. */
function codeOf(err: unknown): string {
  if (typeof err === "object" && err !== null && "code" in err) {
    const code = (err as { code: unknown }).code;
    if (typeof code === "string") return code;
  }
  return "";
}

/**
 * The only codes that mean "the user changed their mind". Everything else is a
 * real failure and must be surfaced — silence is what made this a bug.
 */
const DISMISSAL_CODES = new Set([
  "auth/popup-closed-by-user",
  "auth/cancelled-popup-request",
]);

export function isUserDismissal(err: unknown): boolean {
  return DISMISSAL_CODES.has(codeOf(err));
}

/** Name the fix wherever there is one; stay calm, never cute. */
const MESSAGES: Record<string, string> = {
  "auth/popup-blocked":
    "Your browser blocked the sign-in window. Allow popups for this site, then try again.",
  "auth/unauthorized-domain":
    "This domain isn't authorized for sign-in. Add it under Firebase Console → Authentication → Settings → Authorized domains.",
  "auth/network-request-failed":
    "Couldn't reach Google. Check your connection and try again.",
  "auth/operation-not-allowed":
    "Google sign-in isn't enabled for this project.",
  "auth/too-many-requests":
    "Too many attempts. Wait a moment and try again.",
  "auth/account-exists-with-different-credential":
    "An account with this email already exists using a different sign-in method.",
  "auth/not-configured":
    "Sync is unavailable in this build — it's missing its Firebase configuration.",
};

/**
 * Maps a sign-in failure to inline copy.
 *
 * @returns `null` when the failure should be swallowed silently (user
 * dismissal), otherwise a sentence to render beneath the button.
 */
export function authErrorMessage(err: unknown): string | null {
  if (isUserDismissal(err)) return null;

  const code = codeOf(err);
  // Include the raw code so an unmapped failure is still diagnosable from a
  // screenshot rather than collapsing into a shrug.
  return MESSAGES[code] ?? `Couldn't sign in (${code || "unknown error"}). Try again.`;
}
