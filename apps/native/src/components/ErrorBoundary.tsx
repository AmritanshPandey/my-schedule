import { Component, type ErrorInfo, type ReactNode } from 'react';
import { Pressable, View } from 'react-native';
import { logError } from '../lib/errorLog';
import { Text } from './ui/Text';

/**
 * Native port of components/ErrorBoundary.tsx. Section mode isolates a
 * feature area (a tab, the notes screen) so its crash can't blank the whole
 * app, with a retry-in-place fallback. The root boundary has no stale-chunk
 * recovery to do — a native bundle ships whole — so its "Try again" simply
 * re-mounts the tree.
 */
interface Props {
  children: ReactNode;
  /** Label used in logs, e.g. "Timeline", "Notes". */
  name?: string;
  /** Section mode: a compact, retry-in-place fallback. */
  section?: boolean;
}

interface State {
  hasError: boolean;
  message: string;
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false, message: '' };

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, message: error.message };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    logError(`react:${this.props.name ?? (this.props.section ? 'section' : 'root')}`, error, info.componentStack ?? undefined);
  }

  private reset = () => this.setState({ hasError: false, message: '' });

  render() {
    if (!this.state.hasError) return this.props.children;

    if (this.props.section) {
      return (
        <View className="items-center justify-center gap-3 rounded-2xl border border-neutral-200 bg-white p-6 dark:border-white/[0.08] dark:bg-neutral-900">
          <Text className="text-center text-[13px] font-semibold text-neutral-700 dark:text-neutral-200">
            {this.props.name ? `${this.props.name} hit a problem` : 'This section hit a problem'}
          </Text>
          {!!this.state.message && (
            <Text selectable className="max-w-full text-center font-mono text-[11px] text-neutral-500 dark:text-neutral-400">
              {this.state.message}
            </Text>
          )}
          <Pressable
            accessibilityRole="button"
            onPress={this.reset}
            className="min-h-[44px] justify-center rounded-xl border border-neutral-200 bg-neutral-50 px-4 active:bg-neutral-100 dark:border-white/[0.08] dark:bg-white/[0.04] dark:active:bg-white/[0.08]"
          >
            <Text className="text-[12px] font-semibold text-neutral-700 dark:text-white">Try again</Text>
          </Pressable>
        </View>
      );
    }

    return (
      <View className="flex-1 items-center justify-center gap-5 bg-[#F7F7F5] p-8 dark:bg-neutral-950">
        <View className="w-full max-w-sm rounded-2xl border border-neutral-200 bg-white p-8 dark:border-white/[0.08] dark:bg-neutral-900">
          <Text accessibilityRole="header" className="mb-1 text-center text-[16px] font-semibold text-neutral-900 dark:text-white">
            Something went wrong
          </Text>
          <Text selectable className="mb-5 text-center font-mono text-[12px] text-neutral-500 dark:text-neutral-400">
            {this.state.message}
          </Text>
          <Pressable
            accessibilityRole="button"
            onPress={this.reset}
            className="min-h-[44px] w-full items-center justify-center rounded-xl border border-neutral-200 bg-neutral-50 px-4 active:bg-neutral-100 dark:border-white/[0.08] dark:bg-white/[0.04] dark:active:bg-white/[0.08]"
          >
            <Text className="text-[13px] font-semibold text-neutral-700 dark:text-white">Try again</Text>
          </Pressable>
        </View>
      </View>
    );
  }
}

export default ErrorBoundary;
