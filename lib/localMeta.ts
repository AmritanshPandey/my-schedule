const LOCAL_META_KEY = "planr_lastUpdated";

export function getLocalLastUpdated(): number {
  try {
    return parseInt(localStorage.getItem(LOCAL_META_KEY) ?? "0", 10) || 0;
  } catch {
    return 0;
  }
}

export function writeLocalLastUpdated(ts: number): void {
  try {
    localStorage.setItem(LOCAL_META_KEY, String(ts));
  } catch {
    // localStorage unavailable (private mode, etc.) — non-fatal
  }
}
