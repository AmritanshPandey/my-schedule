"use client";

import type { ReactNode } from "react";
import MotionProvider from "@/components/MotionProvider";

export default function IOSMotionBoundary({ children }: { children: ReactNode }) {
  return <MotionProvider>{children}</MotionProvider>;
}
