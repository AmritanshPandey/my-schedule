/**
 * Shared append-and-cap helper for `Schedule.events`. Extracted out of
 * lib/goalMutations.ts (which introduced the event log) so a second domain
 * mutation module — lib/proposalMutations.ts — doesn't reimplement it.
 * No React/IndexedDB/auth deps, so it's safe for pure Schedule-mutation
 * modules to import.
 */
import type { DomainEventType, ScheduleEvent } from "./useScheduleDB";
import { MAX_SCHEDULE_EVENTS } from "./scheduleConstants";
import { uid } from "./id";

export function pushEvent(
  events: ScheduleEvent[] | undefined,
  type: DomainEventType,
  entityId: string,
  timestamp: string,
  data?: Record<string, unknown>,
): ScheduleEvent[] {
  const next = [...(events ?? []), { id: uid(), type, entityId, timestamp, data }];
  return next.length > MAX_SCHEDULE_EVENTS ? next.slice(next.length - MAX_SCHEDULE_EVENTS) : next;
}
