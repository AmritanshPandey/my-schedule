"use client";

import { useState } from "react";
import { IconLogout, IconShield, IconSparkles, IconX } from "@tabler/icons-react";
import BottomSheet from "@/components/ui/BottomSheet";
import { useAuth } from "@/contexts/AuthProvider";
import { useGoogleSignIn } from "@/components/auth/useGoogleSignIn";
import { AuthErrorNote } from "@/components/auth/AuthErrorNote";
import { haptic } from "@/lib/haptics";

// ── Primitives ────────────────────────────────────────────────────────────────

function Card({ children }: { children: React.ReactNode }) {
  return (
    <div className="overflow-hidden rounded-2xl border border-neutral-200 bg-white dark:border-white/[0.08] dark:bg-neutral-900">
      {children}
    </div>
  );
}

function Divider() {
  return <div className="mx-4 border-t border-neutral-100 dark:border-white/[0.06]" />;
}

// ── Status card ───────────────────────────────────────────────────────────────
//
// AI runs on one shared, developer-owned Gemini key — there's no model to pick,
// no server to point at. The only thing worth surfacing here is who's signed in
// (caps are tied to the Firebase uid) and a way to sign out.

function StatusCard() {
  const { user, isGuest, logout } = useAuth();
  const { signingIn, error, isAuthAvailable, signIn } = useGoogleSignIn();
  const [signingOut, setSigningOut] = useState(false);

  async function handleSignOut() {
    haptic("light");
    setSigningOut(true);
    try {
      await logout();
    } finally {
      setSigningOut(false);
    }
  }

  return (
    <Card>
      <div className="flex items-center gap-3 px-4 py-3.5">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[#AD46FF]">
          <IconSparkles size={16} strokeWidth={2} className="text-white" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-[13px] font-bold text-neutral-900 dark:text-white">
            Gemini AI
          </p>
          <p className="truncate text-[11px] font-medium text-neutral-400 dark:text-neutral-500">
            {isGuest ? "Not signed in" : (user?.displayName || user?.email || "Signed in")}
          </p>
        </div>
        {isGuest ? (
          <button
            type="button"
            onClick={() => { haptic("light"); void signIn(); }}
            disabled={signingIn}
            className="rounded-xl bg-neutral-900 px-3 py-1.5 text-[11px] font-bold text-white disabled:opacity-60 dark:bg-white dark:text-neutral-900"
          >
            {signingIn ? "Signing in…" : "Sign in"}
          </button>
        ) : (
          <button
            type="button"
            onClick={() => void handleSignOut()}
            disabled={signingOut}
            className="flex items-center gap-1 rounded-xl border border-neutral-200 px-3 py-1.5 text-[11px] font-semibold text-neutral-500 hover:border-neutral-300 disabled:opacity-60 dark:border-white/[0.08] dark:text-neutral-400"
          >
            <IconLogout size={12} strokeWidth={2} />
            Sign out
          </button>
        )}
      </div>

      {isGuest && !isAuthAvailable && (
        <>
          <Divider />
          <div className="px-4 py-3">
            <AuthErrorNote message={null} unavailable id="ai-settings-unavailable" className="text-[11px]" />
          </div>
        </>
      )}
      {error && (
        <>
          <Divider />
          <div className="px-4 py-3">
            <AuthErrorNote message={error} id="ai-settings-error" className="text-[11px]" />
          </div>
        </>
      )}

      <Divider />

      <div className="flex items-start gap-2.5 px-4 py-3.5">
        <IconShield size={13} strokeWidth={2} className="mt-0.5 shrink-0 text-emerald-500" />
        <p className="text-[11px] leading-relaxed text-neutral-500 dark:text-neutral-400">
          Free, powered by Google Gemini. Each account has a daily usage limit so the
          shared quota holds up for everyone — it resets every day.
        </p>
      </div>
    </Card>
  );
}

// ── Main sheet ────────────────────────────────────────────────────────────────

interface AISettingsSheetProps {
  open: boolean;
  onClose: () => void;
}

export function AISettingsSheet({ open, onClose }: AISettingsSheetProps) {
  return (
    <BottomSheet open={open} onClose={onClose} desktopWidth="max-w-[560px]">
      <div
        className="px-5 pt-4"
        style={{ paddingBottom: "max(40px, calc(env(safe-area-inset-bottom) + 24px))" }}
      >
        {/* Header */}
        <div className="mb-5 flex items-center justify-between">
          <div>
            <p className="text-[17px] font-bold tracking-[-0.3px] text-neutral-900 dark:text-white">
              AI Settings
            </p>
            <p className="text-[12px] text-neutral-400 dark:text-neutral-500">
              Gemini · Free · Sign-in required
            </p>
          </div>
          <button type="button" onClick={onClose}
            className="flex h-8 w-8 items-center justify-center rounded-xl text-neutral-400 hover:bg-neutral-100 dark:hover:bg-white/[0.06]">
            <IconX size={16} strokeWidth={2} />
          </button>
        </div>

        <StatusCard />
      </div>
    </BottomSheet>
  );
}
