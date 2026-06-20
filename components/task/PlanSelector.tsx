"use client";

import { useEffect, useRef, useState } from "react";
import { AnimatePresence, m } from "framer-motion";
import { IconCheck, IconChevronDown } from "@tabler/icons-react";
import type { Plan } from "@/lib/useScheduleDB";
import { accentStyles } from "@/lib/colorSystem";
import { SECTION_ICONS } from "@/components/SectionIcons";

const SECTION_LABEL =
  "text-[11px] font-semibold uppercase tracking-[0.08em] text-neutral-400 dark:text-neutral-500";

export interface PlanSelectorProps {
  plans: Plan[];
  selectedId: string;
  onSelect: (plan: Plan) => void;
}

export function PlanSelector({ plans, selectedId, onSelect }: PlanSelectorProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const selected = plans.find((p) => p.id === selectedId) ?? null;
  const accent = selected ? accentStyles(selected.color) : null;
  const icon = selected
    ? (SECTION_ICONS.find((i) => i.name === selected.emoji) ?? SECTION_ICONS[0]).icon
    : null;
  const Icon = icon;

  useEffect(() => {
    function handler(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  if (plans.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-neutral-200 p-5 text-center dark:border-white/10">
        <p className="text-[14px] font-semibold text-neutral-700 dark:text-neutral-300">Create a plan first</p>
        <p className="mt-1 text-[12px] text-neutral-400 dark:text-neutral-500">
          Tasks need a parent plan.
        </p>
      </div>
    );
  }

  return (
    <div ref={ref} className="relative">
      <p className={`mb-1.5 ${SECTION_LABEL}`}>Plan</p>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex h-11 w-full items-center gap-3 rounded-xl border border-neutral-200 bg-neutral-50 px-3 text-left transition-colors dark:border-white/10 dark:bg-white/[0.04]"
      >
        {selected && Icon && accent ? (
          <>
            <div className={`h-6 w-6 shrink-0 rounded-lg flex items-center justify-center ${accent.tint} ${accent.icon}`}>
              <Icon size={13} strokeWidth={2} />
            </div>
            <span className="flex-1 text-[14px] font-semibold text-neutral-900 dark:text-white truncate">
              {selected.title}
            </span>
          </>
        ) : (
          <span className="flex-1 text-[14px] font-medium text-neutral-400 dark:text-neutral-500">
            Select a plan…
          </span>
        )}
        <IconChevronDown
          size={16}
          strokeWidth={2}
          className={`shrink-0 text-neutral-400 transition-transform duration-150 ${open ? "rotate-180" : ""}`}
        />
      </button>

      <AnimatePresence>
        {open && (
          <m.div
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.15 }}
            className="absolute left-0 right-0 top-[calc(100%+4px)] z-10 overflow-hidden rounded-2xl border border-neutral-200 bg-white dark:border-white/10 dark:bg-neutral-900"
          >
            <div className="max-h-[220px] overflow-y-auto">
              {plans.map((plan, i) => {
                const ic = SECTION_ICONS.find((s) => s.name === plan.emoji) ?? SECTION_ICONS[0];
                const PlanIcon = ic.icon;
                const pa = accentStyles(plan.color);
                const sel = selectedId === plan.id;
                return (
                  <button
                    key={plan.id}
                    type="button"
                    onClick={() => { onSelect(plan); setOpen(false); }}
                    className={`flex w-full items-center gap-3 px-3 py-2.5 text-left transition-colors ${
                      i > 0 ? "border-t border-neutral-100 dark:border-white/[0.05]" : ""
                    } ${sel ? "bg-neutral-50 dark:bg-white/[0.04]" : "hover:bg-neutral-50 dark:hover:bg-white/[0.04]"}`}
                  >
                    <div className={`h-7 w-7 shrink-0 rounded-lg flex items-center justify-center ${pa.tint} ${pa.icon}`}>
                      <PlanIcon size={14} strokeWidth={2} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-[14px] font-semibold text-neutral-900 dark:text-white truncate">
                        {plan.title}
                      </p>
                      {plan.description && (
                        <p className="text-[11px] text-neutral-400 dark:text-neutral-500 truncate">
                          {plan.description}
                        </p>
                      )}
                    </div>
                    {sel && (
                      <div className={`h-4 w-4 shrink-0 rounded-full flex items-center justify-center ${pa.tint} ${pa.icon}`}>
                        <IconCheck size={10} strokeWidth={3} />
                      </div>
                    )}
                  </button>
                );
              })}
            </div>
          </m.div>
        )}
      </AnimatePresence>
    </div>
  );
}
