"use client";

/**
 * On-device-only record of recently-rejected AI proposal titles, fed back
 * into future prompts so the model stops repeating a suggestion the user
 * just declined.
 *
 * Deliberately NOT part of schedule.events: that log is shared/synced and
 * has an explicit, tested boundary against carrying raw AI-generated free
 * text (tests/proposal.test.mjs — "AI_PROPOSAL_* events only ever carry
 * whitelisted metadata, never raw AI text"). A rejected proposal's title
 * (e.g. "Create task: Morning Run") is exactly that kind of free text, so it
 * lives here instead — a small, capped, on-device-only ring buffer, same
 * storage shape as lib/ai/capture.ts's interaction log but far lighter
 * (titles only, not full prompts/responses) and always-on rather than
 * opt-in, since it's core to how the proposal boundary behaves day to day
 * rather than a separate power-user data-collection feature.
 */
import { safeGetItem, safeSetItem } from "@/lib/safeStorage";

const STORAGE_KEY = "planr:ai:recent-rejections";
const MAX_STORED = 20;

interface StoredRejection {
  title: string;
  time: number; // epoch ms
}

function safeRead(): StoredRejection[] {
  const raw = safeGetItem(STORAGE_KEY);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed)
      ? parsed.filter((r): r is StoredRejection => typeof r?.title === "string" && typeof r?.time === "number")
      : [];
  } catch {
    return [];
  }
}

/** Record one rejected proposal's title. Best-effort and silent on failure —
 *  mirrors lib/ai/capture.ts's captureInteraction: this rides along on a
 *  user action and must never surface as an error of its own. */
export function recordRejectedProposal(title: string): void {
  if (!title.trim()) return;
  try {
    const next = [...safeRead(), { title: title.trim(), time: Date.now() }].slice(-MAX_STORED);
    safeSetItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    /* best effort */
  }
}

/** Most-recently-rejected proposal titles first, capped at `limit`. */
export function getRecentRejectionTitles(limit = 3): string[] {
  return safeRead()
    .slice()
    .sort((a, b) => b.time - a.time)
    .slice(0, limit)
    .map((r) => r.title);
}
