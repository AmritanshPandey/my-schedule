"use client";

import { Eyebrow, SubsectionTitle } from "@/components/ui/Typography";

interface SectionHeaderProps {
  eyebrow: string;
  title: string;
  action?: React.ReactNode;
  className?: string;
}

export function SectionHeader({ eyebrow, title, action, className = "" }: SectionHeaderProps) {
  return (
    <div className={`flex items-end justify-between ${className}`}>
      <div>
        <Eyebrow>{eyebrow}</Eyebrow>
        <SubsectionTitle className="mt-0.5">{title}</SubsectionTitle>
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  );
}
