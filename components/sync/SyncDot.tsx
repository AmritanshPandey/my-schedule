import type { SyncTone } from "@/lib/syncStatus";

/**
 * Tiny presentational sync-status dot. Pulses while syncing (gated with
 * `motion-safe:` so it honors prefers-reduced-motion). `size="sm"` is for the
 * mobile avatar corner; `size="md"` matches the desktop sidebar's StatusDot.
 */
export default function SyncDot({ tone, size = "md" }: { tone: SyncTone; size?: "sm" | "md" }) {
  const box = size === "sm" ? "h-2.5 w-2.5" : "h-2 w-2";
  const fill: Record<SyncTone, string> = {
    ok: "bg-emerald-500",
    syncing: "bg-sky-500",
    warn: "bg-amber-400 dark:bg-amber-500",
    error: "bg-rose-500",
    neutral: "bg-neutral-300 dark:bg-neutral-600",
  };

  if (tone === "syncing") {
    return (
      <span className={`relative flex ${box} shrink-0`}>
        <span className={`absolute inline-flex h-full w-full rounded-full ${fill.syncing} opacity-60 motion-safe:animate-ping`} />
        <span className={`relative inline-flex ${box} rounded-full ${fill.syncing}`} />
      </span>
    );
  }
  if (tone === "ok") {
    return (
      <span className={`relative flex ${box} shrink-0`}>
        <span className={`absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-50 motion-safe:animate-ping`} style={{ animationDuration: "2.5s" }} />
        <span className={`relative inline-flex ${box} rounded-full ${fill.ok}`} />
      </span>
    );
  }
  return <span className={`${box} shrink-0 rounded-full ${fill[tone]}`} />;
}
