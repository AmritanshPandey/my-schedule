"use client";

import type { ReactNode } from "react";
import { stopTextEditKeyPropagationFromEditable } from "@/lib/keyboardEvents";

export default function KeyboardBoundary({ children }: { children: ReactNode }) {
  return (
    <div className="contents" onKeyDown={stopTextEditKeyPropagationFromEditable}>
      {children}
    </div>
  );
}
