"use client";

import { useEffect, useMemo, useState } from "react";
import { IconRun } from "@tabler/icons-react";
import BottomSheet from "@/components/ui/BottomSheet";
import SheetHeader from "@/components/ui/SheetHeader";
import Button from "@/components/ui/Button";
import SegmentedControl from "@/components/ui/SegmentedControl";
import WeekdayPicker from "@/components/ui/WeekdayPicker";
import DateInput from "@/components/ui/DateInput";
import TimeInput from "@/components/ui/TimeInput";
import { FORM_INPUT_CLASS, FORM_LABEL } from "@/components/ui/Input";
import type { DayKey, RunPlanInputs } from "@/lib/useScheduleDB";
import { generateRunPlan, summarizeRunPlan, validateRunInputs } from "@/lib/runPlan";
import { headline } from "@/lib/sessions";
import { localISODate } from "@/lib/dateUtils";

export interface RunPlanSetupSheetProps {
  open: boolean;
  onCreate: (inputs: RunPlanInputs, createGoal: boolean) => void;
  onClose: () => void;
}

const num = (v: string) => (v.trim() === "" ? Number.NaN : Number(v.replace(",", ".")));
const paceSec = (min: string, sec: string) => {
  const m = num(min);
  const s = sec.trim() === "" ? 0 : num(sec);
  return Number.isFinite(m) && Number.isFinite(s) ? m * 60 + s : Number.NaN;
};

export const GUIDANCE = "This plan is general guidance. Listen to your body and ease off if something hurts.";

/** The "Run a 5K" template's questions, with a live preview of the plan they make. */
export default function RunPlanSetupSheet({ open, onCreate, onClose }: RunPlanSetupSheetProps) {
  const [current, setCurrent] = useState("3");
  const [easyMin, setEasyMin] = useState("6");
  const [easySec, setEasySec] = useState("30");
  const [target, setTarget] = useState("5");
  const [goalMode, setGoalMode] = useState<"pace" | "finish">("finish");
  const [targetMin, setTargetMin] = useState("6");
  const [targetSec, setTargetSec] = useState("00");
  const [weeks, setWeeks] = useState("8");
  const [days, setDays] = useState<DayKey[]>(["monday", "wednesday", "friday", "sunday"]);
  const [time, setTime] = useState("");
  const [start, setStart] = useState("");
  const [createGoal, setCreateGoal] = useState(true);
  const [tried, setTried] = useState(false);

  useEffect(() => {
    if (open) {
      setStart(localISODate(new Date()));
      setTried(false);
    }
  }, [open]);

  const inputs: RunPlanInputs = {
    currentDistanceKm: num(current),
    easyPaceSecPerKm: paceSec(easyMin, easySec),
    targetDistanceKm: num(target),
    ...(goalMode === "pace" ? { targetPaceSecPerKm: paceSec(targetMin, targetSec) } : {}),
    weeks: Math.round(num(weeks)),
    runDays: days,
    ...(time ? { startTime: time } : {}),
    startISO: start,
  };
  const today = localISODate(new Date());
  const error = goalMode === "pace" && !(inputs.targetPaceSecPerKm! > 0) ? "Enter your target pace." : validateRunInputs(inputs, today);

  const preview = useMemo(() => {
    if (error) return null;
    const sessions = generateRunPlan(inputs, [], "preview", new Date().toISOString());
    return { summary: summarizeRunPlan(sessions), week1: sessions.filter((s) => s.generated?.weekIndex === 1) };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [error, JSON.stringify(inputs)]);

  const field = (id: string, label: string, value: string, set: (v: string) => void, mode: "decimal" | "numeric" = "decimal") => (
    <div>
      <label htmlFor={id} className={FORM_LABEL}>{label}</label>
      <input id={id} inputMode={mode} value={value} onChange={(e) => set(e.target.value)} className={FORM_INPUT_CLASS} />
    </div>
  );
  const paceFields = (label: string, min: string, setMin: (v: string) => void, sec: string, setSec: (v: string) => void) => (
    <div>
      <span className={FORM_LABEL}>{label}</span>
      <div className="flex items-center gap-2">
        <input aria-label={`${label} minutes`} inputMode="numeric" value={min} onChange={(e) => setMin(e.target.value)} className={FORM_INPUT_CLASS} />
        <span className="text-[16px] font-bold text-neutral-500" aria-hidden>:</span>
        <input aria-label={`${label} seconds`} inputMode="numeric" value={sec} onChange={(e) => setSec(e.target.value)} className={FORM_INPUT_CLASS} />
        <span className="shrink-0 text-[13px] font-semibold text-neutral-500 dark:text-neutral-400">/km</span>
      </div>
    </div>
  );

  return (
    <BottomSheet open={open} onClose={onClose} maxHeight="94vh" desktopWidth="max-w-[560px]">
      <div className="px-5 pb-8">
        <SheetHeader eyebrow="Template" title="Run a 5K" onClose={onClose} />
        <div className="mt-4 space-y-5">
          <div className="grid grid-cols-2 gap-3">
            {field("run-current", "You can run now (km)", current, setCurrent)}
            {field("run-target", "Target distance (km)", target, setTarget)}
          </div>
          {paceFields("Easy pace", easyMin, setEasyMin, easySec, setEasySec)}
          <div>
            <span className={FORM_LABEL}>Goal</span>
            <SegmentedControl
              ariaLabel="Goal"
              options={[{ value: "finish", label: "Just finish" }, { value: "pace", label: "Target pace" }] as const}
              value={goalMode}
              onChange={setGoalMode}
            />
          </div>
          {goalMode === "pace" && paceFields("Target pace", targetMin, setTargetMin, targetSec, setTargetSec)}
          <div className="grid grid-cols-2 gap-3">
            {field("run-weeks", "Weeks", weeks, setWeeks, "numeric")}
            <div>
              <span className={FORM_LABEL}>Start</span>
              <DateInput value={start} onChange={setStart} min={today} />
            </div>
          </div>
          <div>
            <span className={FORM_LABEL}>Run days</span>
            <WeekdayPicker selected={days} onChange={setDays} allowEmpty />
          </div>
          <TimeInput label="Usual time (optional)" value={time} onChange={setTime} />
          <label className="flex min-h-[44px] items-center gap-3 text-[14px] font-semibold text-neutral-800 dark:text-neutral-200">
            <input type="checkbox" checked={createGoal} onChange={(e) => setCreateGoal(e.target.checked)} className="h-5 w-5 accent-neutral-900 dark:accent-white" />
            Also add this as a goal
          </label>

          {preview && (
            <div className="rounded-2xl border border-neutral-200/70 bg-white p-4 dark:border-white/[0.07] dark:bg-neutral-900">
              <p className="text-[14px] font-bold text-neutral-900 dark:text-white">
                {preview.summary.weeks} weeks · {preview.summary.runsPerWeek} runs a week · long run grows {preview.summary.longRunFromKm} to {preview.summary.longRunToKm} km
              </p>
              <ul className="mt-3 space-y-1.5">
                {preview.week1.map((s) => (
                  <li key={s.id} className="flex gap-2 text-[13px]">
                    <span className="w-10 shrink-0 font-semibold text-neutral-500 dark:text-neutral-400">
                      {new Date(`${s.dateISO}T12:00:00`).toLocaleDateString("en-US", { weekday: "short" })}
                    </span>
                    <span className="min-w-0 truncate font-medium text-neutral-800 dark:text-neutral-200">{s.title} · {headline(s)}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          <p className="text-[12.5px] font-medium text-neutral-500 dark:text-neutral-400">{GUIDANCE}</p>
          {tried && error && <p role="alert" className="text-[13px] font-semibold text-rose-600 dark:text-rose-400">{error}</p>}
          <Button
            variant="primary"
            fullWidth
            icon={<IconRun size={18} strokeWidth={2.2} />}
            onClick={() => {
              setTried(true);
              if (!error) onCreate(inputs, createGoal);
            }}
          >
            Create plan
          </Button>
        </div>
      </div>
    </BottomSheet>
  );
}
