/**
 * PlanR's Cloud Functions — server-side milestone health, on the same
 * `users/{uid}/data/snapshot` document the client (lib/cloudSync.ts) and the
 * Cloudflare reminders Worker (worker/src/index.ts) already read. Two
 * entry points:
 *
 * 1. `getMilestoneStates` (callable): on-demand, authenticated recompute for
 *    a signed-in user — the same numbers PlanDetailView/TrackingView show,
 *    available to any caller that isn't the web client itself (another
 *    surface, a script, a future native widget) without duplicating
 *    lib/milestoneHealth.ts a second time.
 * 2. `dailyMilestoneDigest` (scheduled): runs once a day for every user,
 *    independent of whether they ever open the app, and writes an
 *    at-risk/delayed summary to `users/{uid}/data/milestoneDigest`.
 *    Deliberately does NOT send a push notification itself — the Worker
 *    already owns Web Push delivery (its own VAPID keys, subscription
 *    pruning, per-day dedup); duplicating that stack here would mean two
 *    independent places that can send a notification and disagree. The
 *    Worker's own cron can read this digest doc the same way it already
 *    reads `data/snapshot`, the next time push-based milestone alerts are
 *    wanted — this function's job stops at "the answer is computed and
 *    written somewhere every client and the Worker can trust."
 *
 * Auth: callable functions verify the caller's Firebase ID token
 * automatically (`request.auth`) — there is no separate token-checking code
 * to write or get wrong. The scheduled function runs as the project's own
 * service identity and reads via the Admin SDK, which bypasses
 * firestore.rules entirely (same trust boundary the Worker's service-account
 * REST client already has).
 */

import { initializeApp } from "firebase-admin/app";
import { getFirestore, Timestamp } from "firebase-admin/firestore";
import { onCall, HttpsError } from "firebase-functions/v2/https";
import { onSchedule } from "firebase-functions/v2/scheduler";
import { logger } from "firebase-functions";
import type { Schedule } from "@planr/core/lib/scheduleTypes";
import { computeAllMilestoneStates, type MilestoneStateResult } from "./milestones.js";

initializeApp();

function db() {
  return getFirestore();
}

async function readSchedule(uid: string): Promise<Schedule | null> {
  const snap = await db().doc(`users/${uid}/data/snapshot`).get();
  if (!snap.exists) return null;
  const schedule = snap.data()?.schedule as Schedule | undefined;
  return schedule ?? null;
}

// ── Callable: getMilestoneStates ────────────────────────────────────────────

interface GetMilestoneStatesRequest {
  /** Restrict to one plan's milestones. Omit for every milestone the user has. */
  planId?: string;
}

interface GetMilestoneStatesResponse {
  generatedAt: string;
  milestones: MilestoneStateResult[];
}

export const getMilestoneStates = onCall<GetMilestoneStatesRequest>(
  { region: "us-central1" },
  async (request): Promise<GetMilestoneStatesResponse> => {
    const uid = request.auth?.uid;
    if (!uid) {
      throw new HttpsError("unauthenticated", "Sign in to compute milestone health.");
    }

    const schedule = await readSchedule(uid);
    if (!schedule) {
      return { generatedAt: new Date().toISOString(), milestones: [] };
    }

    let milestones = computeAllMilestoneStates(schedule);
    const planId = request.data?.planId;
    if (planId) milestones = milestones.filter((m) => m.planId === planId);

    return { generatedAt: new Date().toISOString(), milestones };
  },
);

// ── Scheduled: dailyMilestoneDigest ─────────────────────────────────────────

/** Only these two health states are worth a digest entry — everything else
 *  (on_track, ahead, completed, not_started, getting_started) is either fine
 *  or has nothing yet to say. */
const DIGEST_HEALTHS = new Set(["at_risk", "delayed"]);

export const dailyMilestoneDigest = onSchedule(
  { schedule: "every day 08:00", timeZone: "UTC", region: "us-central1" },
  async () => {
    const firestore = db();
    // Mirrors worker/src/index.ts's own collectionGroup walk (over "push"
    // configs there, over "data" snapshots here) — same established pattern
    // for "every user that has one of these docs," not a new access style.
    const snapshots = await firestore.collectionGroup("data").get();

    let usersScanned = 0;
    let digestsWritten = 0;

    for (const doc of snapshots.docs) {
      if (doc.id !== "snapshot") continue;
      const uid = doc.ref.parent.parent?.id;
      if (!uid) continue;
      usersScanned++;

      try {
        const schedule = doc.data().schedule as Schedule | undefined;
        if (!schedule) continue;

        const flagged = computeAllMilestoneStates(schedule).filter((m) => DIGEST_HEALTHS.has(m.state.health));
        if (flagged.length === 0) continue;

        await firestore.doc(`users/${uid}/data/milestoneDigest`).set({
          generatedAt: Timestamp.now(),
          milestones: flagged.map((m) => ({
            milestoneId: m.milestoneId,
            planId: m.planId,
            planTitle: m.planTitle,
            milestoneTitle: m.milestoneTitle,
            health: m.state.health,
            statusMessage: m.state.statusMessage,
          })),
        });
        digestsWritten++;
      } catch (err) {
        logger.error("dailyMilestoneDigest failed for user", { uid, error: String(err) });
      }
    }

    logger.info("dailyMilestoneDigest complete", { usersScanned, digestsWritten });
  },
);
