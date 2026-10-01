import { storage } from './mmkv';

export type ThemePreference = 'light' | 'dark' | 'system';

const KEY = 'theme-preference';

export function getStoredThemePreference(): ThemePreference {
  const stored = storage.getString(KEY);
  return stored === 'light' || stored === 'dark' || stored === 'system' ? stored : 'system';
}

export function setStoredThemePreference(pref: ThemePreference): void {
  storage.set(KEY, pref);
}
