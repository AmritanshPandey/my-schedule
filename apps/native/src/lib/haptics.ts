import { Platform, Vibration } from 'react-native';

/**
 * Native port of lib/haptics.ts. The web version calls navigator.vibrate,
 * which iOS Safari doesn't implement — so on iPhone the PWA's haptics are a
 * silent no-op, and on Android they're a short buzz. This keeps exactly that:
 * iOS's Vibration API ignores durations (every call is a full ~400ms buzz,
 * far heavier than a tap acknowledgement), so it stays a no-op there too.
 */
export function haptic(style: 'light' | 'medium' | 'heavy' = 'light') {
  try {
    if (Platform.OS === 'android') {
      Vibration.vibrate(style === 'light' ? 6 : style === 'medium' ? 14 : 28);
    }
  } catch {}
}
