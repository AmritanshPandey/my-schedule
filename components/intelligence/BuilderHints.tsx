"use client";

import { IconAlertTriangle, IconBulb } from "@tabler/icons-react";
import { SOFT_PANEL } from "@/components/ui/surfaces";
import { haptic } from "@/lib/haptics";
import type { BuilderHint } from "@/lib/intelligence/builderChecks";

interface BuilderHintsProps {
  hints: BuilderHint[];
  /** Called with the hint whose one-tap fix was pressed. */
  onAction?: (hint: BuilderHint) => void;
  className?: string;
}

/**
 * Advisory notes under a goal / milestone / task form — see
 * lib/intelligence/builderChecks.ts. Never blocks saving, renders nothing
 * when there is nothing worth saying.
 */
export default function BuilderHints({ hints, onAction, className = "" }: BuilderHintsProps) {
  if (hints.length === 0) return null;

  return (
    <div className={`${SOFT_PANEL} divide-y divide-neutral-200/70 px-3.5 dark:divide-white/[0.06] ${className}`} role="status" aria-live="polite">
      {hints.map((hint) => {
        const warn = hint.tone === "warn";
        const Icon = warn ? IconAlertTriangle : IconBulb;
        return (
          <div key={hint.id} className="flex items-start gap-2.5 py-2.5">
            <Icon
              size={15}
              strokeWidth={2}
              aria-hidden
              // amber-700 rather than 500: AA at 12-13px on the light panel.
              className={`mt-0.5 shrink-0 ${warn ? "text-amber-700 dark:text-amber-400" : "text-neutral-500 dark:text-neutral-400"}`}
            />
            <div className="min-w-0 flex-1">
              <p className="text-[13px] font-medium leading-snug text-neutral-700 dark:text-neutral-200">{hint.message}</p>
              {hint.action && onAction && (
                <button
                  type="button"
                  onClick={() => { haptic("light"); onAction(hint); }}
                  className="mt-1.5 inline-flex min-h-[44px] items-center rounded-full border border-neutral-200 bg-white px-3.5 text-[13px] font-semibold text-neutral-900 transition-colors hover:bg-neutral-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/60 lg:min-h-0 lg:h-8 dark:border-white/10 dark:bg-neutral-900 dark:text-white dark:hover:bg-white/[0.06]"
                >
                  {hint.action.label}
                </button>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
