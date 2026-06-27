"use client";

import { useEffect, useState } from "react";
import dynamic from "next/dynamic";
import KeyboardBoundary from "@/components/KeyboardBoundary";
import { shouldUseIOSAppShell } from "@/lib/iosSafeMode";

const DesktopScheduleAppEntry = dynamic(() => import("@/components/DesktopScheduleAppEntry"), {
  ssr: false,
});

const IOSScheduleApp = dynamic(() => import("@/components/ios/IOSScheduleApp"), {
  ssr: false,
});

export default function ScheduleAppClient() {
  const [useIOSAppShell, setUseIOSAppShell] = useState<boolean | null>(null);

  useEffect(() => {
    const updateShellMode = () => {
      const next = shouldUseIOSAppShell();
      setUseIOSAppShell((current) => (current === next ? current : next));
    };

    updateShellMode();
    window.addEventListener("resize", updateShellMode);
    window.addEventListener("orientationchange", updateShellMode);
    window.visualViewport?.addEventListener("resize", updateShellMode);

    return () => {
      window.removeEventListener("resize", updateShellMode);
      window.removeEventListener("orientationchange", updateShellMode);
      window.visualViewport?.removeEventListener("resize", updateShellMode);
    };
  }, []);

  return (
    <KeyboardBoundary>
      {useIOSAppShell === null ? (
        <main className="min-h-dvh bg-[#F5F5F5] dark:bg-[#111111]" />
      ) : useIOSAppShell ? (
        <IOSScheduleApp />
      ) : (
        <DesktopScheduleAppEntry />
      )}
    </KeyboardBoundary>
  );
}
