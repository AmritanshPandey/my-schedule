/**
 * Build identity for the native app — the counterpart of
 * packages/core/lib/buildInfo.ts, which reads NEXT_PUBLIC_* values that only
 * the Next.js build injects (they're always undefined in a Metro bundle).
 * The version is apps/native/package.json's, which is what Xcode/Gradle ship.
 */
import { Platform } from 'react-native';
import nativePackage from '../../package.json';

export const APP_VERSION: string = nativePackage.version;
export const BUILD_ID = `native-${Platform.OS}`;

/** "Version 0.0.1 · iOS" — shown in the Settings footer, like the web's versionLabel(). */
export function versionLabel(): string {
  return `Version ${APP_VERSION} · ${Platform.OS === 'ios' ? 'iOS' : Platform.OS === 'android' ? 'Android' : Platform.OS}`;
}
