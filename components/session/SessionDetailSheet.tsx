"use client";

import { useEffect, useState } from "react";
import { IconArrowBackUp, IconCalendarEvent, IconCheck, IconPencil, IconPlayerSkipForward, IconRun } from "@tabler/icons-react";
import BottomSheet from "@/components/ui/BottomSheet";
import SheetHeader from "@/components/ui/SheetHeader";
import Button from "@/components/ui/Button";
import DateInput from "@/components/ui/DateInput";
import TimeInput from "@/components/ui/TimeInput";
import { FORM_LABEL } from "@/components/ui/Input";
import { typography } from "@/components/ui/Typography";
import type { Session, SessionLog, SessionTask } from "@/lib/useScheduleDB";
import { formatDistance, formatPace, paceSecPerKm, plannedDistanceM, type SessionState } from "@/lib/sessions";
import { formatDisplayTime } from "@/lib/timeUtils";

export interface SessionDetailSheetProps {
  open: boolean;
  session: Session | null;
  state: SessionState;
  actual?: SessionLog;
  planTitle?: string;
  easyPaceSecPerKm?: number;
  readOnly?: boolean;
  onClose: () => void;
  onLog: () => void;
  onMarkDone: () => void;
  onUndo: () => void;
  onSkip: () => void;
  onMove: (dateISO: string, startTime: string | undefined) => void;
}

function taskLine(task: SessionTask): string {
  if (task.kind === "simple") return task.title;
  const { distanceM, paceSecPerKm: pace, repeats, restSec } = task.plan;
  const d = repeats && repeats > 1 ? `${repeats} × ${formatDistance(distanceM)}` : formatDistance(distanceM);
  const parts = [d, pace ? `@ ${formatPace(pace)}` : null, restSec && repeats && repeats > 1 ? `${restSec} s rest` : null];
  return parts.filter(Boolean).join(" ");
}

function dateLabel(iso: string): string {
  return new Date(`${iso}T12:00:00`).toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric" });
}

/** One session: what's planned, what you ran beside it, and what you can do with it. */
export default function SessionDetailSheet(props: SessionDetailSheetProps) {
  const { open, session, state, actual, planTitle, readOnly = false, onClose, onLog, onMarkDone, onUndo, onSkip, onMove } = props;
  const [moving, setMoving] = useState(false);
  const [moveDate, setMoveDate] = useState("");
  const [moveTime, setMoveTime] = useState("");

  useEffect(() => {
    if (!open || !session) return;
    setMoving(false);
    setMoveDate(session.dateISO);
    setMoveTime(session.startTime ?? "");
  }, [open, session]);

  if (!session) return null;
  const done = state === "done";
  const plannedKm = plannedDistanceM(session);
  const a = actual?.actual;

  return (
    <BottomSheet open={open} onClose={onClose} maxHeight="92vh" desktopWidth="max-w-[480px]">
      <div className="px-5 pb-8">
        <SheetHeader eyebrow={planTitle ?? "Session"} title={session.title} onClose={onClose} />
        <p className="mt-1 text-[13px] font-semibold text-neutral-600 dark:text-neutral-300">
          {dateLabel(session.dateISO)}
          {session.startTime ? ` · ${formatDisplayTime(session.startTime)}` : " · Any time"}
          {session.estimatedMinutes ? ` · ${session.estimatedMinutes} min` : ""}
        </p>

        <ol className="mt-5 space-y-2">
          {session.tasks.map((t) => (
            <li key={t.id} className="flex items-center gap-3 rounded-xl border border-neutral-200/70 bg-white px-4 py-3 dark:border-white/[0.07] dark:bg-neutral-900">
              <IconRun size={16} strokeWidth={2} className="shrink-0 text-neutral-500 dark:text-neutral-400" aria-hidden />
              <div className="min-w-0">
                <p className="text-[14px] font-bold text-neutral-900 dark:text-white">{t.title}</p>
                <p className="text-[13px] font-medium tabular-nums text-neutral-600 dark:text-neutral-300">{taskLine(t)}</p>
              </div>
            </li>
          ))}
        </ol>

        <div className="mt-5 grid grid-cols-2 gap-3">
          <div className="rounded-xl bg-neutral-100 px-4 py-3 dark:bg-white/[0.05]">
            <p className={typography.eyebrow}>Planned</p>
            <p className="mt-1 text-[15px] font-bold tabular-nums text-neutral-900 dark:text-white">{formatDistance(plannedKm)}</p>
          </div>
          <div className="rounded-xl bg-neutral-100 px-4 py-3 dark:bg-white/[0.05]">
            <p className={typography.eyebrow}>You ran</p>
            <p className="mt-1 text-[15px] font-bold tabular-nums text-neutral-900 dark:text-white">
              {a ? `${formatDistance(a.distanceM)} @ ${formatPace(paceSecPerKm(a))}` : done ? "Done" : "Not yet"}
            </p>
            {actual?.source === "health" && <p className="mt-0.5 text-[12px] font-medium text-neutral-500 dark:text-neutral-400">From Apple Health</p>}
          </div>
        </div>
        {actual?.note && <p className="mt-3 text-[13px] text-neutral-600 dark:text-neutral-300">{actual.note}</p>}

        {!readOnly && (
          <div className="mt-6 space-y-2">
            {done ? (
              <>
                <Button variant="primary" fullWidth onClick={onLog} icon={<IconPencil size={16} strokeWidth={2.2} />}>
                  {a ? "Edit log" : "Add distance and time"}
                </Button>
                <Button variant="secondary" fullWidth onClick={onUndo} icon={<IconArrowBackUp size={16} strokeWidth={2.2} />}>
                  Mark not done
                </Button>
              </>
            ) : (
              <>
                <Button variant="cta" fullWidth onClick={onLog} icon={<IconRun size={18} strokeWidth={2.2} />}>
                  Log run
                </Button>
                <div className="grid grid-cols-3 gap-2">
                  <Button variant="secondary" onClick={onMarkDone} icon={<IconCheck size={16} strokeWidth={2.4} />}>Done</Button>
                  <Button variant="secondary" onClick={() => setMoving((v) => !v)} icon={<IconCalendarEvent size={16} strokeWidth={2.2} />}>Move</Button>
                  <Button variant="secondary" onClick={onSkip} icon={<IconPlayerSkipForward size={16} strokeWidth={2.2} />}>Skip</Button>
                </div>
              </>
            )}
            {moving && !done && (
              <div className="mt-3 space-y-3 rounded-2xl border border-neutral-200/70 p-4 dark:border-white/[0.07]">
                <div>
                  <span className={FORM_LABEL}>Day</span>
                  <DateInput value={moveDate} onChange={setMoveDate} />
                </div>
                <TimeInput label="Time" value={moveTime} onChange={setMoveTime} />
                <Button variant="primary" fullWidth disabled={!moveDate} onClick={() => onMove(moveDate, moveTime || undefined)}>
                  Move run
                </Button>
              </div>
            )}
          </div>
        )}
      </div>
    </BottomSheet>
  );
}
