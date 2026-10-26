/**
 * PlanR — native entry point.
 *
 * @format
 */

import './global.css';
import { useEffect } from 'react';
import { StatusBar } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { useColorScheme } from 'nativewind';
import IOSScheduleApp from './src/components/ios/IOSScheduleApp';
import { ErrorBoundary } from './src/components/ErrorBoundary';
import { getStoredThemePreference } from './src/storage/themeStore';
import { AuthProvider } from './src/contexts/AuthProvider';
import { installGlobalErrorHandlers } from './src/lib/errorLog';

// Uncaught JS errors and unhandled rejections into the on-device error log
// (chained — RN's own handling is unchanged), as the web does at startup.
installGlobalErrorHandlers();

// The web app's font ("Avenir Next", app/globals.css) is applied by
// src/components/ui/Text.tsx, which every string in the app renders through:
// React 19 ignores `defaultProps` on function components such as RN's Text,
// so patching its defaults here would have no effect.

function App() {
  const { colorScheme, setColorScheme } = useColorScheme();

  // Apply the user's saved theme override (light/dark/system) on launch —
  // nativewind otherwise starts from the system scheme every cold start.
  // Guarded: nativewind's runtime CSS interop isn't initialized under Jest
  // (no Metro/babel CSS pipeline there), where this throws.
  useEffect(() => {
    try {
      setColorScheme(getStoredThemePreference());
    } catch {
      // no-op outside a real nativewind runtime (e.g. Jest)
    }
  }, [setColorScheme]);

  return (
    <SafeAreaProvider>
      <StatusBar barStyle={colorScheme === 'dark' ? 'light-content' : 'dark-content'} />
      <ErrorBoundary>
        <AuthProvider>
          <IOSScheduleApp />
        </AuthProvider>
      </ErrorBoundary>
    </SafeAreaProvider>
  );
}

export default App;
