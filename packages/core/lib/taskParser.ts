import { inputToDisplayTime } from "./timeUtils";

// Matches time ranges like: 9-10, 9:30-10, 9am-10pm, 14:00-15:30, 9:00-10:30
const TIME_RANGE_RE =
  /\b(\d{1,2}(?::\d{2})?(?:am|pm)?)\s*[-–]\s*(\d{1,2}(?::\d{2})?)(am|pm)?\b/i;

function normalizeToInputTime(raw: string, trailingSuffix: string | undefined): string {
  // raw may have its own am/pm suffix embedded (e.g. "9am")
  const ownMatch = raw.match(/^(\d{1,2}(?::\d{2})?)(am|pm)?$/i);
  const digits = ownMatch?.[1] ?? raw;
  const suffix = (ownMatch?.[2] ?? trailingSuffix ?? "").toLowerCase();

  const [hStr, mStr = "0"] = digits.split(":");
  let h = parseInt(hStr, 10);
  const m = parseInt(mStr, 10);

  if (suffix === "pm" && h !== 12) h += 12;
  if (suffix === "am" && h === 12) h = 0;

  h = Math.max(0, Math.min(23, h));
  return `${h.toString().padStart(2, "0")}:${m.toString().padStart(2, "0")}`;
}

export function parseTaskLine(text: string): {
  title: string;
  startTime: string;
  endTime: string;
} {
  const match = text.match(TIME_RANGE_RE);
  if (!match) {
    return { title: text.trim(), startTime: "", endTime: "" };
  }

  const trailingSuffix = match[3]; // am/pm after end time
  const startInput = normalizeToInputTime(match[1], trailingSuffix);
  const endInput = normalizeToInputTime(match[2], trailingSuffix);

  const title = text.replace(match[0], "").replace(/[\s,\-–]+$/, "").trim();

  return {
    title: title || text.trim(),
    startTime: inputToDisplayTime(startInput),
    endTime: inputToDisplayTime(endInput),
  };
}
