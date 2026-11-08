"use client";

import { IconX } from "@tabler/icons-react";
import { Eyebrow, SheetTitle } from "@/components/ui/Typography";
import { ICON } from "@/components/ui/Icon";
import IconButton from "@/components/ui/IconButton";

interface SheetHeaderProps {
  eyebrow: string;
  title: string;
  onClose: () => void;
  className?: string;
}

/**
 * Sticks to the top of the sheet's scroll area, frosted, so the sheet always
 * says what it is and can be closed while a long form scrolls beneath it. The
 * negative margin takes it edge to edge over the sheet's px-5.
 */
export default function SheetHeader({ eyebrow, title, onClose, className = "" }: SheetHeaderProps) {
  return (
    <div className={`sticky top-0 z-20 -mx-5 flex items-start justify-between gap-3 bg-white/80 px-5 py-2 backdrop-blur-xl dark:bg-neutral-900/80 ${className}`}>
      <div>
        <Eyebrow>{eyebrow}</Eyebrow>
        <SheetTitle className="mt-0.5">{title}</SheetTitle>
      </div>
      <IconButton label="Close" variant="secondary" size="sm" onClick={onClose}>
        <IconX {...ICON.ui} />
      </IconButton>
    </div>
  );
}
