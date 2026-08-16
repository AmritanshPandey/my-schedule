"use client";

import { useEffect, useState } from "react";
import { IconCircleCheck, IconCircleX, IconDeviceLaptop, IconLoader2, IconX } from "@tabler/icons-react";
import BottomSheet from "@/components/ui/BottomSheet";
import { getMLXConfig, setMLXConfig, DEFAULT_MLX_CONFIG } from "@/lib/ai/config";
import { MLXProvider } from "@/lib/ai/providers/mlx";
import type { AIConnectionTestResult } from "@/lib/ai/types";
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

const INPUT_CLASS =
  "w-full rounded-xl border border-neutral-200 bg-neutral-50 px-3 py-2 text-[13px] text-neutral-900 outline-none placeholder:text-neutral-400 focus:border-neutral-300 focus:bg-white dark:border-white/[0.08] dark:bg-white/[0.04] dark:text-white dark:placeholder:text-neutral-600 dark:focus:border-white/20 dark:focus:bg-white/[0.07]";

// ── Status + config card ─────────────────────────────────────────────────────
//
// MLX runs entirely on this device — no account, no API key, no cloud usage.
// The only thing worth surfacing here is: is it actually reachable right
// now, and if not, the server URL / model to point at.

type TestPhase = "idle" | "testing" | "done";

/** Exported so SettingsView.tsx's full-page "Intelligence" section can render
 *  the same live MLX status/config UI inline, instead of a second, drifting
 *  copy of this logic. */
export function StatusCard() {
  const [config, setConfig] = useState(() => getMLXConfig());
  const [draftBaseUrl, setDraftBaseUrl] = useState(config.baseUrl);
  const [draftModel, setDraftModel] = useState(config.model);
  const [phase, setPhase] = useState<TestPhase>("idle");
  const [result, setResult] = useState<AIConnectionTestResult | null>(null);

  const dirty = draftBaseUrl.trim() !== config.baseUrl || draftModel.trim() !== config.model;

  async function runTest(cfg = config) {
    haptic("light");
    setPhase("testing");
    setResult(null);
    const outcome = await new MLXProvider(cfg).testConnection();
    setResult(outcome);
    setPhase("done");
  }

  // Test once on open with whatever's already saved, so the status is never
  // stale ("Not configured" forever) just because the user hasn't touched
  // this sheet.
  useEffect(() => {
    void runTest();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function handleSave() {
    const next = { baseUrl: draftBaseUrl.trim() || DEFAULT_MLX_CONFIG.baseUrl, model: draftModel.trim() || DEFAULT_MLX_CONFIG.model };
    setMLXConfig(next);
    setConfig(next);
    setDraftBaseUrl(next.baseUrl);
    setDraftModel(next.model);
    void runTest(next);
  }

  function handleReset() {
    setMLXConfig(DEFAULT_MLX_CONFIG);
    setConfig(DEFAULT_MLX_CONFIG);
    setDraftBaseUrl(DEFAULT_MLX_CONFIG.baseUrl);
    setDraftModel(DEFAULT_MLX_CONFIG.model);
    void runTest(DEFAULT_MLX_CONFIG);
  }

  return (
    <Card>
      <div className="flex items-center gap-3 px-4 py-3.5">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-neutral-900 dark:bg-white">
          <IconDeviceLaptop size={16} strokeWidth={2} className="text-white dark:text-neutral-900" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-[13px] font-bold text-neutral-900 dark:text-white">
            {config.model.split("/").pop()}
          </p>
          <p className="truncate text-[11px] font-medium text-neutral-400 dark:text-neutral-500">
            Local · MLX
          </p>
        </div>
        {phase === "testing" ? (
          <span className="flex items-center gap-1.5 text-[11px] font-semibold text-neutral-400 dark:text-neutral-500">
            <IconLoader2 size={13} strokeWidth={2.5} className="animate-spin" />
            Connecting…
          </span>
        ) : result?.ok ? (
          <span className="flex items-center gap-1.5 text-[11px] font-semibold text-emerald-600 dark:text-emerald-400">
            <IconCircleCheck size={14} strokeWidth={2} />
            Connected
          </span>
        ) : result && !result.ok ? (
          <span className="flex items-center gap-1.5 text-[11px] font-semibold text-rose-600 dark:text-rose-400">
            <IconCircleX size={14} strokeWidth={2} />
            Unavailable
          </span>
        ) : null}
      </div>

      {result?.ok && (
        <>
          <Divider />
          <div className="px-4 py-3">
            <p className="text-[11px] font-medium text-neutral-500 dark:text-neutral-400">
              {result.tokensPerSecond ? `${result.tokensPerSecond} tok/s` : "Responding normally"}
            </p>
          </div>
        </>
      )}

      {result && !result.ok && (
        <>
          <Divider />
          <div className="px-4 py-3">
            <p className="text-[11px] leading-relaxed text-rose-600 dark:text-rose-400">{result.error}</p>
          </div>
        </>
      )}

      <Divider />

      <div className="space-y-3 px-4 py-3.5">
        <div>
          <p className="mb-1 text-[11px] font-semibold text-neutral-500 dark:text-neutral-400">Server</p>
          <input
            type="text"
            value={draftBaseUrl}
            onChange={(e) => setDraftBaseUrl(e.target.value)}
            placeholder={DEFAULT_MLX_CONFIG.baseUrl}
            spellCheck={false}
            className={INPUT_CLASS}
          />
        </div>
        <div>
          <p className="mb-1 text-[11px] font-semibold text-neutral-500 dark:text-neutral-400">Model</p>
          <input
            type="text"
            value={draftModel}
            onChange={(e) => setDraftModel(e.target.value)}
            placeholder={DEFAULT_MLX_CONFIG.model}
            spellCheck={false}
            className={INPUT_CLASS}
          />
        </div>
        <div className="flex gap-2 pt-1">
          <button
            type="button"
            onClick={dirty ? handleSave : () => void runTest()}
            disabled={phase === "testing"}
            className="flex-1 rounded-xl bg-neutral-900 px-3 py-2 text-[12px] font-bold text-white disabled:opacity-60 dark:bg-white dark:text-neutral-900"
          >
            {dirty ? "Save & test connection" : "Test connection"}
          </button>
          {(draftBaseUrl !== DEFAULT_MLX_CONFIG.baseUrl || draftModel !== DEFAULT_MLX_CONFIG.model) && (
            <button
              type="button"
              onClick={handleReset}
              className="rounded-xl border border-neutral-200 px-3 py-2 text-[12px] font-semibold text-neutral-500 hover:border-neutral-300 dark:border-white/[0.08] dark:text-neutral-400 dark:hover:border-white/20"
            >
              Reset
            </button>
          )}
        </div>
      </div>

      <Divider />

      <div className="px-4 py-3.5">
        <p className="text-[11px] leading-relaxed text-neutral-500 dark:text-neutral-400">
          Runs on your device — no account, no API key, no cloud AI usage. Start it with{" "}
          <code className="rounded bg-neutral-100 px-1 py-0.5 font-mono text-[10px] dark:bg-white/[0.08]">
            mlx_lm.server --model {config.model} --port 8080
          </code>
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
              MLX · Local · Free
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
