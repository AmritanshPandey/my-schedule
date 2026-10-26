import { MMKV } from 'react-native-mmkv';

/**
 * Single on-device key-value store for everything the native app persists
 * locally (theme preference, notes) until the real schedule sync layer
 * (packages/core's ScheduleStorage interface, per the RN plan) lands.
 */
export const storage = new MMKV({ id: 'planr' });
