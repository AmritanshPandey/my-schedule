const LEGACY_LOCAL_META_KEY = "planr_lastUpdated";

function localMetaKey(uid?: string | null): string {
  return uid ? `planr_lastUpdated:${uid}` : "planr_lastUpdated:guest";
}

export function getLocalLastUpdated(uid?: string | null): number {
  try {
    const key = localMetaKey(uid);
    const scopedValue = localStorage.getItem(key);
    if (scopedValue !== null) return parseInt(scopedValue, 10) || 0;
    if (!uid) return parseInt(localStorage.getItem(LEGACY_LOCAL_META_KEY) ?? "0", 10) || 0;
    return 0;
  } catch {
    return 0;
  }
}

export function writeLocalLastUpdated(ts: number, uid?: string | null): void {
  try {
    localStorage.setItem(localMetaKey(uid), String(ts));
  } catch {
    // localStorage unavailable (private mode, etc.) — non-fatal
  }
}
