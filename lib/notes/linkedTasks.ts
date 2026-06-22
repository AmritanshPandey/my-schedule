import type { Task } from "@/lib/useScheduleDB";

/**
 * Resolve a note's `linkedTaskIds` to live Task objects, dropping ids that no
 * longer exist (deleted tasks) and de-duplicating. Pure — used to render the
 * note's linked-task chips and to prune stale links on save.
 */
export function resolveLinkedTasks(
  linkedTaskIds: string[] | undefined,
  tasksById: Map<string, Task>,
): Task[] {
  if (!linkedTaskIds?.length) return [];
  const seen = new Set<string>();
  const out: Task[] = [];
  for (const id of linkedTaskIds) {
    if (seen.has(id)) continue;
    const task = tasksById.get(id);
    if (task) {
      out.push(task);
      seen.add(id);
    }
  }
  return out;
}
