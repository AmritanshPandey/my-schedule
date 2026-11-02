"use client";

import { memo } from "react";
import { AnimatePresence, m } from "framer-motion";
import { SectionTitle } from "@/components/ui/Typography";
import Button from "@/components/ui/Button";
import IconButton from "@/components/ui/IconButton";

interface InternalSectionTitleProps {
  title: string;
  actions?: React.ReactNode;
  tabs?: React.ReactNode;
  className?: string;
}

interface SectionIconButtonProps {
  icon: React.ReactNode;
  saveIcon?: React.ReactNode;
  saving?: boolean;
  onClick: () => void;
  label?: string;
}

export function SectionIconButton({
  icon,
  saveIcon,
  saving = false,
  onClick,
  label,
}: SectionIconButtonProps) {
  return (
    <IconButton label={label ?? ""} variant="ghost" size="md" selected={saving} onClick={onClick}>
      <AnimatePresence mode="wait" initial={false}>
        <m.span
          key={saving ? "save" : "normal"}
          initial={{ opacity: 0, scale: 0.7 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.7 }}
          transition={{ duration: 0.13 }}
          className="inline-flex"
        >
          {saving && saveIcon ? saveIcon : icon}
        </m.span>
      </AnimatePresence>
    </IconButton>
  );
}

interface SectionTextActionProps {
  label: string;
  icon?: React.ReactNode;
  onClick: () => void;
}

export function SectionTextAction({ label, icon, onClick }: SectionTextActionProps) {
  return (
    <Button variant="ghost" size="sm" onClick={onClick} icon={icon}>
      {label}
    </Button>
  );
}

function InternalSectionTitleInner({
  title,
  actions,
  tabs,
  className = "",
}: InternalSectionTitleProps) {
  return (
    <div className={className}>
      <div className="flex items-center justify-between gap-3">
        <SectionTitle>{title}</SectionTitle>
        {actions && (
          <div className="flex shrink-0 items-center gap-1">
            {actions}
          </div>
        )}
      </div>
      {tabs && <div className="mt-3">{tabs}</div>}
    </div>
  );
}

export const InternalSectionTitle = memo(InternalSectionTitleInner);
