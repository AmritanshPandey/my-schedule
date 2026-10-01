/**
 * PlanR — native entry point.
 *
 * @format
 */

import './global.css';
import { useEffect } from 'react';
import { LogBox, StatusBar, Text, TextInput } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { enableScreens } from 'react-native-screens';
import { useColorScheme } from 'nativewind';
import RootNavigator from './src/navigation/RootNavigator';
import { getStoredThemePreference } from './src/storage/themeStore';
import { AuthProvider } from './src/contexts/AuthProvider';

enableScreens();

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

// Upstream deprecation notice (from a nav/screens dependency's internals, not
// our code) — its own LogBox banner sits above the RN view hierarchy and was
// eating taps on the bottom nav underneath it.
LogBox.ignoreLogs(['ImageBackground is deprecated']);

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
      <AuthProvider>
        <RootNavigator />
      </AuthProvider>
    </SafeAreaProvider>
  );
}

export default App;
