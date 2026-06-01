// Type definitions for plan items (subtasks).
// The original ScheduleItem component is no longer used; this file
// is preserved as the canonical home of these shared interfaces.

export interface MetaField {
  label: string;
  value: string;
}

export interface ScheduleEntry {
  id: string;
  time?: string;
  task: string;
  info?: string;
  note?: string;
  meta?: MetaField[];
  date?: string;
  duration?: string;
  notes?: string;
}
