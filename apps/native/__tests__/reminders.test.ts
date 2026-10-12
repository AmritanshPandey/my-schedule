/**
 * @format
 */

import { TurboModuleRegistry } from 'react-native';
import { emptySchedule } from '@planr/core/lib/scheduleMigrate';
import type { Schedule } from '@planr/core/lib/scheduleTypes';
import {
  armReminders,
  buildReminderNotification,
  buildReminderTrigger,
  cancelAllReminders,
  registerReminderBackgroundHandler,
  sendTestNotification,
  setReminderDelivery,
  setReminderSettings,
  snoozeIdFor,
} from '../src/lib/reminders';
import { logError } from '../src/lib/errorLog';

// The RN Jest preset reports Platform.OS === 'ios'.

jest.mock('../src/lib/errorLog', () => ({ logError: jest.fn() }));

/**
 * The library's native side, faked: an in-memory OS that runs every
 * notification, trigger, channel and category through the library's own
 * validators — the same checks the real module makes before scheduling.
 */
jest.mock('react-native-notify-kit', () => {
  const actual = (path: string) => jest.requireActual(`react-native-notify-kit/dist/${path}`);
  const validateAndroid = actual('validators/validateAndroidNotification').default;
  const validateIOS = actual('validators/validateIOSNotification').default;
  const validateTrigger = actual('validators/validateTrigger').default;
  const validateChannel = actual('validators/validateAndroidChannel').default;
  const validateCategory = actual('validators/validateIOSCategory').default;
  const { AuthorizationStatus } = actual('types/Notification');
  const { AndroidNotificationSetting } = actual('types/NotificationAndroid');

  const os = {
    triggers: new Map<string, { notification: any; trigger: any }>(),
    displayed: new Map<string, any>(),
    channels: new Map<string, any>(),
    categories: [] as any[],
    background: null as any,
    settings: { authorizationStatus: AuthorizationStatus.AUTHORIZED, android: { alarm: AndroidNotificationSetting.ENABLED } },
  };
  const validate = (n: any) => {
    validateAndroid(n.android);
    validateIOS(n.ios);
  };
  const notifee = {
    getNotificationSettings: jest.fn(async () => os.settings),
    getTriggerNotificationIds: jest.fn(async () => [...os.triggers.keys()]),
    cancelTriggerNotifications: jest.fn(async (ids: string[]) => ids.forEach((id) => os.triggers.delete(id))),
    createTriggerNotification: jest.fn(async (notification: any, trigger: any) => {
      validate(notification);
      validateTrigger(trigger);
      os.triggers.set(notification.id, { notification, trigger });
      return notification.id;
    }),
    displayNotification: jest.fn(async (notification: any) => {
      validate(notification);
      os.displayed.set(notification.id, notification);
      return notification.id;
    }),
    cancelDisplayedNotification: jest.fn(async (id: string) => {
      os.displayed.delete(id);
    }),
    createChannel: jest.fn(async (channel: any) => {
      validateChannel(channel);
      os.channels.set(channel.id, channel);
      return channel.id;
    }),
    deleteChannel: jest.fn(async (id: string) => {
      os.channels.delete(id);
    }),
    setNotificationCategories: jest.fn(async (categories: any[]) => {
      categories.forEach(validateCategory);
      os.categories = categories;
    }),
    onBackgroundEvent: jest.fn((fn: any) => {
      os.background = fn;
    }),
    onForegroundEvent: jest.fn(() => () => {}),
  };
  return {
    __esModule: true,
    ...actual('types/Notification'),
    ...actual('types/NotificationAndroid'),
    ...actual('types/NotificationIOS'),
    ...actual('types/Trigger'),
    default: notifee,
    __os: os,
  };
});

const kit = jest.requireMock('react-native-notify-kit');
const os = kit.__os;
const notifee = kit.default;
const { AlarmType, AndroidCategory, EventType, TriggerType } = kit;

const NOW = new Date('2026-10-12T06:00:00').getTime();
const MINUTE = 60_000;

function scheduleWith(times: string[]): Schedule {
  return { ...emptySchedule(), rituals: times.map((time, i) => ({ id: `r${i}`, title: `Routine ${i}`, time })) };
}

beforeAll(() => {
  const real = TurboModuleRegistry.get;
  jest.spyOn(TurboModuleRegistry, 'get').mockImplementation((name: string) => (name === 'NotifeeApiModule' ? ({} as never) : real(name)));
  registerReminderBackgroundHandler();
});

beforeEach(async () => {
  jest.useFakeTimers({ now: NOW, doNotFake: ['nextTick', 'queueMicrotask', 'setImmediate'] });
  setReminderSettings({ enabled: true, tasks: true, rituals: true, streakNudge: false });
  setReminderDelivery({ alarmMode: false });
  await cancelAllReminders();
  os.displayed.clear();
  jest.clearAllMocks();
});

afterEach(() => {
  expect(logError).not.toHaveBeenCalled();
  jest.useRealTimers();
});

test('a reminder plays a sound and can be snoozed', () => {
  const n = buildReminderNotification(kit, { id: 'planr-ritual-r0-2026-10-12', title: 'Stretch', body: 'Routine · 7:30 AM' }, false);
  expect(n.ios).toMatchObject({ sound: 'default', categoryId: 'planr-reminder', interruptionLevel: 'active' });
  expect(n.android).toMatchObject({ channelId: 'planr-reminders-sound', sound: 'default', loopSound: false, category: AndroidCategory.REMINDER });
  expect(n.android?.actions?.map((a) => a.pressAction.id)).toEqual(['snooze']);
  expect(buildReminderTrigger(kit, NOW + MINUTE, false)).toEqual({
    type: TriggerType.TIMESTAMP,
    timestamp: NOW + MINUTE,
    alarmManager: { type: AlarmType.SET_EXACT_AND_ALLOW_WHILE_IDLE },
  });
});

test('alarm mode rings until the reminder is snoozed or dismissed', () => {
  const n = buildReminderNotification(kit, { id: 'planr-ritual-r0-2026-10-12', title: 'Stretch', body: 'Routine · 7:30 AM' }, true);
  expect(n.ios).toMatchObject({ sound: 'default', interruptionLevel: 'timeSensitive' });
  expect(n.android).toMatchObject({ channelId: 'planr-alarms', loopSound: true, category: AndroidCategory.ALARM });
  expect(n.android?.actions?.map((a) => a.pressAction.id)).toEqual(['snooze', 'dismiss']);
  expect(buildReminderTrigger(kit, NOW + MINUTE, true).alarmManager).toEqual({ type: AlarmType.SET_ALARM_CLOCK });
});

test('arming hands the OS a week of reminders, and leaves an unchanged set alone', async () => {
  const schedule = scheduleWith(['07:30', '21:00']);
  await armReminders(schedule);
  // Two a day for today and the six days after.
  expect(os.triggers.size).toBe(14);
  expect(os.categories[0]).toMatchObject({ id: 'planr-reminder', actions: [{ id: 'snooze' }] });
  for (const { trigger } of os.triggers.values()) expect(trigger.timestamp).toBeGreaterThan(NOW);

  notifee.createTriggerNotification.mockClear();
  await armReminders(schedule);
  expect(notifee.createTriggerNotification).not.toHaveBeenCalled();

  setReminderDelivery({ alarmMode: true });
  await armReminders(schedule);
  expect(notifee.createTriggerNotification).toHaveBeenCalledTimes(14);
  for (const { notification, trigger } of os.triggers.values()) {
    expect(notification.android.loopSound).toBe(true);
    expect(trigger.alarmManager.type).toBe(AlarmType.SET_ALARM_CLOCK);
  }
});

test('granting exact-alarm access re-arms what was scheduled inexact', async () => {
  const schedule = scheduleWith(['07:30']);
  const { AndroidNotificationSetting } = kit;
  os.settings = { ...os.settings, android: { alarm: AndroidNotificationSetting.DISABLED } };
  await armReminders(schedule);
  notifee.createTriggerNotification.mockClear();
  os.settings = { ...os.settings, android: { alarm: AndroidNotificationSetting.ENABLED } };
  await armReminders(schedule);
  expect(notifee.createTriggerNotification).toHaveBeenCalledTimes(7);
});

test('iOS keeps the total under its 64-notification limit', async () => {
  await armReminders(scheduleWith(Array.from({ length: 12 }, (_, i) => `${String(8 + i).padStart(2, '0')}:00`)));
  expect(os.triggers.size).toBe(60);
});

test('Snooze brings the reminder back in ten minutes, and a re-arm keeps it', async () => {
  await armReminders(scheduleWith(['07:30']));
  const { notification } = os.triggers.get('planr-ritual-r0-2026-10-12');
  os.displayed.set(notification.id, notification);

  await os.background({ type: EventType.ACTION_PRESS, detail: { notification, pressAction: { id: 'snooze' } } });
  expect(os.displayed.has(notification.id)).toBe(false);
  const snoozed = os.triggers.get('planr-snooze-ritual-r0-2026-10-12');
  expect(snoozed.trigger.timestamp).toBe(NOW + 10 * MINUTE);
  expect(snoozed.notification).toMatchObject({ title: 'Routine 0', body: notification.body });

  // Rescheduling the routine re-arms everything else; the snooze stays.
  await armReminders(scheduleWith(['08:15']));
  expect(os.triggers.has('planr-snooze-ritual-r0-2026-10-12')).toBe(true);
  expect(os.triggers.get('planr-ritual-r0-2026-10-12').trigger.timestamp).toBe(new Date('2026-10-12T08:15:00').getTime());

  // Turning reminders off clears snoozes too.
  await cancelAllReminders();
  expect(os.triggers.size).toBe(0);
});

test('Dismiss clears the reminder without bringing it back', async () => {
  await armReminders(scheduleWith(['07:30']));
  const { notification } = os.triggers.get('planr-ritual-r0-2026-10-12');
  os.displayed.set(notification.id, notification);
  await os.background({ type: EventType.ACTION_PRESS, detail: { notification, pressAction: { id: 'dismiss' } } });
  expect(os.displayed.has(notification.id)).toBe(false);
  expect([...os.triggers.keys()].some((id) => id.startsWith('planr-snooze-'))).toBe(false);
});

test('snoozing a snoozed reminder reuses its ID', () => {
  expect(snoozeIdFor('planr-task-a-2026-10-12-0')).toBe('planr-snooze-task-a-2026-10-12-0');
  expect(snoozeIdFor('planr-snooze-task-a-2026-10-12-0')).toBe('planr-snooze-task-a-2026-10-12-0');
});

test('the test notification looks and sounds like a reminder', async () => {
  setReminderDelivery({ alarmMode: true });
  expect(await sendTestNotification()).toEqual({ ok: true });
  expect(os.displayed.get('planr-test').android).toMatchObject({ channelId: 'planr-alarms', loopSound: true });
});

test('Android: reminders get sound channels in place of the old silent one', async () => {
  await jest.isolateModulesAsync(async () => {
    const { Platform, TurboModuleRegistry: registry } = require('react-native');
    jest.replaceProperty(Platform, 'OS', 'android');
    jest.spyOn(registry, 'get').mockImplementation(() => ({}) as never);
    const androidKit = jest.requireMock('react-native-notify-kit');
    androidKit.__os.channels.set('planr-reminders', { id: 'planr-reminders', name: 'Reminders' });
    const android = require('../src/lib/reminders');
    android.setReminderSettings({ enabled: true, rituals: true });

    await android.armReminders(scheduleWith(['07:30']));
    const channels = androidKit.__os.channels;
    expect(channels.has('planr-reminders')).toBe(false);
    expect(channels.get('planr-reminders-sound')).toMatchObject({ sound: 'default', importance: androidKit.AndroidImportance.HIGH });
    expect(channels.get('planr-alarms')).toMatchObject({ sound: 'content://settings/system/alarm_alert' });
    // Android has room for far more than iOS's 64.
    await android.armReminders(scheduleWith(Array.from({ length: 12 }, (_, i) => `${String(8 + i).padStart(2, '0')}:00`)));
    expect(androidKit.__os.triggers.size).toBe(84);
  });
});
