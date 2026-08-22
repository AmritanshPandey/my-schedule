import type { Plan, Task } from "./useScheduleDB";

type TaskWindow = Pick<Task, "activeFrom" | "activeUntil">;

function laterDate(first?: string, second?: string): string | undefined {
  if (!first) return second;
  if (!second) return first;
  return first > second ? first : second;
}

function earlierDate(first?: string, second?: string): string | undefined {
  if (!first) return second;
  if (!second) return first;
  return first < second ? first : second;
}

export function constrainTaskToPlanWindow<T extends TaskWindow>(
  task: T,
  plan: Pick<Plan, "startDate" | "endDate">
): T {
  return {
    ...task,
    activeFrom: laterDate(task.activeFrom, plan.startDate),
    activeUntil: earlierDate(task.activeUntil, plan.endDate),
  };
}