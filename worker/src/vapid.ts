/**
 * Telling our configuration problems apart from the user's data problems.
 *
 * Every VAPID failure surfaces as a throw from `buildPushPayload`, worded
 * indistinguishably from genuinely corrupt subscription keys. That matters
 * because the two demand opposite responses: a bad subscription should be
 * pruned, and a bad secret must never prune anything. Collapsing them meant a
 * single missing Worker secret deleted every user's working subscription, on
 * the first cron tick, once a minute, for a problem no user could fix — while
 * the test endpoint told them to "turn Reminders off and on again".
 *
 * Kept in its own module (like base64url.ts and reminders.ts) so it can be
 * unit-tested without importing firestore.ts, whose constructor parameter
 * properties Node's strip-only TypeScript mode refuses to load.
 */

export interface VapidLike {
  subject?: string;
  publicKey?: string;
  privateKey?: string;
}

/** VAPID failures name themselves; nothing else in the payload build does. */
export function isVapidFailure(message: string): boolean {
  return /vapid/i.test(message);
}

/**
 * Whether the Worker is configured to send at all, and which secret is absent.
 *
 * Checked before a run touches anyone's data, so a missing secret costs one log
 * line rather than a sweep that prunes live subscriptions.
 */
export function vapidConfigProblem(vapid: VapidLike): string | null {
  if (!vapid.subject) return "VAPID_SUBJECT is not set";
  if (!vapid.publicKey) return "VAPID_PUBLIC_KEY is not set";
  if (!vapid.privateKey) return "VAPID_PRIVATE_KEY is not set";
  return null;
}
