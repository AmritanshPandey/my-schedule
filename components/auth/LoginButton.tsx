"use client";

import { useState, memo } from "react";
import { motion } from "framer-motion";
import Image from "next/image";
import { useAuth } from "@/contexts/AuthProvider";
import { SyncStatusBadge } from "@/components/auth/SyncStatusBadge";

// ── Google "G" logo SVG (official colours, no external fetch) ─────────────────
function GoogleLogo() {
  return (
    <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">
      <path
        fill="#4285F4"
        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
      />
      <path
        fill="#34A853"
        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
      />
      <path
        fill="#FBBC05"
        d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z"
      />
      <path
        fill="#EA4335"
        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
      />
    </svg>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export const LoginButton = memo(function LoginButton() {
  const { user, authLoading, isGuest, login, logout } = useAuth();
  const [busy, setBusy] = useState(false);

  if (authLoading) return null;

  async function handleLogin() {
    setBusy(true);
    try {
      await login();
    } catch {
      // user closed popup etc.
    } finally {
      setBusy(false);
    }
  }

  async function handleLogout() {
    setBusy(true);
    try {
      await logout();
    } finally {
      setBusy(false);
    }
  }

  // ── Signed in ──────────────────────────────────────────────────────────────
  if (!isGuest && user) {
    return (
      <div className="flex items-center gap-3">
        {/* Avatar + name */}
        <div className="flex items-center gap-2 min-w-0">
          {user.photoURL && (
            <Image
              src={user.photoURL}
              alt={user.displayName ?? ""}
              width={28}
              height={28}
              className="rounded-full shrink-0"
            />
          )}
          <div className="min-w-0">
            <p className="text-[13px] font-semibold leading-none text-neutral-900 dark:text-white truncate">
              {user.displayName ?? user.email}
            </p>
            <div className="mt-0.5">
              <SyncStatusBadge />
            </div>
          </div>
        </div>

        {/* Sign out */}
        <motion.button
          type="button"
          onClick={handleLogout}
          disabled={busy}
          whileTap={{ scale: 0.94 }}
          className="rounded-xl border border-neutral-200 bg-white px-3 py-1.5 text-[12px] font-semibold text-neutral-500 hover:text-neutral-900 dark:border-white/10 dark:bg-neutral-900 dark:text-neutral-400 dark:hover:text-white transition-colors disabled:opacity-50"
        >
          Sign out
        </motion.button>
      </div>
    );
  }

  // ── Guest / not signed in ─────────────────────────────────────────────────
  return (
    <div className="space-y-2">
      {/* Value prop */}
      <p className="text-[12px] text-neutral-500 dark:text-neutral-400">
        Sign in to back up your data and sync across devices.
      </p>

      <motion.button
        type="button"
        onClick={handleLogin}
        disabled={busy}
        whileTap={{ scale: 0.97 }}
        transition={{ type: "spring", stiffness: 400, damping: 22 }}
        className="inline-flex w-full items-center justify-center gap-2.5 rounded-xl border border-neutral-200 bg-white px-4 py-2.5 text-[14px] font-semibold text-neutral-700 hover:bg-neutral-100 hover:border-neutral-300 dark:border-white/10 dark:bg-neutral-900 dark:text-white dark:hover:bg-white/[0.07] dark:hover:border-white/[0.16] transition-colors disabled:opacity-60"
      >
        {busy ? (
          <span className="h-4 w-4 animate-spin rounded-full border-2 border-neutral-300 border-t-neutral-700 dark:border-neutral-700 dark:border-t-neutral-300" />
        ) : (
          <GoogleLogo />
        )}
        {busy ? "Signing in…" : "Continue with Google"}
      </motion.button>
    </div>
  );
});
