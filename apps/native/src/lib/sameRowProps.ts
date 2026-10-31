/**
 * `React.memo` comparator for list rows whose parent rebuilds every prop on
 * each render: callbacks are inline closures, and some props are small
 * objects assembled per render (the merged timeline row's halves).
 *
 * - Functions are treated as equal. Only pass callbacks that write through
 *   functional state updates or refs, so an older closure still does the
 *   right thing; the row re-renders whenever its data changes anyway.
 * - Plain objects are compared one level deep, so `{ task, slotIndex }`
 *   rebuilt with the same task counts as unchanged.
 * - Everything else (the task itself, plans, categories) by identity, which
 *   the schedule's immutable updates keep stable for untouched items.
 */
export function sameRowProps<P extends object>(prev: Readonly<P>, next: Readonly<P>): boolean {
  const keys = Object.keys(next) as (keyof P)[];
  if (keys.length !== Object.keys(prev).length) return false;
  for (const key of keys) {
    const a = prev[key];
    const b = next[key];
    if (Object.is(a, b)) continue;
    if (typeof a === 'function' && typeof b === 'function') continue;
    if (isPlainObject(a) && isPlainObject(b) && shallowEqual(a, b)) continue;
    return false;
  }
  return true;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && Object.getPrototypeOf(value) === Object.prototype;
}

function shallowEqual(a: Record<string, unknown>, b: Record<string, unknown>): boolean {
  const keys = Object.keys(b);
  if (keys.length !== Object.keys(a).length) return false;
  return keys.every((k) => Object.is(a[k], b[k]));
}
