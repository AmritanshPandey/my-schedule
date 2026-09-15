"use client";

import { useMemo, useState } from "react";
import {
  IconAlertTriangle,
  IconArrowsSplit2,
  IconInfoCircle,
  IconPlus,
  IconX,
} from "@tabler/icons-react";
import type { Goal, GoalConnectionType, Schedule } from "@/lib/useScheduleDB";
import {
  connectGoals,
  connectionsForGoal,
  deriveConnectionImpacts,
  disconnectGoals,
  perspectiveLabel,
  CONNECTION_TYPE_OPTIONS,
} from "@/lib/goalConnections";
import Button from "@/components/ui/Button";
import IconButton from "@/components/ui/IconButton";
import { haptic } from "@/lib/haptics";

type SetScheduleFn = (updater: (prev: Schedule) => Schedule) => void;

interface GoalConnectionsSectionProps {
  goal: Goal;
  schedule: Schedule;
  setSchedule: SetScheduleFn;
}

/**
 * How this goal relates to the others, and what that currently means for it.
 *
 * §17 asks how to represent connected goals "without creating a complex graph
 * interface". The answer here is to never draw the graph: relationships are
 * added one at a time from whichever goal you are looking at, and read back as
 * sentences about *this* goal. Impacts come first, because a warning that a
 * dependency is delayed is worth more than the inventory of links that
 * produced it.
 */
export default function GoalConnectionsSection({ goal, schedule, setSchedule }: GoalConnectionsSectionProps) {
  const [adding, setAdding] = useState(false);
  const [draftType, setDraftType] = useState<GoalConnectionType>("depends_on");
  const [draftOtherId, setDraftOtherId] = useState("");

  const rows = useMemo(() => connectionsForGoal(schedule, goal.id), [schedule, goal.id]);
  const impacts = useMemo(() => deriveConnectionImpacts(schedule, goal.id), [schedule, goal.id]);

  // Only goals that still exist, aren't this one, and aren't archived — you
  // cannot usefully relate a live goal to one you've put away.
  const linkable = (schedule.goals ?? []).filter(
    (g) => g.id !== goal.id && g.status !== "archived",
  );

  function handleAdd() {
    if (!draftOtherId) return;
    haptic("light");
    setSchedule((prev) => connectGoals(prev, goal.id, draftOtherId, draftType));
    setDraftOtherId("");
    setAdding(false);
  }

  return (
    <div>
      <div className="mb-2 flex items-center justify-between gap-2">
        <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-neutral-400 dark:text-neutral-500">
          Connections
        </p>
        {!adding && linkable.length > 0 && (
          <button
            type="button"
            onClick={() => { haptic("light"); setAdding(true); }}
            className="inline-flex items-center gap-1 text-[12px] font-semibold text-neutral-500 hover:text-neutral-900 dark:text-neutral-400 dark:hover:text-white"
          >
            <IconPlus size={13} strokeWidth={2.4} />
            Connect
          </button>
        )}
      </div>

      {/* ── What these relationships mean right now ─────────────────────────
          Ahead of the list on purpose: the consequence is the reason the
          feature exists, the list is just what the user already told us. */}
      {impacts.length > 0 && (
        <div className="mb-2.5 space-y-1.5">
          {impacts.map((impact) => {
            const warn = impact.severity === "warning";
            const Icon = warn ? IconAlertTriangle : IconInfoCircle;
            return (
              <div
                key={impact.connection.id}
                className={`flex items-start gap-2 rounded-xl border px-3 py-2.5 ${
                  warn
                    ? "border-amber-200 bg-amber-50 dark:border-amber-500/20 dark:bg-amber-500/[0.08]"
                    : "border-neutral-200 bg-neutral-50 dark:border-white/10 dark:bg-white/[0.04]"
                }`}
              >
                <Icon
                  size={14}
                  strokeWidth={2}
                  className={`mt-0.5 shrink-0 ${
                    warn ? "text-amber-600 dark:text-amber-400" : "text-neutral-400 dark:text-neutral-500"
                  }`}
                />
                <p
                  className={`text-[12.5px] leading-relaxed ${
                    warn ? "text-amber-900 dark:text-amber-200" : "text-neutral-600 dark:text-neutral-300"
                  }`}
                >
                  {impact.message}
                </p>
              </div>
            );
          })}
        </div>
      )}

      {rows.length === 0 && !adding && (
        <p className="text-[13px] text-neutral-400 dark:text-neutral-500">
          {linkable.length === 0
            ? "Create another goal to connect this one to."
            : "Not connected to anything yet — link a goal this one depends on, supports, or competes with."}
        </p>
      )}

      {rows.length > 0 && (
        <div className="space-y-1.5">
          {rows.map(({ connection, other, perspective }) => (
            <div
              key={connection.id}
              className="flex items-center justify-between gap-2 rounded-xl border border-neutral-200 bg-neutral-50 px-3 py-2 dark:border-white/10 dark:bg-white/[0.04]"
            >
              <div className="flex min-w-0 items-center gap-2">
                <IconArrowsSplit2 size={13} strokeWidth={2} className="shrink-0 text-neutral-400 dark:text-neutral-500" />
                <p className="min-w-0 truncate text-[13px] text-neutral-700 dark:text-neutral-300">
                  <span className="font-semibold">{perspectiveLabel(perspective)}</span>
                  {" "}
                  {other.title}
                </p>
              </div>
              <IconButton
                label={`Remove connection to ${other.title}`}
                variant="ghost"
                size="xs"
                radius="xl"
                onClick={() => { haptic("light"); setSchedule((prev) => disconnectGoals(prev, connection.id)); }}
              >
                <IconX size={13} strokeWidth={2} />
              </IconButton>
            </div>
          ))}
        </div>
      )}

      {adding && (
        <div className="mt-2 space-y-2.5 rounded-2xl border border-neutral-200 bg-white p-3 dark:border-white/10 dark:bg-neutral-900">
          {/* Type first, then the goal: picking the relationship is what makes
              the goal list meaningful, and the hint under each type is where
              the vocabulary is actually taught. */}
          <div className="grid grid-cols-2 gap-1.5">
            {CONNECTION_TYPE_OPTIONS.map((option) => (
              <button
                key={option.type}
                type="button"
                onClick={() => { haptic("light"); setDraftType(option.type); }}
                aria-pressed={draftType === option.type}
                className={`rounded-xl border px-2.5 py-2 text-left transition-colors ${
                  draftType === option.type
                    ? "border-emerald-500/60 bg-emerald-50/70 dark:border-emerald-500/40 dark:bg-emerald-500/[0.09]"
                    : "border-neutral-200 hover:border-neutral-300 dark:border-white/10 dark:hover:border-white/20"
                }`}
              >
                <span className="block text-[12.5px] font-bold text-neutral-900 dark:text-white">
                  {option.label}
                </span>
                <span className="mt-0.5 block text-[11px] leading-snug text-neutral-500 dark:text-neutral-400">
                  {option.hint}
                </span>
              </button>
            ))}
          </div>

          <select
            value={draftOtherId}
            onChange={(e) => setDraftOtherId(e.target.value)}
            className="h-11 w-full rounded-xl border border-neutral-200 bg-neutral-50 px-3 text-[14px] text-neutral-900 outline-none dark:border-white/10 dark:bg-white/[0.04] dark:text-white"
          >
            <option value="">Choose a goal…</option>
            {linkable.map((g) => (
              <option key={g.id} value={g.id}>{g.title}</option>
            ))}
          </select>

          <div className="flex gap-2">
            <Button size="sm" onClick={handleAdd} disabled={!draftOtherId}>Connect</Button>
            <Button size="sm" variant="secondary" onClick={() => { setAdding(false); setDraftOtherId(""); }}>
              Cancel
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
