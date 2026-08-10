"use client";

/**
 * Firestore-backed push config — what the scheduled Cloud Function needs to know
 * to send reminders while the app is closed. Mirrors data that otherwise lives
 * only on-device: the reminder settings, the user's timezone (to turn a ritual's
 * local "07:00" into a UTC fire time), and each device's push subscription.
 *
 * All writes are no-ops for guests (no uid) or when Firebase isn't configured,
 * matching the guest-safe posture of lib/cloudSync.ts. Doc paths sit under
 * users/{uid}/**, which firestore.rules already scopes to that uid.
 */

import { doc, setDoc, deleteDoc, serverTimestamp } from "firebase/firestore";
import { db } from "@/lib/firebase";
import type { ReminderSettings } from "@/lib/reminders";

/** A stable, path-safe doc id derived from the subscription endpoint. */
function endpointId(endpoint: string): string {
  let hash = 5381;
  for (let i = 0; i < endpoint.length; i++) hash = ((hash << 5) + hash + endpoint.charCodeAt(i)) | 0;
  return `sub_${(hash >>> 0).toString(36)}_${endpoint.length}`;
}

/** Write the reminder settings + resolved timezone for this user. */
export async function savePushConfig(uid: string | null, settings: ReminderSettings): Promise<void> {
  if (!db || !uid) return;
  const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  await setDoc(
    doc(db, "users", uid, "push", "config"),
    { settings, timeZone, updatedAt: serverTimestamp() },
    { merge: true },
  );
}

/** Register this device's push subscription so the server can reach it. */
export async function savePushSubscription(uid: string | null, sub: PushSubscriptionJSON): Promise<void> {
  if (!db || !uid || !sub.endpoint) return;
  await setDoc(
    doc(db, "users", uid, "pushSubscriptions", endpointId(sub.endpoint)),
    { subscription: sub, createdAt: serverTimestamp(), lastSeenAt: serverTimestamp() },
    { merge: true },
  );
}

/** Remove this device's subscription (on disable / logout). */
export async function removePushSubscription(uid: string | null, sub: PushSubscriptionJSON | null): Promise<void> {
  if (!db || !uid || !sub?.endpoint) return;
  await deleteDoc(doc(db, "users", uid, "pushSubscriptions", endpointId(sub.endpoint)));
}
