"use client";

import { IconPlus } from "@tabler/icons-react";

/**
 * The dashed "add another one of these" row that ends a repeatable list.
 *
 * The New/Edit Task sheet drew this twice with one class string copied between
 * them, and the copies had drifted apart in the one way you notice: "Add time
 * slot" was centred, "Add subtask" was left-aligned, three sections below it.
 * Both also sat at 40px (under the 44px tap floor) and, in dark mode, at
 * neutral-500 on #171717 — 3.78:1, under AA for a control label. It now takes
 * the ghost Button's colours (DESIGN.md §5 Buttons).
 */
export default function AddRowButton({
  label,
  onClick,
  align = "center",
  className = "",
}: {
  label: string;
  onClick: () => void;
  align?: "center" | "start";
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex h-11 w-full items-center gap-2 rounded-full border border-dashed border-neutral-200 px-3 text-[13px] font-semibold text-neutral-600 outline-none transition-colors hover:border-neutral-300 hover:bg-black/[0.03] hover:text-neutral-900 focus-visible:ring-2 focus-visible:ring-[#008236] dark:border-white/10 dark:text-neutral-300 dark:hover:border-white/20 dark:hover:bg-white/[0.04] dark:hover:text-white dark:focus-visible:ring-[#2FD46E] ${
        align === "center" ? "justify-center" : ""
      } ${className}`}
    >
      <IconPlus size={14} strokeWidth={2.5} />
      {label}
    </button>
  );
}
