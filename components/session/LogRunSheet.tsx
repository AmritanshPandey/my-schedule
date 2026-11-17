"use client";

import { useEffect, useState } from "react";
import { IconCheck } from "@tabler/icons-react";
import BottomSheet from "@/components/ui/BottomSheet";
import SheetHeader from "@/components/ui/SheetHeader";
import Button from "@/components/ui/Button";
import SegmentedControl from "@/components/ui/SegmentedControl";
import { FORM_INPUT_CLASS, FORM_LABEL, Textarea } from "@/components/ui/Input";
import type { RunEffort, Session, SessionLog } from "@/lib/useScheduleDB";
import { formatPace, paceSecPerKm, plannedDistanceM, validateRunLog } from "@/lib/sessions";

export interface LogRunSheetProps {
  open: boolean;
  session: Session | null;
  /** The existing typed or Health log, to edit. */
  initial?: SessionLog;
  onSave: (actual: { distanceM: number; durationSec: number; effort?: RunEffort }, note: string | undefined) => void;
  onClose: () => void;
}

const EFFORTS = [
  { value: "easy", label: "Easy" },
  { value: "ok", label: "OK" },
  { value: "hard", label: "Hard" },
] as const;

const num = (v: string) => (v.trim() === "" ? Number.NaN : Number(v.replace(",", ".")));

/** Type in a run: distance and time, pace worked out as you go. */
export default function LogRunSheet({ open, session, initial, onSave, onClose }: LogRunSheetProps) {
  const [distance, setDistance] = useState("");
  const [minutes, setMinutes] = useState("");
  const [seconds, setSeconds] = useState("");
  const [effort, setEffort] = useState<RunEffort>("ok");
  const [note, setNote] = useState("");
  const [tried, setTried] = useState(false);

  useEffect(() => {
    if (!open || !session) return;
    const a = initial?.actual;
    setDistance(a ? String(Math.round(a.distanceM / 10) / 100) : String(plannedDistanceM(session) / 1000));
    setMinutes(a ? String(Math.floor(a.durationSec / 60)) : "");
    setSeconds(a ? String(a.durationSec % 60) : "");
    setEffort(a?.effort ?? "ok");
    setNote(initial?.note ?? "");
    setTried(false);
  }, [open, session, initial]);

  const input = { distanceKm: num(distance), minutes: num(minutes), seconds: num(seconds) };
  const error = validateRunLog(input);
  const durationSec = (Number.isFinite(input.minutes) ? input.minutes : 0) * 60 + (Number.isFinite(input.seconds) ? input.seconds : 0);
  const pace = !error ? formatPace(paceSecPerKm({ distanceM: input.distanceKm * 1000, durationSec })) : null;

  function save() {
    setTried(true);
    if (error) return;
    onSave({ distanceM: Math.round(input.distanceKm * 1000), durationSec: Math.round(durationSec), effort }, note.trim() || undefined);
  }

  return (
    <BottomSheet open={open} onClose={onClose} maxHeight="92vh" desktopWidth="max-w-[480px]">
      <div className="px-5 pb-8">
        <SheetHeader eyebrow="Log run" title={session?.title ?? "Run"} onClose={onClose} />
        <div className="mt-4 space-y-5">
          <div>
            <label htmlFor="log-distance" className={FORM_LABEL}>Distance (km)</label>
            <input
              id="log-distance"
              inputMode="decimal"
              value={distance}
              onChange={(e) => setDistance(e.target.value)}
              className={FORM_INPUT_CLASS}
            />
          </div>
          <div>
            <span className={FORM_LABEL}>Time</span>
            <div className="flex items-center gap-2">
              <input
                aria-label="Minutes"
                inputMode="numeric"
                placeholder="min"
                value={minutes}
                onChange={(e) => setMinutes(e.target.value)}
                className={FORM_INPUT_CLASS}
              />
              <span className="text-[16px] font-bold text-neutral-500" aria-hidden>:</span>
              <input
                aria-label="Seconds"
                inputMode="numeric"
                placeholder="sec"
                value={seconds}
                onChange={(e) => setSeconds(e.target.value)}
                className={FORM_INPUT_CLASS}
              />
            </div>
            <p className="mt-2 text-[13px] font-semibold tabular-nums text-neutral-600 dark:text-neutral-300" aria-live="polite">
              {pace ? `Pace ${pace}` : " "}
            </p>
          </div>
          <div>
            <span className={FORM_LABEL}>How did it feel?</span>
            <SegmentedControl ariaLabel="How did it feel?" options={EFFORTS} value={effort} onChange={setEffort} />
          </div>
          <Textarea label="Note" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Optional" />
          {tried && error && (
            <p role="alert" className="text-[13px] font-semibold text-rose-600 dark:text-rose-400">{error}</p>
          )}
          <Button variant="cta" fullWidth onClick={save} icon={<IconCheck size={18} strokeWidth={2.5} />}>
            Save run
          </Button>
        </div>
      </div>
    </BottomSheet>
  );
}
