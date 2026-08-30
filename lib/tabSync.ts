/**
 * Cross-tab notification that the shared local record changed.
 *
 * Two tabs of one browser share IndexedDB and localStorage but have entirely
 * separate JavaScript and React state, and nothing ever told one tab that the
 * other had written. So each kept rendering its own stale tree and wrote it
 * back over the other's work — on disk, offline, with no revision check.
 *
 * This module carries a *signal*, never the data. A schedule can approach the
 * 1 MB Firestore document cap, and structured-cloning that on every debounced
 * write would be pure waste when both tabs are already looking at the same
 * IndexedDB record: the receiver re-reads it.
 *
 * Correctness does NOT depend on this channel. That lives in the local
 * compare-and-merge inside `writeDB` (lib/useScheduleDB.ts), which is safe even
 * if every message is dropped. This is what keeps the other tab's *screen*
 * honest, so the user isn't looking at data that is already stale on disk.
 */

const CHANNEL_NAME = "planr-schedule";
/** Only used by the localStorage fallback, to make a `storage` event fire. */
const PING_KEY = "planr_tabWrite";

export interface LocalWriteMessage {
  /** IndexedDB record key that changed, e.g. `user:{uid}:data`. */
  recordKey: string;
  /** The record revision the writing tab just produced. */
  rev: number;
}

type Handler = (msg: LocalWriteMessage) => void;

const _handlers = new Set<Handler>();
let _channel: BroadcastChannel | null = null;
let _storageFn: ((e: StorageEvent) => void) | null = null;
let _started = false;

function hasWindow(): boolean {
  return typeof window !== "undefined";
}

function deliver(msg: unknown): void {
  if (!msg || typeof msg !== "object") return;
  const m = msg as Partial<LocalWriteMessage>;
  if (typeof m.recordKey !== "string" || typeof m.rev !== "number") return;
  // Snapshot: a handler may unsubscribe itself while we iterate.
  for (const fn of [..._handlers]) {
    try {
      fn({ recordKey: m.recordKey, rev: m.rev });
    } catch {
      // A broken listener must not take down the others, or the channel.
    }
  }
}

function start(): void {
  if (_started || !hasWindow()) return;
  _started = true;

  if ("BroadcastChannel" in window) {
    try {
      _channel = new BroadcastChannel(CHANNEL_NAME);
      // BroadcastChannel never delivers to the posting context, so there is no
      // echo to suppress.
      _channel.onmessage = (e) => deliver(e.data);
      return;
    } catch {
      _channel = null; // fall through to the storage fallback
    }
  }

  // Fallback for engines without BroadcastChannel. `storage` fires only in
  // OTHER tabs of the same origin, which is exactly the delivery we want.
  _storageFn = (e: StorageEvent) => {
    if (e.key !== PING_KEY || !e.newValue) return;
    try {
      deliver(JSON.parse(e.newValue));
    } catch {
      // Someone else's value in our key; ignore it.
    }
  };
  window.addEventListener("storage", _storageFn);
}

/** Tell other tabs that `recordKey` now holds revision `rev`. */
export function publishLocalWrite(msg: LocalWriteMessage): void {
  if (!hasWindow()) return;
  start();
  if (_channel) {
    try {
      _channel.postMessage(msg);
      return;
    } catch {
      // Channel closed under us; fall through so the write is still announced.
    }
  }
  try {
    // The value must differ every time or no `storage` event fires.
    localStorage.setItem(PING_KEY, JSON.stringify({ ...msg, at: Date.now() }));
  } catch {
    // localStorage unavailable (private mode, quota) — non-fatal: the local
    // merge in writeDB still keeps the data correct, only liveness is lost.
  }
}

/** Subscribe to other tabs' writes. Returns an unsubscribe function. */
export function onLocalWrite(fn: Handler): () => void {
  if (!hasWindow()) return () => {};
  start();
  _handlers.add(fn);
  return () => {
    _handlers.delete(fn);
    if (_handlers.size === 0) stop();
  };
}

function stop(): void {
  _channel?.close();
  _channel = null;
  if (_storageFn) window.removeEventListener("storage", _storageFn);
  _storageFn = null;
  _started = false;
}
