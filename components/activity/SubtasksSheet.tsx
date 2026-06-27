"use client";

import TaskDetailView, { type TaskDetailViewProps } from "@/components/activity/TaskDetailView";
import BottomSheet from "@/components/ui/BottomSheet";

interface SubtasksSheetProps extends TaskDetailViewProps {
  open: boolean;
}

export default function SubtasksSheet({ open, ...props }: SubtasksSheetProps) {
  return (
    <BottomSheet open={open} onClose={props.onClose}>
      <TaskDetailView {...props} presentation="sheet" />
    </BottomSheet>
  );
}
