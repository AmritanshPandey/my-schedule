"use client";

import { useMemo, useState } from "react";
import { IconSearch, IconX, IconPlus, IconCheck } from "@tabler/icons-react";
import BottomSheet from "@/components/ui/BottomSheet";
import IconButton from "@/components/ui/IconButton";
import { SECTION_ICONS } from "@/components/SectionIcons";
import type { Task, Plan } from "@/lib/useScheduleDB";

/**
 * Searchable picker to attach tasks to a note. Stays open so several can be
 * added in a row; already-linked tasks show a check. `tasks` is expected to be
 * de-duplicated by id (recurring tasks share an id across weekdays).
 */
export default function TaskLinkPicker({
  open,
  tasks,
  plans,
  linkedIds,
  onAdd,
  onClose,
}: {
  open: boolean;
  tasks: Task[];
  plans: Plan[];
  linkedIds: string[];
  onAdd: (taskId: string) => void;
  onClose: () => void;
}) {
  const [query, setQuery] = useState("");
  // plan.emoji holds a Tabler icon NAME — resolve it to a component.
  const planIcon = useMemo(() => {
    const byName = new Map(SECTION_ICONS.map((s) => [s.name, s.icon]));
    return new Map(plans.map((p) => [p.id, byName.get(p.emoji) ?? SECTION_ICONS[0].icon]));
  }, [plans]);
  const linked = new Set(linkedIds);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = q ? tasks.filter((t) => t.title.toLowerCase().includes(q)) : tasks;
    return [...list].sort((a, b) => a.title.localeCompare(b.title));
  }, [tasks, query]);

  return (
    <BottomSheet open={open} onClose={onClose}>
      <div className="flex flex-col gap-4 px-5 pb-8 pt-5">
        <div className="flex items-center justify-between">
          <h2 className="text-[18px] font-bold text-neutral-900 dark:text-white">Link a task</h2>
          <IconButton label="Close" variant="soft" size="md" radius="full" onClick={onClose}>
            <IconX size={18} strokeWidth={2.2} />
          </IconButton>
        </div>

        <div className="relative">
          <IconSearch size={15} strokeWidth={2} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-neutral-400" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search tasks"
            className="h-11 w-full rounded-xl border border-neutral-200 bg-neutral-50 pl-9 pr-3 text-[16px] text-neutral-900 outline-none transition-colors focus:border-neutral-300 focus:bg-neutral-100 dark:border-white/10 dark:bg-white/[0.04] dark:text-white dark:focus:border-white/20 dark:focus:bg-white/[0.07]"
          />
        </div>

        <div className="-mx-1 flex max-h-[50vh] flex-col gap-1 overflow-y-auto px-1">
          {filtered.length === 0 ? (
            <p className="py-6 text-center text-[13px] text-neutral-400 dark:text-neutral-500">
              {tasks.length === 0 ? "No tasks yet." : "No tasks match."}
            </p>
          ) : (
            filtered.map((task) => {
              const isLinked = linked.has(task.id);
              const Icon = planIcon.get(task.planId) ?? SECTION_ICONS[0].icon;
              return (
                <button
                  key={task.id}
                  type="button"
                  disabled={isLinked}
                  onClick={() => onAdd(task.id)}
                  className={`flex min-h-[44px] items-center gap-3 rounded-xl px-3 py-2 text-left transition-colors ${
                    isLinked
                      ? "cursor-default opacity-60"
                      : "hover:bg-neutral-100 dark:hover:bg-white/[0.05]"
                  }`}
                >
                  <Icon size={17} strokeWidth={2} className="shrink-0 text-neutral-400 dark:text-neutral-500" />
                  <span className="min-w-0 flex-1 truncate text-[14px] font-semibold text-neutral-800 dark:text-neutral-200">
                    {task.title}
                  </span>
                  {isLinked ? (
                    <IconCheck size={16} strokeWidth={2.4} className="shrink-0 text-emerald-500" />
                  ) : (
                    <IconPlus size={16} strokeWidth={2.4} className="shrink-0 text-neutral-400" />
                  )}
                </button>
              );
            })
          )}
        </div>
      </div>
    </BottomSheet>
  );
}
