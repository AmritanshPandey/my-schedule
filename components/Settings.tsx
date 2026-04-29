"use client";

import { useState } from "react";
import ThemeToggle from "@/components/ThemeToggle";
import { IconAlertTriangle, IconCheck, IconDatabase, IconMoon, IconTrash } from "@tabler/icons-react";

interface SettingsProps {
  onClearData: () => void;
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="overflow-hidden rounded-xl border border-neutral-200/80 bg-white dark:border-white/[0.08] dark:bg-neutral-900">
      <div className="border-b border-neutral-100 px-4 py-2.5 dark:border-white/[0.07]">
        <span className="text-[11px] font-semibold uppercase tracking-wider text-neutral-400 dark:text-neutral-500">
          {title}
        </span>
      </div>
      {children}
    </div>
  );
}

function Row({ icon, label, children }: { icon: React.ReactNode; label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4 px-4 py-3.5">
      <div className="flex items-center gap-3">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-neutral-100 text-neutral-500 dark:bg-white/[0.07] dark:text-neutral-400">
          {icon}
        </div>
        <span className="text-sm font-medium text-neutral-800 dark:text-neutral-200">{label}</span>
      </div>
      {children}
    </div>
  );
}

export default function Settings({ onClearData }: SettingsProps) {
  const [confirmClear, setConfirmClear] = useState(false);
  const [cleared, setCleared] = useState(false);

  function handleClearData() {
    onClearData();
    setConfirmClear(false);
    setCleared(true);
    setTimeout(() => setCleared(false), 2000);
  }

  return (
    <div className="space-y-4 pt-1 pb-10">
      <Section title="Appearance">
        <Row icon={<IconMoon size={15} />} label="Theme">
          <ThemeToggle />
        </Row>
      </Section>

      <Section title="Data">
        <Row icon={<IconDatabase size={15} />} label="Clear all data">
          {cleared ? (
            <div className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-50 px-3 py-2 text-xs font-semibold text-emerald-600 dark:bg-emerald-400/10 dark:text-emerald-400">
              <IconCheck size={13} />
              Cleared
            </div>
          ) : confirmClear ? (
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={handleClearData}
                className="inline-flex items-center gap-1.5 rounded-lg bg-red-500 px-3 py-2 text-xs font-semibold text-white transition-colors hover:bg-red-600"
              >
                <IconTrash size={12} />
                Confirm
              </button>
              <button
                type="button"
                onClick={() => setConfirmClear(false)}
                className="rounded-lg border border-neutral-200 px-3 py-2 text-xs font-medium text-neutral-500 hover:bg-neutral-50 dark:border-white/10 dark:text-neutral-400 dark:hover:bg-white/5"
              >
                Cancel
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setConfirmClear(true)}
              className="inline-flex items-center gap-1.5 rounded-lg border border-neutral-200 px-3 py-2 text-xs font-medium text-neutral-500 transition-colors hover:border-red-200 hover:text-red-500 dark:border-white/10 dark:text-neutral-400 dark:hover:border-red-400/30 dark:hover:text-red-400"
            >
              <IconTrash size={12} />
              Clear
            </button>
          )}
        </Row>
        {confirmClear && (
          <div className="mx-4 mb-3.5 flex items-start gap-2 rounded-lg bg-amber-50 px-3 py-2.5 dark:bg-amber-400/10">
            <IconAlertTriangle size={14} className="mt-0.5 shrink-0 text-amber-500 dark:text-amber-400" />
            <p className="text-xs text-amber-700 dark:text-amber-300">
              This will permanently delete all plans, tasks, and progress entries. This cannot be undone.
            </p>
          </div>
        )}
      </Section>

      <Section title="About">
        <div className="px-4 py-3.5 space-y-1">
          <p className="text-sm font-semibold text-neutral-800 dark:text-neutral-200">My Schedule</p>
          <p className="text-xs text-neutral-400 dark:text-neutral-500">
            A personal planner for your week — built to keep you on track.
          </p>
        </div>
      </Section>
    </div>
  );
}
