"use client";

import { IconArrowLeft } from "@tabler/icons-react";
import ThemeToggle from "@/components/ThemeToggle";

interface ActionItem {
  icon: React.ComponentType<{ size?: number; strokeWidth?: number; className?: string }>;
  onClick: () => void;
  destructive?: boolean;
  label?: string;
}

interface AppHeaderProps {
  back?: {
    label: string;
    onBack: () => void;
  };
  actions?: ActionItem[];
}

export default function AppHeader({ back, actions }: AppHeaderProps) {
  const isDetail = !!back;

  return (
    <header className="sticky top-0 z-10 flex items-center justify-between px-4 py-4 border-b border-neutral-200 bg-white/85 backdrop-blur-sm dark:border-white/[0.08] dark:bg-neutral-950/85">
      {isDetail ? (
        /* Detail mode — back arrow + label */
        <button
          type="button"
          onClick={back.onBack}
          className="inline-flex items-center gap-1.5 text-[13px] font-semibold text-neutral-500 hover:text-neutral-900 dark:text-neutral-400 dark:hover:text-white transition-colors"
        >
          <IconArrowLeft size={18} strokeWidth={2} />
          {back.label}
        </button>
      ) : (
        /* Root mode — logo */
        <div className="flex items-center">
          <img src="/logo.svg" alt="PlanR" className="h-6 w-auto dark:hidden" />
          <img src="/logo-dark.svg" alt="PlanR" className="hidden h-6 w-auto dark:block" />
        </div>
      )}

      {/* Right side */}
      {isDetail && actions && actions.length > 0 ? (
        <div className="flex items-center gap-0.5">
          {actions.map((action, i) => {
            const Icon = action.icon;
            return (
              <button
                key={i}
                type="button"
                onClick={action.onClick}
                aria-label={action.label}
                className={`inline-flex h-9 w-9 items-center justify-center rounded-xl transition-colors ${
                  action.destructive
                    ? "text-neutral-400 hover:bg-rose-50 hover:text-rose-500 dark:text-neutral-500 dark:hover:bg-rose-500/10 dark:hover:text-rose-400"
                    : "text-neutral-400 hover:bg-neutral-100 hover:text-neutral-700 dark:text-neutral-500 dark:hover:bg-white/[0.07] dark:hover:text-neutral-300"
                }`}
              >
                <Icon size={20} strokeWidth={2} />
              </button>
            );
          })}
        </div>
      ) : (
        !isDetail && <ThemeToggle />
      )}
    </header>
  );
}
