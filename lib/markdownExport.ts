/**
 * Markdown export — the builders live in @planr/core (shared with
 * apps/native); this file adds the browser download.
 */

import type { Schedule } from "@/lib/useScheduleDB";
import { buildMarkdown, markdownFilename, type MarkdownScope } from "@planr/core/lib/markdownExport";

export * from "@planr/core/lib/markdownExport";

/** Trigger a browser download of a scoped Markdown summary. */
export function downloadMarkdown(scope: MarkdownScope, schedule: Schedule): void {
  const text = buildMarkdown(scope, schedule);
  const blob = new Blob([text], { type: "text/markdown" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = markdownFilename(scope);
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  // Delay revocation so the download has started in all browsers.
  setTimeout(() => URL.revokeObjectURL(url), 1_000);
}
