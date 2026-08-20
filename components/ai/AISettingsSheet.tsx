"use client";

import { useState } from "react";
import { IconCheck, IconLogout, IconShield, IconSparkles, IconX } from "@tabler/icons-react";
import BottomSheet from "@/components/ui/BottomSheet";
import { useAuth } from "@/contexts/AuthProvider";
import { useGoogleSignIn } from "@/components/auth/useGoogleSignIn";
import { AuthErrorNote } from "@/components/auth/AuthErrorNote";
import { haptic } from "@/lib/haptics";
import type { AIProviderType, ConnectionResult } from "@/lib/ai/providers/types";
import { mlxProvider } from "@/lib/ai/providers/mlx";
import {
  getActiveProviderType,
  setActiveProviderType,
  getMlxBaseUrl,
  setMlxBaseUrl,
  getMlxModel,
  setMlxModel,
} from "@/lib/ai/providers/settings";

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

// ── Provider picker ──────────────────────────────────────────────────────────

const PROVIDER_OPTIONS: { value: AIProviderType; label: string }[] = [
  { value: "mlx", label: "MLX (local)" },
  { value: "gemini", label: "Gemini (optional)" },
];

function ProviderPicker({ value, onChange }: { value: AIProviderType; onChange: (v: AIProviderType) => void }) {
  return (
    <div className="flex gap-1.5 px-1">
      {PROVIDER_OPTIONS.map((opt) => {
        const active = value === opt.value;
        return (
          <button
            key={opt.value}
            type="button"
            onClick={() => { haptic("light"); onChange(opt.value); }}
            className={`flex-1 rounded-xl border px-3 py-2 text-[12px] font-semibold transition-all ${
              active
                ? "border-neutral-950 bg-neutral-950 text-white dark:border-white dark:bg-white dark:text-neutral-900"
                : "border-neutral-200 text-neutral-600 hover:border-neutral-300 dark:border-white/10 dark:text-neutral-400 dark:hover:border-white/20"
            }`}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}

// ── Gemini status card ───────────────────────────────────────────────────────
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

// ── MLX settings card ────────────────────────────────────────────────────────
//
// A direct browser fetch to a local mlx_lm.server — no account, no API key.
// Only reachable when the browser tab is open on the same Mac running it.

function ConnectionDot({ state }: { state: "idle" | "testing" | ConnectionResult }) {
  if (state === "testing") {
    return (
      <span className="relative flex h-2 w-2 shrink-0">
        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-neutral-400 opacity-60" />
        <span className="relative inline-flex h-2 w-2 rounded-full bg-neutral-400" />
      </span>
    );
  }
  if (state === "idle") {
    return <span className="h-2 w-2 shrink-0 rounded-full bg-neutral-300 dark:bg-neutral-600" />;
  }
  return <span className={`h-2 w-2 shrink-0 rounded-full ${state.ok ? "bg-emerald-500" : "bg-rose-500"}`} />;
}

function MlxSettingsCard() {
  const [baseUrl, setBaseUrlState] = useState(() => getMlxBaseUrl());
  const [model, setModelState] = useState(() => getMlxModel());
  const [status, setStatus] = useState<"idle" | "testing" | ConnectionResult>("idle");

  function saveBaseUrl(v: string) {
    const trimmed = v.trim();
    setBaseUrlState(trimmed);
    setMlxBaseUrl(trimmed);
    setStatus("idle");
  }

  function saveModel(v: string) {
    const trimmed = v.trim();
    setModelState(trimmed);
    setMlxModel(trimmed);
    setStatus("idle");
  }

  async function handleTest() {
    haptic("light");
    setStatus("testing");
    const result = await mlxProvider.testConnection();
    setStatus(result);
  }

  const statusLabel =
    status === "idle" ? "Not tested yet" :
    status === "testing" ? "Testing…" :
    status.ok ? `Connected${status.latencyMs !== undefined ? ` · ${status.latencyMs}ms` : ""}` :
    status.message;

  const statusColor =
    status === "idle" ? "text-neutral-400 dark:text-neutral-500" :
    status === "testing" ? "text-neutral-400 dark:text-neutral-500" :
    status.ok ? "text-emerald-600 dark:text-emerald-400" : "text-rose-500 dark:text-rose-400";

  return (
    <Card>
      <div className="flex items-center gap-3 px-4 py-3.5">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-neutral-900 dark:bg-white">
          <IconSparkles size={16} strokeWidth={2} className="text-white dark:text-neutral-900" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-[13px] font-bold text-neutral-900 dark:text-white">MLX (local)</p>
          <p className={`truncate text-[11px] font-medium ${statusColor}`}>{statusLabel}</p>
        </div>
        <ConnectionDot state={status} />
      </div>

      <Divider />

      <div className="space-y-3 px-4 py-3.5">
        <div>
          <p className="mb-1.5 text-[11px] font-semibold text-neutral-500 dark:text-neutral-400">Server URL</p>
          <input
            type="text"
            value={baseUrl}
            onChange={(e) => setBaseUrlState(e.target.value)}
            onBlur={(e) => saveBaseUrl(e.target.value)}
            placeholder="http://localhost:8080"
            className="h-10 w-full rounded-xl border border-neutral-200 bg-neutral-50 px-3 text-[13px] font-medium text-neutral-900 outline-none focus:border-neutral-400 focus:bg-white dark:border-white/[0.08] dark:bg-white/[0.04] dark:text-white"
          />
        </div>
        <div>
          <p className="mb-1.5 text-[11px] font-semibold text-neutral-500 dark:text-neutral-400">Model</p>
          <input
            type="text"
            value={model}
            onChange={(e) => setModelState(e.target.value)}
            onBlur={(e) => saveModel(e.target.value)}
            placeholder="mlx-community/Qwen3-4B-4bit"
            className="h-10 w-full rounded-xl border border-neutral-200 bg-neutral-50 px-3 text-[13px] font-medium text-neutral-900 outline-none focus:border-neutral-400 focus:bg-white dark:border-white/[0.08] dark:bg-white/[0.04] dark:text-white"
          />
        </div>
        <button
          type="button"
          onClick={() => void handleTest()}
          disabled={status === "testing"}
          className="flex w-full items-center justify-center gap-1.5 rounded-xl border border-neutral-200 py-2 text-[12px] font-semibold text-neutral-600 transition-colors hover:bg-neutral-50 disabled:opacity-60 dark:border-white/[0.08] dark:text-neutral-300 dark:hover:bg-white/[0.04]"
        >
          {status !== "idle" && status !== "testing" && status.ok ? (
            <IconCheck size={13} strokeWidth={2.5} className="text-emerald-500" />
          ) : null}
          {status === "testing" ? "Testing…" : "Test Connection"}
        </button>
      </div>

      <Divider />

      <div className="flex items-start gap-2.5 px-4 py-3.5">
        <IconShield size={13} strokeWidth={2} className="mt-0.5 shrink-0 text-emerald-500" />
        <p className="text-[11px] leading-relaxed text-neutral-500 dark:text-neutral-400">
          Runs on your Mac. No API key required, no sign-in, no daily limit — your
          prompts never leave this device. PlanR uses this local provider for its
          AI features by default; Gemini remains available as an optional fallback.
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
  const [provider, setProvider] = useState<AIProviderType>(() => getActiveProviderType());

  function handleProviderChange(next: AIProviderType) {
    setActiveProviderType(next);
    setProvider(next);
  }

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
              {provider === "mlx" ? "MLX (local) · No sign-in" : "Gemini · Free · Sign-in required"}
            </p>
          </div>
          <button type="button" onClick={onClose}
            className="flex h-8 w-8 items-center justify-center rounded-xl text-neutral-400 hover:bg-neutral-100 dark:hover:bg-white/[0.06]">
            <IconX size={16} strokeWidth={2} />
          </button>
        </div>

        <div className="mb-4">
          <ProviderPicker value={provider} onChange={handleProviderChange} />
        </div>

        {provider === "mlx" ? <MlxSettingsCard /> : <StatusCard />}
      </div>
    </BottomSheet>
  );
}
