"use client";

import { useCallback, useState } from "react";
import { AnimatePresence, m } from "framer-motion";
import { IconUserX } from "@tabler/icons-react";
import ConfirmSheet from "@/components/ui/ConfirmSheet";
import { useAuth } from "@/contexts/AuthProvider";
import { haptic } from "@/lib/haptics";

/**
 * "Delete account" for the Data card in both settings surfaces. Signed-in
 * only. Deletes every cloud copy and the login (functions/src deleteAccount),
 * then this device's copy, then signs out. Unlike "Clear all data", the
 * account itself is gone afterwards, so this is the row the App Store's
 * account-deletion rule points at.
 */
export default function DeleteAccountRow({
  onClearData,
  onDone,
}: {
  /** Wipes this device's copy of the account's data. */
  onClearData: () => Promise<void>;
  onDone?: () => void;
}) {
  const { isGuest, deleteAccount } = useAuth();
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [phase, setPhase] = useState<"idle" | "deleting">("idle");
  const [error, setError] = useState<string | null>(null);

  const handleDelete = useCallback(async () => {
    setPhase("deleting");
    setError(null);
    try {
      await deleteAccount(onClearData);
      onDone?.();
    } catch {
      setError("Couldn't delete your account. It's still here. Check your connection and try again.");
    } finally {
      setPhase("idle");
    }
  }, [deleteAccount, onClearData, onDone]);

  if (isGuest) return null;

  return (
    <div className="px-4 py-3.5">
      <AnimatePresence mode="wait" initial={false}>
        {phase === "idle" && (
          <m.div key="idle" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="flex items-center gap-3">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl border border-rose-100 bg-rose-50 text-rose-500 dark:border-rose-500/20 dark:bg-rose-500/10">
              <IconUserX size={14} strokeWidth={2} />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-[13px] font-semibold text-neutral-800 dark:text-white">Delete account</p>
              <p className="text-[11px] text-neutral-500 dark:text-neutral-400">Removes your data and your sign-in</p>
            </div>
            <button type="button" onClick={() => { haptic("light"); setConfirmOpen(true); }}
              className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-1.5 text-[11px] font-semibold text-rose-600 hover:bg-rose-100 dark:border-rose-500/20 dark:bg-rose-500/10 dark:text-rose-400 dark:hover:bg-rose-500/15">
              Delete
            </button>
          </m.div>
        )}
        {phase === "deleting" && (
          <m.div key="deleting" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="flex items-center gap-3">
            <span className="h-4 w-4 animate-spin rounded-full border-2 border-neutral-200 border-t-neutral-600" />
            <span className="text-[13px] font-medium text-neutral-500">Deleting account…</span>
          </m.div>
        )}
      </AnimatePresence>
      {error && <p role="alert" className="mt-2 text-[11px] font-medium text-rose-600 dark:text-rose-400">{error}</p>}
      <ConfirmSheet
        open={confirmOpen}
        onClose={() => setConfirmOpen(false)}
        onConfirm={() => void handleDelete()}
        title="Delete your account?"
        description="Permanently deletes your plans, history, notes and backups from the cloud and from this device, and removes your sign-in. Other signed-in devices stop syncing. This can't be undone. Export a backup first if you might want your data later."
        confirmLabel="Delete account"
      />
    </div>
  );
}
