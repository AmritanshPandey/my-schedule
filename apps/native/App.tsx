/**
 * PlanR — native entry point.
 *
 * @format
 */

import { StatusBar, StyleSheet, Text, useColorScheme, View } from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';

function App() {
  const isDarkMode = useColorScheme() === 'dark';

  return (
    <SafeAreaProvider>
      <StatusBar barStyle={isDarkMode ? 'light-content' : 'dark-content'} />
      <SafeAreaView style={[styles.container, isDarkMode ? styles.dark : styles.light]}>
        <Text style={[styles.title, isDarkMode ? styles.textDark : styles.textLight]}>
          PlanR
        </Text>
      </SafeAreaView>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  light: {
    backgroundColor: '#FFFFFF',
  },
  dark: {
    backgroundColor: '#0A0A0A',
  },
  title: {
    fontSize: 20,
    fontWeight: '800',
  },
  textLight: {
    color: '#0A0A0A',
  },
  textDark: {
    color: '#FFFFFF',
  },
});

export default App;
