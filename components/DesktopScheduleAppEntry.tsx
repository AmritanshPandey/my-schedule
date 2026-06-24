"use client";

import MotionProvider from "@/components/MotionProvider";
import ScheduleApp from "@/components/ScheduleApp";

export default function DesktopScheduleAppEntry() {
  return (
    <MotionProvider>
      <ScheduleApp />
    </MotionProvider>
  );
}
