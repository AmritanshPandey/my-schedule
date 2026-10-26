/**
 * @format
 */

import { AppRegistry } from 'react-native';
import App from './App';
import { name as appName } from './app.json';
import { registerReminderBackgroundHandler } from './src/lib/reminders';

// Snooze / Dismiss pressed on a reminder while PlanR is closed — must be
// registered before the app component.
registerReminderBackgroundHandler();

AppRegistry.registerComponent(appName, () => App);
