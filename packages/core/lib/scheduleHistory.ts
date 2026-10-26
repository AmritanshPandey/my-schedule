/**
 * Bounded undo-history stack — pure so it's unit-testable outside React.
 * Backs Cmd+Z in useScheduleDB: every `setSchedule` call pushes the schedule
 * as it was *before* the mutation, capped so memory can't grow unbounded
 * across a long session. `useScheduleDB` holds the stack in a ref and calls
 * these on every push/pop rather than reimplementing the cap logic inline.
 */

export const HISTORY_LIMIT = 30;

/** Push `snapshot` onto `stack`, dropping the oldest entry once `limit` is
 *  exceeded. Returns a new array — does not mutate `stack`. */
export function pushHistory<T>(stack: readonly T[], snapshot: T, limit: number): T[] {
  const next = [...stack, snapshot];
  return next.length > limit ? next.slice(next.length - limit) : next;
}

/** Pop the most recent entry off `stack`. Returns `[undefined, stack]`
 *  (an equivalent, unchanged array) when the stack is empty. */
export function popHistory<T>(stack: readonly T[]): [T | undefined, T[]] {
  if (stack.length === 0) return [undefined, [...stack]];
  return [stack[stack.length - 1], stack.slice(0, -1)];
}
