"use client";

import { useCallback, useEffect, useState } from "react";
import { IconCloudUp, IconX } from "@tabler/icons-react";
import { useAuth } from "@/contexts/AuthProvider";
import { useGoogleSignIn } from "./useGoogleSignIn";
import { AuthErrorNote } from "./AuthErrorNote";
import { haptic } from "@/lib/haptics";

const DISMISS_KEY = "planr-signin-prompt-dismissed";

function readDismissed(): boolean {
  try {
    return localStorage.getItem(DISMISS_KEY) === "1";
  } catch {
    return false;
  }
}

/**
 * Proactive, dismissible "sign in to back up" prompt for guests. Unlike the
 * always-optional Settings entry, this surfaces the offer where the user is
 * working. Shown only when a guest *can* sign in (Firebase configured), and
 * only once until dismissed — a backup nudge should never nag.
 *
 * Mount near a top-level surface under AuthProvider (the app shells). Renders
 * nothing for signed-in users, unavailable builds, or after dismissal.
 */
export default function SignInPrompt({ className = "" }: { className?: string }) {
  const { isGuest, authLoading } = useAuth();
  const { signingIn, error, isAuthAvailable, signIn } = useGoogleSignIn();
  const [dismissed, setDismissed] = useState(true);

  // Read persisted dismissal on mount (client-only; avoids SSR localStorage).
  useEffect(() => {
    setDismissed(readDismissed());
  }, []);

  const dismiss = useCallback(() => {
    haptic("light");
    setDismissed(true);
    try {
      localStorage.setItem(DISMISS_KEY, "1");
    } catch {
      /* private mode / storage disabled — the in-memory dismissal still holds */
    }
  }, []);

  if (authLoading || !isGuest || !isAuthAvailable || dismissed) return null;

  return (
    <div
      className={`relative overflow-hidden rounded-2xl border border-neutral-200 bg-white px-4 py-3.5 dark:border-white/[0.08] dark:bg-white/[0.03] ${className}`}
    >
      <button
        type="button"
        onClick={dismiss}
        aria-label="Dismiss"
        className="absolute right-2 top-2 flex h-7 w-7 items-center justify-center rounded-full text-neutral-400 transition-colors hover:bg-neutral-100 hover:text-neutral-600 dark:text-neutral-500 dark:hover:bg-white/[0.06]"
      >
        <IconX size={15} strokeWidth={2} />
      </button>
      <div className="flex items-start gap-3 pr-6">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-emerald-500/12 text-emerald-600 dark:text-emerald-400">
          <IconCloudUp size={18} strokeWidth={2} />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-[14px] font-bold text-neutral-900 dark:text-white">Back up your plan</p>
          <p className="mt-0.5 text-[12px] leading-snug text-neutral-500 dark:text-neutral-400">
            Sign in to sync across devices and never lose your progress.
          </p>
          <button
            type="button"
            onClick={() => { haptic("light"); void signIn(); }}
            disabled={signingIn}
            aria-describedby={error ? "signin-prompt-error" : undefined}
            className="mt-2.5 inline-flex h-9 items-center gap-2 rounded-full bg-neutral-950 px-4 text-[13px] font-bold text-white transition-colors hover:bg-neutral-800 disabled:opacity-60 dark:bg-white dark:text-neutral-950 dark:hover:bg-neutral-200"
          >
            {signingIn ? "Signing in…" : "Continue with Google"}
          </button>
          <AuthErrorNote message={error} id="signin-prompt-error" className="text-[11px]" />
        </div>
      </div>
    </div>
  );
}
