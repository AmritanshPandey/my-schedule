"use client";

import { memo } from "react";
import { motion } from "framer-motion";
import {
  IconBarbell, IconBook, IconBriefcase, IconBrain, IconCode,
  IconRun, IconStar, IconBed, IconCar, IconCheck, IconFlag,
  IconLayoutList, IconX,
} from "@tabler/icons-react";
import BottomSheet from "@/components/ui/BottomSheet";
import { TEMPLATES, type Template } from "@/lib/templates";
import { accentStyles } from "@/lib/colorSystem";

// ── Icon map (mirrors SectionIcons) ──────────────────────────────────────────

const ICON_MAP: Record<string, React.ComponentType<{ size?: number; strokeWidth?: number; className?: string }>> = {
  barbell:   IconBarbell,
  book:      IconBook,
  briefcase: IconBriefcase,
  brain:     IconBrain,
  code:      IconCode,
  run:       IconRun,
  star:      IconStar,
  sleep:     IconBed,
  car:       IconCar,
};

// ── Duration label ─────────────────────────────────────────────────────────────

function durationLabel(days: number): string {
  if (days % 30 === 0) return `${days / 30} month${days / 30 > 1 ? "s" : ""}`;
  if (days % 7 === 0)  return `${days / 7} week${days / 7 > 1 ? "s" : ""}`;
  return `${days} days`;
}

// ── Template card ─────────────────────────────────────────────────────────────

interface TemplateCardProps {
  template: Template;
  onUse: (t: Template) => void;
}

function TemplateCard({ template, onUse }: TemplateCardProps) {
  const Icon   = ICON_MAP[template.emoji] ?? IconStar;
  const accent = accentStyles(template.color);
  const totalTasks = template.tasks.reduce((sum, t) => sum + t.days.length, 0);

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
      className="rounded-2xl border border-neutral-200/80 bg-white dark:border-white/[0.08] dark:bg-neutral-900"
    >
      {/* Header */}
      <div className="flex items-start gap-3 p-4 pb-3">
        <div className={`h-11 w-11 shrink-0 rounded-2xl flex items-center justify-center ${accent.tint} ${accent.icon}`}>
          <Icon size={20} strokeWidth={1.75} />
        </div>

        <div className="flex-1 min-w-0">
          <p className="text-[16px] font-bold leading-snug text-neutral-900 dark:text-white">
            {template.title}
          </p>
          <p className="mt-0.5 text-[12px] leading-relaxed text-neutral-500 dark:text-neutral-400">
            {template.description}
          </p>
        </div>
      </div>

      {/* Stats row */}
      <div className="flex items-center gap-2 px-4 pb-3 flex-wrap">
        <Pill label={durationLabel(template.durationDays)} />
        <Pill label={`${template.tasks.length} task${template.tasks.length > 1 ? "s" : ""}`} Icon={IconLayoutList} />
        <Pill label={`${template.milestones.length} milestones`} Icon={IconFlag} />
        {template.subtasks.length > 0 && (
          <Pill label={`${template.subtasks.length} subtasks`} Icon={IconCheck} />
        )}
      </div>

      {/* Milestone preview */}
      <div className="px-4 pb-3">
        <div className="space-y-1">
          {template.milestones.map((m, i) => (
            <div key={i} className="flex items-center gap-2">
              <div className={`h-1.5 w-1.5 shrink-0 rounded-full ${accent.dot}`} />
              <p className="text-[12px] text-neutral-500 dark:text-neutral-400 truncate">{m.title}</p>
              <p className="ml-auto shrink-0 text-[11px] font-semibold text-neutral-400 dark:text-neutral-500">
                Day {m.offsetDays}
              </p>
            </div>
          ))}
        </div>
      </div>

      {/* CTA */}
      <div className="px-4 pb-4">
        <motion.button
          type="button"
          whileTap={{ scale: 0.97 }}
          onClick={() => onUse(template)}
          className={`w-full rounded-xl py-2.5 text-[14px] font-bold transition-opacity active:opacity-80 ${accent.tint} ${accent.icon}`}
        >
          Use this template
        </motion.button>
      </div>
    </motion.div>
  );
}

function Pill({ label, Icon }: { label: string; Icon?: React.ComponentType<{ size?: number; className?: string }> }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-full border border-neutral-200 px-2 py-0.5 text-[11px] font-semibold text-neutral-500 dark:border-white/[0.08] dark:text-neutral-400">
      {Icon && <Icon size={10} className="shrink-0" />}
      {label}
    </span>
  );
}

// ── Sheet ─────────────────────────────────────────────────────────────────────

interface TemplatesSheetProps {
  open: boolean;
  onClose: () => void;
  onApply: (template: Template) => void;
}

function TemplatesSheetInner({ open, onClose, onApply }: TemplatesSheetProps) {
  function handleUse(template: Template) {
    onApply(template);
    onClose();
  }

  return (
    <BottomSheet open={open} onClose={onClose} maxHeight="92vh">
      <div className="px-5 pb-8 pt-2">
        {/* Header */}
        <div className="flex items-start justify-between mb-5">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-neutral-400 dark:text-neutral-500">
              Get started
            </p>
            <h2 className="text-[22px] font-extrabold tracking-tight text-neutral-900 dark:text-white">
              Example Templates
            </h2>
            <p className="mt-0.5 text-[13px] text-neutral-500 dark:text-neutral-400">
              Pick a template to create a plan with tasks and milestones already set up.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-neutral-100 text-neutral-500 hover:bg-neutral-200 dark:bg-white/[0.07] dark:text-neutral-400 dark:hover:bg-white/[0.12] ml-3 mt-0.5"
          >
            <IconX size={15} strokeWidth={2.5} />
          </button>
        </div>

        {/* Cards */}
        <div className="space-y-3">
          {TEMPLATES.map((t) => (
            <TemplateCard key={t.id} template={t} onUse={handleUse} />
          ))}
        </div>
      </div>
    </BottomSheet>
  );
}

export const TemplatesSheet = memo(TemplatesSheetInner);
