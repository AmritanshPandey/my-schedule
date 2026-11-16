import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { HealthRun } from '@planr/core/lib/healthMatch';
import { toHealthRun, type WorkoutLike } from './healthRun';

/**
 * Apple Health, read-only: running workouts fill in planned run sessions
 * (core's applyHealthRuns does the matching). iOS only; the PWA has no Health.
 *
 * The library is required lazily so Android and tests never load the native
 * module, and a missing module reads as "not available" instead of a crash.
 */

const CONNECTED_KEY = 'planr-health-connected';
/** HKWorkoutActivityType.running. */
const RUNNING = 37;

type HealthKitModule = typeof import('@kingstinct/react-native-healthkit');

function kit(): HealthKitModule | null {
  if (Platform.OS !== 'ios') return null;
  try {
    return require('@kingstinct/react-native-healthkit') as HealthKitModule;
  } catch {
    return null;
  }
}

export function isHealthAvailable(): boolean {
  const hk = kit();
  try {
    return !!hk && hk.isHealthDataAvailable();
  } catch {
    return false;
  }
}

const listeners = new Set<(connected: boolean) => void>();

/** Called when Health is connected or disconnected here, so the app can sync straight away. */
export function onHealthConnectionChange(fn: (connected: boolean) => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export async function isHealthConnected(): Promise<boolean> {
  try {
    return (await AsyncStorage.getItem(CONNECTED_KEY)) === '1';
  } catch {
    return false;
  }
}

/** Ask for read access to workouts. HealthKit never says whether read access was granted, so a finished prompt counts as connected. */
export async function connectHealth(): Promise<boolean> {
  const hk = kit();
  if (!hk || !isHealthAvailable()) return false;
  try {
    await hk.requestAuthorization({ toRead: ['HKWorkoutTypeIdentifier'] });
    await AsyncStorage.setItem(CONNECTED_KEY, '1');
    listeners.forEach((fn) => fn(true));
    return true;
  } catch {
    return false;
  }
}

export async function disconnectHealth(): Promise<void> {
  try {
    await AsyncStorage.removeItem(CONNECTED_KEY);
  } catch {
    /* already gone */
  }
  listeners.forEach((fn) => fn(false));
}

/** Running workouts that started at or after `sinceMs`, newest last. */
export async function readRunsSince(sinceMs: number): Promise<HealthRun[]> {
  const hk = kit();
  if (!hk) return [];
  try {
    const workouts = await hk.queryWorkoutSamples({
      limit: 0,
      ascending: true,
      filter: { date: { startDate: new Date(sinceMs) }, workoutActivityType: RUNNING as never },
    });
    return workouts
      .map((w) => toHealthRun(w as unknown as WorkoutLike))
      .filter((r): r is HealthRun => r !== null);
  } catch {
    return [];
  }
}
