import { useEffect, useRef, useState, type ReactNode } from 'react';
import {
  Animated,
  Dimensions,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

/**
 * Native port of components/ui/BottomSheet.tsx's mobile branch: a panel that
 * springs up from the bottom over a dimmed backdrop, with a drag handle, a
 * max height that stops short of the status bar, keyboard avoidance (the
 * web's visualViewport tracking), backdrop-tap and hardware-back to close
 * (the web's Escape), and the safe-area inset under the content.
 *
 * Built on RN's Modal + Animated rather than a sheet library so no new native
 * module is needed. The panel's spring matches the web's MOBILE_SPRING feel.
 *
 * `scroll={false}` hands the caller the panel body as a plain View, for sheets
 * that manage their own scrolling (a long list with a pinned footer).
 */
interface BottomSheetProps {
  open: boolean;
  onClose: () => void;
  children: ReactNode;
  /** Max panel height as a fraction of the screen (default: all but the status bar + 12px). */
  maxHeight?: number;
  className?: string;
  backdropClassName?: string;
  scroll?: boolean;
  /** Full-height panel — the web's "page" presentation of a sheet. */
  fullHeight?: boolean;
}

export default function BottomSheet({
  open,
  onClose,
  children,
  maxHeight,
  className = '',
  backdropClassName,
  scroll = true,
  fullHeight = false,
}: BottomSheetProps) {
  const insets = useSafeAreaInsets();
  const screenHeight = Dimensions.get('window').height;
  const [visible, setVisible] = useState(open);
  const progress = useRef(new Animated.Value(open ? 1 : 0)).current;

  useEffect(() => {
    if (open) {
      setVisible(true);
      Animated.spring(progress, { toValue: 1, stiffness: 380, damping: 30, mass: 0.9, useNativeDriver: true }).start();
    } else if (visible) {
      Animated.timing(progress, { toValue: 0, duration: 200, useNativeDriver: true }).start(({ finished }) => {
        if (finished) setVisible(false);
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  if (!visible) return null;

  const panelMax = maxHeight ?? screenHeight - insets.top - 12;
  const translateY = progress.interpolate({ inputRange: [0, 1], outputRange: [screenHeight, 0] });

  return (
    <Modal visible transparent animationType="none" onRequestClose={onClose} statusBarTranslucent>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.fill}>
        <View style={styles.fill} className="justify-end">
          <Animated.View style={[StyleSheet.absoluteFill, { opacity: progress }]}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Close"
              onPress={onClose}
              style={StyleSheet.absoluteFill}
              className={backdropClassName ?? 'bg-black/35'}
            />
          </Animated.View>
          <Animated.View
            accessibilityViewIsModal
            style={{ transform: [{ translateY }], maxHeight: panelMax, height: fullHeight ? panelMax : undefined }}
          >
            <View
              className={`w-full overflow-hidden rounded-t-2xl border-t border-neutral-200 bg-white dark:border-white/[0.08] dark:bg-neutral-900 ${
                fullHeight ? 'flex-1' : ''
              } ${className}`}
              style={{ maxHeight: panelMax }}
            >
              {/* Drag handle */}
              <View className="items-center rounded-t-2xl bg-white pb-1 pt-3 dark:bg-neutral-900">
                <View className="h-1 w-10 rounded-full bg-neutral-300 dark:bg-white/20" />
              </View>
              {scroll ? (
                <ScrollView
                  keyboardShouldPersistTaps="handled"
                  contentContainerStyle={{ paddingBottom: insets.bottom }}
                  style={fullHeight ? styles.fill : undefined}
                >
                  {children}
                </ScrollView>
              ) : (
                <View style={[fullHeight ? styles.fill : null, { paddingBottom: insets.bottom }]}>{children}</View>
              )}
            </View>
          </Animated.View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
});
