"use client";

import { useState } from "react";
import type { Plan, MetricEntry, Task } from "@/lib/useScheduleDB";
import { SECTION_ICONS } from "@/components/SectionIcons";
import { accentStyles } from "@/lib/colorSystem";
import { IconCheck, IconPlus, IconTrendingUp, IconX } from "@tabler/icons-react";
import ProgressChart from "@/components/ProgressChart";
import AddEntryModal from "@/components/AddEntryModal";
import EntryList from "@/components/EntryList";

interface ProgressProps {
  plans: Plan[];
  entries: MetricEntry[];
  activities?: Task[];
  onAddEntry: (entry: Omit<MetricEntry, "id">) => void;
  onDeleteEntry: (id: string) => void;
  onSetMetric: (planId: string, metric: { name: string; unit: string } | undefined) => void;
}

function parseTimeToMinutes(value: string): number | null {
  const twelveHour = value.trim().match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i);
  if (twelveHour) {
    let hours = Number(twelveHour[1]);
    const minutes = Number(twelveHour[2]);
    const meridiem = twelveHour[3].toUpperCase();
    if (meridiem === "PM" && hours !== 12) hours += 12;
    if (meridiem === "AM" && hours === 12) hours = 0;
    return hours * 60 + minutes;
  }

  const twentyFourHour = value.trim().match(/^(\d{1,2}):(\d{2})$/);
  if (!twentyFourHour) return null;
  return Number(twentyFourHour[1]) * 60 + Number(twentyFourHour[2]);
}

function getActivityMinutes(activity: Task): number {
  const start = parseTimeToMinutes(activity.startTime);
  const end = parseTimeToMinutes(activity.endTime);
  if (start === null || end === null || end <= start) return 0;
  return end - start;
}

function EmptyCard({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-neutral-200 py-14 text-center dark:border-white/10">
      <div className="mb-3 flex h-11 w-11 items-center justify-center rounded-xl bg-neutral-100 dark:bg-white/[0.07]">
        <IconTrendingUp size={20} className="text-neutral-400 dark:text-neutral-500" />
      </div>
      <p className="text-sm font-semibold text-neutral-700 dark:text-neutral-300">{title}</p>
      <p className="mt-1 max-w-[200px] text-xs text-neutral-400 dark:text-neutral-500">{subtitle}</p>
    </div>
  );
}

function SetMetricForm({
  plan,
  onSave,
}: {
  plan: Plan;
  onSave: (metric: { name: string; unit: string }) => void;
}) {
  const [name, setName] = useState("");
  const [unit, setUnit] = useState("");
  const ac = accentStyles(plan.color);

  function handleSubmit() {
    const n = name.trim();
    if (!n) return;
    onSave({ name: n, unit: unit.trim() });
  }

  const SUGGESTIONS = [
    { name: "Weight", unit: "kg" },
    { name: "Hours Studied", unit: "hrs" },
    { name: "Tasks Completed", unit: "" },
    { name: "Calories", unit: "kcal" },
    { name: "Steps", unit: "" },
    { name: "Reps", unit: "" },
  ];

  return (
    <div className="overflow-hidden rounded-xl border border-neutral-200/80 bg-white dark:border-white/[0.08] dark:bg-neutral-900">
      <div className={`border-b border-neutral-100 px-4 py-3 dark:border-white/[0.07] ${ac.tint}`}>
        <p className="text-sm font-semibold text-neutral-900 dark:text-white">Set a metric to track</p>
        <p className="mt-0.5 text-xs text-neutral-500 dark:text-neutral-400">
          Choose what you want to measure for <span className="font-medium">{plan.title}</span>
        </p>
      </div>
      <div className="space-y-4 p-4">
        {/* Quick suggestions */}
        <div className="flex flex-wrap gap-1.5">
          {SUGGESTIONS.map((s) => (
            <button
              key={s.name}
              type="button"
              onClick={() => { setName(s.name); setUnit(s.unit); }}
              className={`rounded-lg px-2.5 py-1.5 text-xs font-medium transition-all ${
                name === s.name
                  ? `${ac.iconSolid} shadow-sm`
                  : `${ac.tint} ${ac.text} hover:opacity-90`
              }`}
            >
              {s.name}
              {s.unit ? ` (${s.unit})` : ""}
            </button>
          ))}
        </div>

        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="mb-1.5 block text-xs font-medium text-neutral-500 dark:text-neutral-400">
              Metric name
            </label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Weight"
              onKeyDown={(e) => { if (e.key === "Enter") handleSubmit(); }}
              className="h-9 w-full rounded-lg border border-neutral-200 bg-neutral-50 px-3 text-sm text-neutral-900 outline-none transition-colors placeholder:text-neutral-400 focus:border-neutral-300 focus:bg-white dark:border-white/10 dark:bg-white/[0.04] dark:text-white dark:placeholder:text-neutral-500 dark:focus:border-white/20 dark:focus:bg-white/[0.08]"
            />
          </div>
          <div>
            <label className="mb-1.5 block text-xs font-medium text-neutral-500 dark:text-neutral-400">
              Unit <span className="font-normal opacity-60">(optional)</span>
            </label>
            <input
              value={unit}
              onChange={(e) => setUnit(e.target.value)}
              placeholder="e.g. kg"
              onKeyDown={(e) => { if (e.key === "Enter") handleSubmit(); }}
              className="h-9 w-full rounded-lg border border-neutral-200 bg-neutral-50 px-3 text-sm text-neutral-900 outline-none transition-colors placeholder:text-neutral-400 focus:border-neutral-300 focus:bg-white dark:border-white/10 dark:bg-white/[0.04] dark:text-white dark:placeholder:text-neutral-500 dark:focus:border-white/20 dark:focus:bg-white/[0.08]"
            />
          </div>
        </div>

        <button
          type="button"
          onClick={handleSubmit}
          disabled={!name.trim()}
          className={`inline-flex h-9 w-full items-center justify-center gap-1.5 rounded-lg text-sm font-medium transition-all hover:opacity-90 disabled:opacity-40 ${ac.iconSolid}`}
        >
          <IconCheck size={14} />
          Set Metric
        </button>
      </div>
    </div>
  );
}

export default function Progress({ plans, entries, activities = [], onAddEntry, onDeleteEntry, onSetMetric }: ProgressProps) {
  const [selectedPlanId, setSelectedPlanId] = useState<string>(() => plans[0]?.id ?? "");
  const [addEntryOpen, setAddEntryOpen] = useState(false);

  const selectedPlan = plans.find((p) => p.id === selectedPlanId) ?? plans[0] ?? null;
  const planActivities = selectedPlan ? activities.filter((activity) => activity.planId === selectedPlan.id) : [];
  const totalActivityMinutes = planActivities.reduce((sum, activity) => sum + getActivityMinutes(activity), 0);
  const totalActivityHours = Math.round((totalActivityMinutes / 60) * 10) / 10;
  const planEntries = entries
    .filter((e) => e.planId === selectedPlan?.id)
    .sort((a, b) => a.date.localeCompare(b.date));

  if (plans.length === 0) {
    return (
      <div className="pt-1 pb-10">
        <EmptyCard
          title="No plans yet"
          subtitle="Create a plan first, then come here to track your progress"
        />
      </div>
    );
  }

  return (
    <div className="space-y-4 pt-1 pb-10">
      {/* Plan selector */}
      <div className="flex gap-2 overflow-x-auto pb-0.5" style={{ scrollbarWidth: "none" }}>
        {plans.map((plan) => {
          const ic = SECTION_ICONS.find((i) => i.name === plan.emoji) ?? SECTION_ICONS[0];
          const PlanIcon = ic.icon;
          const ac = accentStyles(plan.color);
          const sel = plan.id === selectedPlanId;
          return (
            <button
              key={plan.id}
              type="button"
              onClick={() => setSelectedPlanId(plan.id)}
              className={`inline-flex shrink-0 items-center gap-1.5 rounded-xl px-3 py-2 text-xs font-semibold transition-all ${
                sel ? `${ac.iconSolid} shadow-sm` : `${ac.tint} ${ac.text} hover:opacity-90`
              }`}
            >
              <PlanIcon size={13} strokeWidth={2} />
              {plan.title}
            </button>
          );
        })}
      </div>

      {selectedPlan && (
        <>
          <div className="grid grid-cols-3 gap-2">
            <div className="rounded-xl border border-neutral-200 bg-neutral-50 p-3 dark:border-white/10 dark:bg-white/[0.04]">
              <p className="text-[10px] font-semibold uppercase tracking-widest text-neutral-400 dark:text-neutral-500">Activities</p>
              <p className="mt-1 text-lg font-semibold text-neutral-900 dark:text-white">{planActivities.length}</p>
            </div>
            <div className="rounded-xl border border-neutral-200 bg-neutral-50 p-3 dark:border-white/10 dark:bg-white/[0.04]">
              <p className="text-[10px] font-semibold uppercase tracking-widest text-neutral-400 dark:text-neutral-500">Hours</p>
              <p className="mt-1 text-lg font-semibold text-neutral-900 dark:text-white">{totalActivityHours}</p>
            </div>
            <div className="rounded-xl border border-neutral-200 bg-neutral-50 p-3 dark:border-white/10 dark:bg-white/[0.04]">
              <p className="text-[10px] font-semibold uppercase tracking-widest text-neutral-400 dark:text-neutral-500">Entries</p>
              <p className="mt-1 text-lg font-semibold text-neutral-900 dark:text-white">{planEntries.length}</p>
            </div>
          </div>

          {selectedPlan.metric ? (
            <>
              {/* Metric header */}
              <div className="flex items-center justify-between gap-3 px-0.5">
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-widest text-neutral-400 dark:text-neutral-500">
                    {selectedPlan.title}
                  </p>
                  <h3 className="mt-0.5 text-base font-semibold text-neutral-900 dark:text-white">
                    {selectedPlan.metric.name}
                    {selectedPlan.metric.unit && (
                      <span className="ml-1.5 text-sm font-normal text-neutral-400 dark:text-neutral-500">
                        ({selectedPlan.metric.unit})
                      </span>
                    )}
                  </h3>
                </div>
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => setAddEntryOpen(true)}
                    className={`inline-flex items-center gap-1.5 rounded-xl px-3 py-2 text-xs font-semibold shadow-sm transition-all hover:opacity-90 ${accentStyles(selectedPlan.color).iconSolid}`}
                  >
                    <IconPlus size={12} strokeWidth={2.5} />
                    Add Entry
                  </button>
                  <button
                    type="button"
                    onClick={() => onSetMetric(selectedPlan.id, undefined)}
                    title="Remove metric"
                    className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-neutral-200 text-neutral-400 hover:bg-neutral-100 dark:border-white/10 dark:hover:bg-white/[0.07] transition-colors"
                  >
                    <IconX size={13} />
                  </button>
                </div>
              </div>

              {planEntries.length === 0 ? (
                <EmptyCard
                  title="No data yet"
                  subtitle="Start logging your progress to see trends"
                />
              ) : (
                <>
                  <ProgressChart
                    entries={planEntries}
                    color={selectedPlan.color}
                    metric={selectedPlan.metric}
                  />
                  <EntryList
                    entries={planEntries}
                    metric={selectedPlan.metric}
                    onDelete={onDeleteEntry}
                  />
                </>
              )}
            </>
          ) : (
            <SetMetricForm
              plan={selectedPlan}
              onSave={(metric) => onSetMetric(selectedPlan.id, metric)}
            />
          )}
        </>
      )}

      <AddEntryModal
        isOpen={addEntryOpen}
        onClose={() => setAddEntryOpen(false)}
        onSave={(value, date) => {
          if (!selectedPlan) return;
          onAddEntry({ planId: selectedPlan.id, trackerId: `${selectedPlan.id}-tracker-main`, value, date });
        }}
        metric={selectedPlan?.metric}
      />
    </div>
  );
}
