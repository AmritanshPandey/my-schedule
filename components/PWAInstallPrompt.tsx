"use client";

import { useEffect, useState } from "react";
import { IconX, IconDownload } from "@tabler/icons-react";

type Platform = "ios" | "android" | "other";

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

function isStandalone(): boolean {
  if (typeof window === "undefined") return false;
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    ("standalone" in window.navigator &&
      (window.navigator as { standalone?: boolean }).standalone === true)
  );
}

function getPlatform(): Platform {
  if (typeof navigator === "undefined") return "other";
  const ua = navigator.userAgent;
  if (/iPhone|iPad|iPod/.test(ua)) return "ios";
  if (/Android/.test(ua)) return "android";
  return "other";
}

function IOSShareIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M8.5 6.5L12 3l3.5 3.5" />
      <line x1="12" y1="3" x2="12" y2="15" />
      <path d="M5 13v6a2 2 0 002 2h10a2 2 0 002-2v-6" />
    </svg>
  );
}

function IOSAddHomeIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="3" width="18" height="18" rx="3" />
      <line x1="12" y1="8" x2="12" y2="16" />
      <line x1="8" y1="12" x2="16" y2="12" />
    </svg>
  );
}

function IOSTapAddIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M9 12l2 2 4-4" />
      <path d="M12 3a9 9 0 100 18A9 9 0 0012 3z" />
    </svg>
  );
}

function AndroidMenuIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
      <circle cx="12" cy="5" r="1.8" />
      <circle cx="12" cy="12" r="1.8" />
      <circle cx="12" cy="19" r="1.8" />
    </svg>
  );
}

function AndroidAddHomeIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 10.5L12 3l9 7.5V20a2 2 0 01-2 2H5a2 2 0 01-2-2v-9.5z" />
      <line x1="12" y1="14" x2="12" y2="20" />
      <line x1="9" y1="17" x2="15" y2="17" />
    </svg>
  );
}

function AndroidConfirmIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M5 13l4 4L19 7" />
    </svg>
  );
}

function Step({
  number,
  icon,
  label,
  description,
}: {
  number: number;
  icon: React.ReactNode;
  label: string;
  description: string;
}) {
  return (
    <div className="flex items-center gap-3">
      <div className="h-7 w-7 rounded-full bg-neutral-100 dark:bg-white/[0.08] flex items-center justify-center shrink-0 text-xs font-bold text-neutral-500 dark:text-neutral-400">
        {number}
      </div>
      <div className="flex flex-1 items-center gap-3 rounded-xl border border-neutral-100 bg-neutral-50 px-3 py-2.5 dark:border-white/[0.07] dark:bg-white/[0.04]">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-neutral-200 bg-white text-neutral-700 dark:border-white/10 dark:bg-neutral-800 dark:text-neutral-300">
          {icon}
        </div>
        <div className="min-w-0">
          <p className="text-sm font-semibold text-neutral-800 dark:text-neutral-200">{label}</p>
          <p className="text-xs text-neutral-400 dark:text-neutral-500">{description}</p>
        </div>
      </div>
    </div>
  );
}

export default function PWAInstallPrompt() {
  const [visible, setVisible] = useState(false);
  const [animateIn, setAnimateIn] = useState(false);
  const [platform, setPlatform] = useState<Platform>("other");
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);

  useEffect(() => {
    if (isStandalone()) return;

    const p = getPlatform();
    if (p === "other") return;

    setPlatform(p);

    function show() {
      setVisible(true);
      requestAnimationFrame(() => {
        requestAnimationFrame(() => setAnimateIn(true));
      });
    }

    if (p === "android") {
      let prompted = false;

      const handler = (e: Event) => {
        e.preventDefault();
        setDeferredPrompt(e as BeforeInstallPromptEvent);
        if (!prompted) {
          prompted = true;
          show();
        }
      };

      window.addEventListener("beforeinstallprompt", handler);

      const fallback = setTimeout(() => {
        if (!prompted) {
          prompted = true;
          show();
        }
      }, 700);

      const installedHandler = () => dismiss();
      window.addEventListener("appinstalled", installedHandler);

      return () => {
        window.removeEventListener("beforeinstallprompt", handler);
        window.removeEventListener("appinstalled", installedHandler);
        clearTimeout(fallback);
      };
    } else {
      const timer = setTimeout(show, 500);
      return () => clearTimeout(timer);
    }
  }, []);

  function dismiss() {
    setAnimateIn(false);
    setTimeout(() => setVisible(false), 300);
  }

  async function handleNativeInstall() {
    if (!deferredPrompt) return;
    await deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === "accepted") dismiss();
    setDeferredPrompt(null);
  }

  if (!visible) return null;

  return (
    <>
      <div
        className={`fixed inset-0 z-40 bg-black/50 backdrop-blur-sm transition-opacity duration-300 ${animateIn ? "opacity-100" : "opacity-0"}`}
        onClick={dismiss}
      />

      <div
        className={`fixed bottom-0 left-0 right-0 z-50 transition-transform duration-300 ease-out ${animateIn ? "translate-y-0" : "translate-y-full"}`}
      >
        <div className="mx-auto max-w-lg rounded-t-[32px] bg-white shadow-[0_-8px_40px_rgba(0,0,0,0.12)] dark:bg-neutral-900">
          {/* Drag handle */}
          <div className="flex justify-center pb-1 pt-3">
            <div className="h-1 w-10 rounded-full bg-neutral-300 dark:bg-white/20" />
          </div>

          <div className="space-y-5 px-5 pb-8 pt-4">
            {/* Header */}
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className="flex h-12 w-16 shrink-0 items-center pl-2 justify-center overflow-hidden rounded-2xl border border-neutral-200 bg-neutral-50 dark:border-white/10 dark:bg-neutral-800">
                  <img src="/logo.svg" alt="PlanR" className="h-6 w-auto dark:hidden" />
                  <img src="/logo-dark.svg" alt="PlanR" className="hidden h-6 w-auto dark:block" />
                </div>
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-[0.1em] text-neutral-400 dark:text-neutral-500">Install</p>
                  <h2 className="text-[18px] font-semibold text-neutral-950 dark:text-white mt-0.5">
                    PlanR
                  </h2>
                </div>
              </div>
              <button
                onClick={dismiss}
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl border border-neutral-200 text-neutral-400 hover:bg-neutral-50 dark:border-white/10 dark:text-neutral-500 dark:hover:bg-white/5 transition-colors"
                aria-label="Dismiss"
              >
                <IconX size={16} />
              </button>
            </div>

            {/* iOS instructions */}
            {platform === "ios" && (
              <div className="space-y-2.5">
                <p className="text-[11px] font-semibold uppercase tracking-wider text-neutral-400 dark:text-neutral-500">
                  How to install on iPhone / iPad
                </p>
                <div className="space-y-2">
                  <Step
                    number={1}
                    icon={<IOSShareIcon />}
                    label="Tap the Share button"
                    description='The share icon at the bottom of Safari'
                  />
                  <Step
                    number={2}
                    icon={<IOSAddHomeIcon />}
                    label='"Add to Home Screen"'
                    description="Scroll down in the share sheet to find it"
                  />
                  <Step
                    number={3}
                    icon={<IOSTapAddIcon />}
                    label='Tap "Add" to confirm'
                    description="The app will appear on your home screen"
                  />
                </div>
              </div>
            )}

            {/* Android instructions */}
            {platform === "android" && (
              <div className="space-y-3">
                {deferredPrompt ? (
                  <div className="space-y-3">
                    <p className="text-sm text-neutral-600 dark:text-neutral-400">
                      Get quick access, offline support, and a native-like experience by installing the app.
                    </p>
                    <button
                      onClick={handleNativeInstall}
                      className="flex h-12 w-full items-center justify-center gap-2 rounded-2xl bg-neutral-950 text-[15px] font-semibold text-white transition-all hover:bg-neutral-800 active:scale-[0.98] dark:bg-white dark:text-neutral-900 dark:hover:bg-neutral-100"
                    >
                      <IconDownload size={16} />
                      Install App
                    </button>
                  </div>
                ) : (
                  <div className="space-y-2.5">
                    <p className="text-[11px] font-semibold uppercase tracking-wider text-neutral-400 dark:text-neutral-500">
                      How to install on Android
                    </p>
                    <div className="space-y-2">
                      <Step
                        number={1}
                        icon={<AndroidMenuIcon />}
                        label="Tap the menu button"
                        description="Three dots in the top-right corner of Chrome"
                      />
                      <Step
                        number={2}
                        icon={<AndroidAddHomeIcon />}
                        label='"Add to Home Screen"'
                        description='Or tap "Install app" if shown'
                      />
                      <Step
                        number={3}
                        icon={<AndroidConfirmIcon />}
                        label='Tap "Add" to confirm'
                        description="The app will appear on your home screen"
                      />
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Dismiss link */}
            <button
              onClick={dismiss}
              className="w-full py-1 text-center text-[12px] font-medium text-neutral-400 transition-colors hover:text-neutral-600 dark:text-neutral-500 dark:hover:text-neutral-300"
            >
              Maybe later
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
