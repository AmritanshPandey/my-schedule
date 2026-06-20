"use client";

import { useEffect, useState, memo } from "react";
import { m, AnimatePresence } from "framer-motion";
import { IconCheck, IconCloudUpload, IconWifiOff } from "@tabler/icons-react";
import {
  getSyncStatus,
  getLastSyncedAt,
  onSyncStatusChange,
  type SyncStatus,
} from "@/lib/cloudSync";
import { useAuth } from "@/contexts/AuthProvider";

function relativeTime(ts: number): string {
  if (ts === 0) return "Synced";
  const secs = Math.floor((Date.now() - ts) / 1000);
  if (secs < 10) return "Synced just now";
  if (secs < 60) return `Synced ${secs}s ago`;
  const mins = Math.floor(secs / 60);
  if (mins < 60) return `Synced ${mins}m ago`;
  return "Synced";
}

function badge(status: SyncStatus, lastSyncedAt: number) {
  switch (status) {
    case "syncing":
      return {
        icon: <IconCloudUpload size={11} strokeWidth={2} className="animate-pulse" />,
        label: "Syncing…",
        className: "text-neutral-400 dark:text-neutral-500",
      };
    case "offline":
      return {
        icon: <IconWifiOff size={11} strokeWidth={2} />,
        label: "Offline",
        className: "text-amber-500 dark:text-amber-400",
      };
    case "error":
      return {
        icon: <span className="h-1.5 w-1.5 rounded-full bg-rose-500 shrink-0" />,
        label: "Sync failed",
        className: "text-rose-500 dark:text-rose-400",
      };
    default:
      return {
        icon: <IconCheck size={11} strokeWidth={2.5} />,
        label: relativeTime(lastSyncedAt),
        className: "text-emerald-500 dark:text-emerald-400",
      };
  }
}

export const SyncStatusBadge = memo(function SyncStatusBadge() {
  const { isGuest } = useAuth();
  const [status, setStatus] = useState<SyncStatus>(getSyncStatus());
  const [lastSyncedAt, setLastSyncedAt] = useState(getLastSyncedAt());
  const [, tick] = useState(0);

  useEffect(() => {
    return onSyncStatusChange((s) => {
      setStatus(s);
      if (s === "idle") setLastSyncedAt(getLastSyncedAt());
    });
  }, []);

  // Refresh relative label every 30 s while idle
  useEffect(() => {
    if (status !== "idle") return;
    const id = setInterval(() => tick((n) => n + 1), 30_000);
    return () => clearInterval(id);
  }, [status]);

  if (isGuest) return null;

  const { icon, label, className } = badge(status, lastSyncedAt);

  return (
    <AnimatePresence mode="wait">
      <m.span
        key={status + label}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.2 }}
        className={`inline-flex items-center gap-1 text-[10px] font-semibold ${className}`}
      >
        {icon}
        {label}
      </m.span>
    </AnimatePresence>
  );
});
