/**
 * PlanR — native entry point.
 *
 * @format
 */

import './global.css';
import { useEffect } from 'react';
import { StatusBar, Text, TextInput } from 'react-native';
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

// Applies the web app's actual font (app/globals.css's --font-sans —
// "Avenir Next", an iOS/macOS system font, no linking needed) everywhere,
// the same way CSS's cascade would on web. RN has no font-family
// inheritance from a View down through arbitrary descendants — tailwind's
// `fontFamily.sans` (tailwind.config.js) only reaches elements that
// explicitly carry a `font-*` class — so instead this patches the default
// props of Text/TextInput themselves, which every rendered string ultimately
// goes through regardless of how its style was authored.
(Text as unknown as { defaultProps: { style?: unknown } }).defaultProps = {
  ...((Text as unknown as { defaultProps?: { style?: unknown } }).defaultProps ?? {}),
  style: [{ fontFamily: 'Avenir Next' }, (Text as unknown as { defaultProps?: { style?: unknown } }).defaultProps?.style],
};
(TextInput as unknown as { defaultProps: { style?: unknown } }).defaultProps = {
  ...((TextInput as unknown as { defaultProps?: { style?: unknown } }).defaultProps ?? {}),
  style: [{ fontFamily: 'Avenir Next' }, (TextInput as unknown as { defaultProps?: { style?: unknown } }).defaultProps?.style],
};

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
