/**
 * Best-effort repair for JSON cut off mid-generation — a real risk under the
 * tight max_new_tokens ceilings small local models run under (see
 * lib/ai/providers/browserPrompts.ts, e.g. 130 tokens for subtasks). Shared
 * by lib/aiActions.ts's structured generators (flat top-level arrays like
 * `[{...},{...},...]`) and lib/ai.ts's parseAIAction (a nested shape like
 * `{"type":"create_plan","payload":{"tasks":[...],"milestones":[...]}}`).
 *
 * A cut can happen at ANY depth, not just the outermost one — this used to
 * be two separate, narrower implementations (one per file above), each of
 * which only recognized a safe cut point when the bracket stack returned to
 * depth 1. For a flat top-level array that happens to be the same thing as
 * "between elements", so it worked. For a nested array (parseAIAction's
 * `payload.tasks`), a cutoff three levels down never brings the stack back
 * to depth 1, so the old per-file versions recovered nothing there — losing
 * an entire create_plan response instead of just the tasks that didn't
 * finish.
 *
 * The fix: remember a safe cut point every time ANY bracket fully closes
 * (regardless of depth — completing an element is always safe to cut after),
 * and every time a comma appears while the innermost open bracket is `[` (a
 * sibling separator inside an array, at whatever depth that array sits at —
 * not inside an object, where a comma separates key/value pairs and cutting
 * there would leave a dangling key). At the end, close every bracket still
 * open on the stack, in reverse order, instead of assuming only the
 * outermost one is open.
 *
 * This is a strict superset of the old behavior: for a flat top-level array,
 * every safe-cut point already sits at depth 1, so the output is unchanged
 * (locked down by tests/ai-parsing.test.mjs's existing flat-array cases).
 * The new behavior only differs for a nested cutoff.
 */
export function repairTruncatedJSON(text: string): string | null {
  const stack: string[] = [];
  let inString = false;
  let escaped = false;
  let lastSafeCut = -1;
  let lastSafeStack: string[] = [];

  const closers: Record<string, string> = { "{": "}", "[": "]" };

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inString) {
      if (escaped) escaped = false;
      else if (ch === "\\") escaped = true;
      else if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') { inString = true; continue; }
    if (ch === "{" || ch === "[") { stack.push(ch); continue; }
    if (ch === "}" || ch === "]") {
      stack.pop();
      lastSafeCut = i + 1;
      lastSafeStack = [...stack];
      continue;
    }
    if (ch === "," && stack.length > 0 && stack[stack.length - 1] === "[") {
      lastSafeCut = i;
      lastSafeStack = [...stack];
    }
  }

  if (stack.length === 0 && !inString) return null; // already balanced — nothing to repair
  if (lastSafeCut === -1) return null; // not even one complete element to recover

  let closing = "";
  for (let i = lastSafeStack.length - 1; i >= 0; i--) closing += closers[lastSafeStack[i]];
  return text.slice(0, lastSafeCut) + closing;
}
