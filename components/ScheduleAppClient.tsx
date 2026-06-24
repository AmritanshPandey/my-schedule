"use client";

import dynamic from "next/dynamic";
import KeyboardBoundary from "@/components/KeyboardBoundary";

const ScheduleApp = dynamic(() => import("@/components/ScheduleApp"), {
  ssr: false,
});

export default function ScheduleAppClient() {
  return (
    <KeyboardBoundary>
      <ScheduleApp />
    </KeyboardBoundary>
  );
}

