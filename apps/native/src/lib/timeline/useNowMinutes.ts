import { useEffect, useState } from 'react';

function getCurrentMinutes(): number {
  const now = new Date();
  return now.getHours() * 60 + now.getMinutes();
}

/** Native port of lib/timeline/useNowMinutes.ts — minutes-from-midnight, refreshed on an interval. */
export function useNowMinutes(intervalMs = 30_000): number {
  const [nowMinutes, setNowMinutes] = useState(getCurrentMinutes);

  useEffect(() => {
    const id = setInterval(() => setNowMinutes(getCurrentMinutes()), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);

  return nowMinutes;
}
