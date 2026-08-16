"use client";

import { IconSparkles } from "@tabler/icons-react";
import { useGoogleSignIn } from "./useGoogleSignIn";
import { AuthErrorNote } from "./AuthErrorNote";
import { haptic } from "@/lib/haptics";

/**
 * Hard, non-dismissible sign-in gate for AI surfaces — rendered IN PLACE of
 * the feature itself, unlike the dismissible backup nudge (SignInPrompt).
 *
 * AI runs on one shared, developer-owned Gemini key with per-user daily caps
 * enforced server-side by Firebase uid (see worker/src/usage.ts) — there's no
 * meaningful guest path, since a cap tied to a device rather than an account
 * is trivially reset by clearing storage. So every AI entry point shows this
 * instead of the feature when `useAIActions().available` is false because the
 * caller isn't signed in.
 */
export default function AISignInGate({
  message = "Sign in to use AI — it's free, with a daily limit per account.",
  className = "",
}: {
  message?: string;
  className?: string;
}) {
  const { signingIn, error, isAuthAvailable, signIn } = useGoogleSignIn();

  return (
    <div className={`flex flex-col items-center justify-center gap-3 py-12 px-4 text-center ${className}`}>
      <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-neutral-100 dark:bg-white/[0.06]">
        <IconSparkles size={20} strokeWidth={1.5} className="text-neutral-400 dark:text-neutral-500" />
      </div>
      <p className="max-w-[240px] text-[13px] leading-relaxed text-neutral-500 dark:text-neutral-400">
        {message}
      </p>
      {isAuthAvailable ? (
        <button
          type="button"
          onClick={() => { haptic("light"); void signIn(); }}
          disabled={signingIn}
          aria-describedby={error ? "ai-signin-gate-error" : undefined}
          className="inline-flex h-10 items-center gap-2 rounded-full bg-neutral-950 px-4 text-[13px] font-bold text-white transition-colors hover:bg-neutral-800 disabled:opacity-60 dark:bg-white dark:text-neutral-950 dark:hover:bg-neutral-200"
        >
          {signingIn ? "Signing in…" : "Continue with Google"}
        </button>
      ) : (
        <AuthErrorNote message={null} unavailable id="ai-signin-gate-error" className="text-[12px]" />
      )}
      <AuthErrorNote message={error} id="ai-signin-gate-error" className="text-[11px]" />
    </div>
  );
}
