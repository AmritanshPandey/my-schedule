/**
 * Deterministic non-negative hash of a string. Used to map a stable label
 * (a tracker field, a note tag) to a consistent accent color via
 * `cycleAccentColor`, so the same text always renders the same color.
 */
export function stableFieldHash(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (Math.imul(31, h) + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}
