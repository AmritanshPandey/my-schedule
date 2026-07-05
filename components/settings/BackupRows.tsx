"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { AnimatePresence, m } from "framer-motion";
import { IconChevronDown, IconDownload, IconHistory, IconUpload } from "@tabler/icons-react";
import ConfirmSheet from "@/components/ui/ConfirmSheet";
import { useAuth } from "@/contexts/AuthProvider";
import { downloadBackup, parseBackup } from "@/lib/backup";
import { listCloudBackups, fetchCloudBackup, type CloudBackupMeta } from "@/lib/cloudSync";
import { haptic } from "@/lib/haptics";
import type { Schedule } from "@/lib/useScheduleDB";

function formatBackupDate(isoDate: string): string {
  const date = new Date(`${isoDate}T00:00:00`);
  if (Number.isNaN(date.getTime())) return isoDate;
  return new Intl.DateTimeFormat(undefined, { weekday: "short", month: "short", day: "numeric" }).format(date);
}

/**
 * "Export backup" / "Restore from backup" rows for the Data card in both
 * settings surfaces (full-page SettingsView and the desktop SettingsSheet).
 * Self-contained: file picking, validation, confirm sheet, and feedback.
 */
export default function BackupRows({
  schedule,
  onRestoreData,
}: {
  schedule: Schedule;
  onRestoreData?: (raw: unknown) => boolean;
}) {
  const { isGuest } = useAuth();
  const fileRef = useRef<HTMLInputElement>(null);
  const [pendingRaw, setPendingRaw] = useState<unknown>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [feedback, setFeedback] = useState<{ kind: "done" | "error"; message: string } | null>(null);
  const feedbackTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [history, setHistory] = useState<CloudBackupMeta[] | null>(null);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [cloudRestoreId, setCloudRestoreId] = useState<string | null>(null);
  const [cloudRestoring, setCloudRestoring] = useState(false);

  useEffect(() => () => {
    if (feedbackTimer.current) clearTimeout(feedbackTimer.current);
  }, []);

  const showFeedback = useCallback((kind: "done" | "error", message: string) => {
    setFeedback({ kind, message });
    if (feedbackTimer.current) clearTimeout(feedbackTimer.current);
    feedbackTimer.current = setTimeout(() => setFeedback(null), 5_000);
  }, []);

  const handleExport = useCallback(() => {
    haptic("light");
    try {
      downloadBackup(schedule);
      showFeedback("done", "Backup downloaded.");
    } catch {
      showFeedback("error", "Export failed — try again.");
    }
  }, [schedule, showFeedback]);

  const handleFile = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = ""; // allow picking the same file twice in a row
    if (!file) return;
    try {
      const raw = parseBackup(await file.text());
      setPendingRaw(raw);
      setConfirmOpen(true);
    } catch (err) {
      showFeedback("error", err instanceof Error ? err.message : "Couldn't read that file.");
    }
  }, [showFeedback]);

  const handleRestoreConfirm = useCallback(() => {
    setConfirmOpen(false);
    if (pendingRaw == null || !onRestoreData) return;
    const ok = onRestoreData(pendingRaw);
    setPendingRaw(null);
    if (ok) haptic("light");
    showFeedback(
      ok ? "done" : "error",
      ok ? "Backup restored." : "That backup couldn't be loaded — your data is unchanged.",
    );
  }, [pendingRaw, onRestoreData, showFeedback]);

  const toggleHistory = useCallback(async () => {
    haptic("light");
    const opening = !historyOpen;
    setHistoryOpen(opening);
    if (!opening || history !== null) return;
    setHistoryLoading(true);
    try {
      setHistory(await listCloudBackups());
    } catch {
      setHistory([]);
      showFeedback("error", "Couldn't load version history.");
    } finally {
      setHistoryLoading(false);
    }
  }, [historyOpen, history, showFeedback]);

  const handleCloudRestore = useCallback(async () => {
    const id = cloudRestoreId;
    setCloudRestoreId(null);
    if (!id || !onRestoreData) return;
    setCloudRestoring(true);
    try {
      const raw = await fetchCloudBackup(id);
      if (raw == null) {
        showFeedback("error", "That snapshot is no longer available.");
        return;
      }
      const ok = onRestoreData(raw);
      if (ok) haptic("light");
      showFeedback(
        ok ? "done" : "error",
        ok ? `Restored the snapshot from ${formatBackupDate(id)}.` : "That snapshot couldn't be loaded — your data is unchanged.",
      );
    } catch {
      showFeedback("error", "Couldn't fetch that snapshot — check your connection.");
    } finally {
      setCloudRestoring(false);
    }
  }, [cloudRestoreId, onRestoreData, showFeedback]);

  return (
    <>
      <div className="flex items-center gap-3 px-4 py-3.5">
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl border border-neutral-100 bg-neutral-50 text-neutral-500 dark:border-white/[0.06] dark:bg-white/[0.04] dark:text-neutral-300">
          <IconDownload size={14} strokeWidth={2} />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-[13px] font-semibold text-neutral-800 dark:text-white">Export backup</p>
          <p className="mt-0.5 text-[11px] leading-snug text-neutral-400 dark:text-neutral-500">
            Downloads everything as a JSON file · plans, history, notes
          </p>
        </div>
        <button
          type="button"
          onClick={handleExport}
          className="shrink-0 rounded-xl border border-neutral-200 bg-neutral-50 px-3 py-1.5 text-[11px] font-semibold text-neutral-700 hover:bg-neutral-100 dark:border-white/[0.08] dark:bg-white/[0.04] dark:text-neutral-200"
        >
          Export
        </button>
      </div>
      {onRestoreData && (
        <>
          <div className="mx-4 border-t border-neutral-100 dark:border-white/[0.05]" />
          <div className="flex items-center gap-3 px-4 py-3.5">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl border border-neutral-100 bg-neutral-50 text-neutral-500 dark:border-white/[0.06] dark:bg-white/[0.04] dark:text-neutral-300">
              <IconUpload size={14} strokeWidth={2} />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-[13px] font-semibold text-neutral-800 dark:text-white">Restore from backup</p>
              <p className="mt-0.5 text-[11px] leading-snug text-neutral-400 dark:text-neutral-500">
                Replaces current data with the file&apos;s contents
              </p>
            </div>
            <button
              type="button"
              onClick={() => { haptic("light"); fileRef.current?.click(); }}
              className="shrink-0 rounded-xl border border-neutral-200 bg-neutral-50 px-3 py-1.5 text-[11px] font-semibold text-neutral-700 hover:bg-neutral-100 dark:border-white/[0.08] dark:bg-white/[0.04] dark:text-neutral-200"
            >
              Restore
            </button>
            <input
              ref={fileRef}
              type="file"
              accept="application/json,.json"
              className="hidden"
              onChange={handleFile}
            />
          </div>
        </>
      )}
      {!isGuest && onRestoreData && (
        <>
          <div className="mx-4 border-t border-neutral-100 dark:border-white/[0.05]" />
          <button
            type="button"
            onClick={toggleHistory}
            aria-expanded={historyOpen}
            className="flex w-full items-center gap-3 px-4 py-3.5 text-left transition-colors hover:bg-neutral-50 dark:hover:bg-white/[0.03]"
          >
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl border border-neutral-100 bg-neutral-50 text-neutral-500 dark:border-white/[0.06] dark:bg-white/[0.04] dark:text-neutral-300">
              <IconHistory size={14} strokeWidth={2} />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-[13px] font-semibold text-neutral-800 dark:text-white">Version history</p>
              <p className="mt-0.5 text-[11px] leading-snug text-neutral-400 dark:text-neutral-500">
                Daily cloud snapshots · roll back if something goes wrong
              </p>
            </div>
            <IconChevronDown
              size={14}
              strokeWidth={2}
              className={`shrink-0 text-neutral-400 transition-transform ${historyOpen ? "rotate-180" : ""}`}
            />
          </button>
          <AnimatePresence initial={false}>
            {historyOpen && (
              <m.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: "auto" }}
                exit={{ opacity: 0, height: 0 }}
                className="overflow-hidden"
              >
                <div className="px-4 pb-3">
                  {historyLoading ? (
                    <div className="flex items-center gap-2 py-2">
                      <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-neutral-200 border-t-neutral-600 dark:border-neutral-700 dark:border-t-neutral-300" />
                      <span className="text-[11px] font-medium text-neutral-400 dark:text-neutral-500">Loading snapshots…</span>
                    </div>
                  ) : !history || history.length === 0 ? (
                    <p className="py-2 text-[11px] text-neutral-400 dark:text-neutral-500">
                      No snapshots yet — one is saved automatically with the first sync of each day.
                    </p>
                  ) : (
                    <ul className="divide-y divide-neutral-100 rounded-xl border border-neutral-100 dark:divide-white/[0.05] dark:border-white/[0.06]">
                      {history.map((b) => (
                        <li key={b.id} className="flex items-center gap-3 px-3 py-2">
                          <span className="flex-1 text-[12px] font-semibold text-neutral-700 dark:text-neutral-200">
                            {formatBackupDate(b.id)}
                          </span>
                          <button
                            type="button"
                            disabled={cloudRestoring}
                            onClick={() => { haptic("light"); setCloudRestoreId(b.id); }}
                            className="rounded-lg border border-neutral-200 bg-neutral-50 px-2.5 py-1 text-[11px] font-semibold text-neutral-600 hover:bg-neutral-100 disabled:opacity-50 dark:border-white/[0.08] dark:bg-white/[0.04] dark:text-neutral-300"
                          >
                            Restore
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </m.div>
            )}
          </AnimatePresence>
        </>
      )}
      <AnimatePresence initial={false}>
        {feedback && (
          <m.p
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            className={`px-4 pb-3 text-[11px] font-semibold ${
              feedback.kind === "done"
                ? "text-emerald-600 dark:text-emerald-400"
                : "text-rose-600 dark:text-rose-400"
            }`}
          >
            {feedback.message}
          </m.p>
        )}
      </AnimatePresence>
      <ConfirmSheet
        open={confirmOpen}
        onClose={() => { setConfirmOpen(false); setPendingRaw(null); }}
        onConfirm={handleRestoreConfirm}
        title="Restore this backup?"
        description="Everything currently in the app is replaced with the backup's contents. Consider exporting a backup of the current data first."
        confirmLabel="Restore backup"
      />
      <ConfirmSheet
        open={cloudRestoreId !== null}
        onClose={() => setCloudRestoreId(null)}
        onConfirm={() => void handleCloudRestore()}
        title={cloudRestoreId ? `Restore ${formatBackupDate(cloudRestoreId)}?` : "Restore snapshot?"}
        description="Everything currently in the app is replaced with that day's snapshot. Consider exporting a backup of the current data first."
        confirmLabel="Restore snapshot"
      />
    </>
  );
}
