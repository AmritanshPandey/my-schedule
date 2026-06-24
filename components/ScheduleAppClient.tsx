"use client";

import { useEffect, useState } from "react";
import dynamic from "next/dynamic";
import KeyboardBoundary from "@/components/KeyboardBoundary";
import { isIOSSafeMode } from "@/lib/iosSafeMode";

const DesktopScheduleAppEntry = dynamic(() => import("@/components/DesktopScheduleAppEntry"), {
  ssr: false,
});

const IOSScheduleApp = dynamic(() => import("@/components/ios/IOSScheduleApp"), {
  ssr: false,
});

export default function ScheduleAppClient() {
  const [iosSafeMode, setIosSafeMode] = useState<boolean | null>(null);

  useEffect(() => {
    setIosSafeMode(isIOSSafeMode());
  }, []);

  return (
    <KeyboardBoundary>
      {iosSafeMode === null ? (
        <main className="min-h-dvh bg-[#F5F5F5] dark:bg-[#111111]" />
      ) : iosSafeMode ? (
        <IOSScheduleApp />
      ) : (
        <DesktopScheduleAppEntry />
      )}
    </KeyboardBoundary>
  );
}
