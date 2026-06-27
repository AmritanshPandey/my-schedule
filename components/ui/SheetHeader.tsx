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

export default function SheetHeader({ eyebrow, title, onClose, className = "" }: SheetHeaderProps) {
  return (
    <div className={`flex items-start justify-between gap-3 ${className}`}>
      <div>
        <Eyebrow>{eyebrow}</Eyebrow>
        <SheetTitle className="mt-0.5">{title}</SheetTitle>
      </div>
      <IconButton label="Close" variant="outline" size="sm" radius="xl" onClick={onClose}>
        <IconX {...ICON.ui} />
      </IconButton>
    </div>
  );
}
