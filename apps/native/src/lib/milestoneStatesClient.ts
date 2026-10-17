/**
 * Client for the `getMilestoneStates` Cloud Function (functions/src/index.ts)
 * — the same calculateMilestoneState numbers the app already computes
 * locally (packages/core/lib/milestoneHealth.ts), recomputed server-side. Native port
 * of lib/milestoneStatesClient.ts — same callable, same request/response. Not used for the
 * app's own normal rendering (that stays local-first and instant, per
 * PRODUCT.md) — this is for surfaces that want the authoritative answer
 * without carrying the whole Schedule themselves: a cross-device refresh, a
 * future widget, or manual verification against the daily digest doc.
 *
 * Auth is implicit: httpsCallable attaches the signed-in user's Firebase ID
 * token automatically, and the Function rejects with "unauthenticated" if
 * there isn't one (see functions/src/index.ts) — nothing here decides who's
 * allowed to call this, the callable's own auth check does.
 */

import { httpsCallable } from "firebase/functions";
import { functions } from "./firebase";
import type { MilestoneState } from "@planr/core/lib/milestoneHealth";

export interface RemoteMilestoneState {
  milestoneId: string;
  planId: string;
  planTitle: string;
  milestoneTitle: string;
  state: MilestoneState;
}

export interface GetMilestoneStatesResult {
  generatedAt: string;
  milestones: RemoteMilestoneState[];
}

/**
 * Recomputes milestone health server-side for the signed-in user, optionally
 * scoped to one plan. Throws when signed out or offline — callers decide how
 * to surface that, same as any other network call in this app.
 */
export async function fetchMilestoneStatesFromServer(planId?: string): Promise<GetMilestoneStatesResult> {
  if (!functions) {
    throw new Error("Cloud Functions not configured — Firebase config is still a placeholder (see firebaseConfig.ts).");
  }
  const call = httpsCallable<{ planId?: string }, GetMilestoneStatesResult>(functions, "getMilestoneStates");
  const result = await call(planId ? { planId } : {});
  return result.data;
}
