import { createContext, useContext, useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore, type ReactNode } from 'react';
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
import { TrueSheet } from '@lodev09/react-native-true-sheet';
import { useColorScheme } from 'nativewind';
import { ModalNestingContext, useModalTurn } from '../../lib/modalTurn';
import { SHEET_BG, SHEET_BG_CLASS } from './surfaces';

/**
 * Native port of components/ui/BottomSheet.tsx's mobile branch: a panel that
 * springs up from the bottom over a dimmed backdrop, with a drag handle, a
 * max height that stops short of the status bar, keyboard avoidance (the
 * web's visualViewport tracking), backdrop-tap and hardware-back to close
 * (the web's Escape), and the safe-area inset under the content.
 *
 * On iOS it is the system sheet itself (UISheetPresentationController, via
 * TrueSheet): sized to its content, the native grabber and swipe-to-dismiss,
 * the page behind receding, and on iOS 26 the floating liquid-glass sheet the
 * OS draws for every app. Android keeps the RN Modal + Animated panel below,
 * whose spring matches the web's MOBILE_SPRING feel.
 *
 * `scroll={false}` hands the caller the panel body as a plain View, for sheets
 * that manage their own scrolling (a long list with a pinned footer).
 *
 * `footer` pins the sheet's primary action under the scrolling body. On iOS
 * it is TrueSheet's own footer, which rides on top of the keyboard; with
 * `fullHeight` the body is TrueSheet's pinned scroll view too, which scrolls
 * the focused field into view above the keyboard and that footer.
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
  /** Pinned under the body and kept above the keyboard (the primary action). */
  footer?: ReactNode;
  /** Called once the sheet is fully up — the moment to focus its first field. */
  onPresented?: () => void;
  /**
   * Called once the sheet has finished leaving the screen. An action that
   * unmounts the sheet's own owner (deleting the note whose editor holds it)
   * belongs here rather than before the close: an iOS sheet whose component
   * unmounts mid-presentation is never told to go, and stays on screen.
   */
  onDismissed?: () => void;
}

export default function BottomSheet(props: BottomSheetProps) {
  const nested = useContext(ModalNestingContext);
  const overlays = useContext(SheetOverlayContext);
  // Inside a native iOS sheet, a sheet opened from its content (a picker, a
  // confirm) is drawn as a panel within that sheet. Anything presented on top
  // of a TrueSheet — another TrueSheet or an RN Modal — leaves it deaf to
  // taps once it closes, so nothing is ever presented over one.
  if (overlays) return <InSheetPanel {...props} store={overlays} />;
  // Only a top-level sheet is the native one; a sheet nested in an RN Modal
  // sheet (Android, or the panel above) stays an RN Modal.
  return Platform.OS === 'ios' && !nested ? <IOSSheet {...props} /> : <ModalSheet {...props} />;
}

/**
 * The panels open inside one native sheet. An external store rather than
 * React state, so a panel re-rendering only re-renders the host that draws
 * it — never the sheet content it was rendered from (which would re-render
 * the panel, which would update the store, and so on).
 */
function createOverlayStore() {
  const panels = new Map<symbol, ReactNode>();
  const listeners = new Set<() => void>();
  let snapshot: ReactNode[] = [];
  return {
    set(id: symbol, node: ReactNode | null) {
      if (node === null) {
        if (!panels.delete(id)) return;
      } else panels.set(id, node);
      snapshot = Array.from(panels.values());
      listeners.forEach((l) => l());
    },
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    get: () => snapshot,
  };
}
type OverlayStore = ReturnType<typeof createOverlayStore>;

let nextPanelKey = 0;

const SheetOverlayContext = createContext<OverlayStore | null>(null);

/** Height the sheet grows to while a panel is open, so a short sheet can hold a calendar. */
const PANEL_MIN_HEIGHT = 500;

function OverlayHost({ store, onActive }: { store: OverlayStore; onActive: (active: boolean) => void }) {
  const panels = useSyncExternalStore(store.subscribe, store.get);
  useEffect(() => onActive(panels.length > 0), [panels.length, onActive]);
  return <>{panels}</>;
}

function InSheetPanel({ open, onClose, onDismissed, children, footer, store }: BottomSheetProps & { store: OverlayStore }) {
  const id = useRef(Symbol('panel')).current;
  // A panel has no exit animation, so it is gone the moment it closes.
  const wasOpen = useRef(open);
  useEffect(() => {
    if (wasOpen.current && !open) onDismissed?.();
    wasOpen.current = open;
  }, [open, onDismissed]);
  const key = useRef(`panel-${nextPanelKey++}`).current;
  const insets = useSafeAreaInsets();
  const node = open ? (
    <View key={key} style={StyleSheet.absoluteFill} className="justify-end">
      <Pressable accessibilityRole="button" accessibilityLabel="Close" onPress={onClose} style={StyleSheet.absoluteFill} className="bg-black/25" />
      <View accessibilityViewIsModal className={`max-h-full rounded-t-[28px] pt-2 ${SHEET_BG_CLASS}`}>
        <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingBottom: footer ? 0 : insets.bottom }}>
          <ModalNestingContext.Provider value>{children}</ModalNestingContext.Provider>
        </ScrollView>
        {footer && (
          <View className="border-t border-neutral-200 px-5 pt-3 dark:border-white/[0.08]" style={{ paddingBottom: Math.max(12, insets.bottom) }}>
            <ModalNestingContext.Provider value>{footer}</ModalNestingContext.Provider>
          </View>
        )}
      </View>
    </View>
  ) : null;
  // Re-published on every render so the panel shows the caller's latest state.
  useLayoutEffect(() => {
    store.set(id, node);
  });
  useEffect(() => () => store.set(id, null), [id, store]);
  return null;
}

/** How long UIKit's sheet dismissal runs, during which the next modal waits. */
const IOS_DISMISS_MS = 350;

function IOSSheet({ open, onClose, onDismissed, children, maxHeight, className = '', scroll = true, fullHeight = false, footer, onPresented }: BottomSheetProps) {
  const sheet = useRef<TrueSheet>(null);
  const insets = useSafeAreaInsets();
  const { colorScheme } = useColorScheme();
  const screenHeight = Dimensions.get('window').height;
  // Mounted from the moment it's wanted until UIKit reports it gone, so the
  // modal queue (lib/modalTurn) holds the next one through the dismissal.
  const [mounted, setMounted] = useState(open);
  const turn = useModalTurn(mounted, IOS_DISMISS_MS);
  const presented = useRef(false);
  // Set when the caller closes it, so a swipe-down can be told apart.
  const closing = useRef(false);
  const [overlays] = useState(createOverlayStore);
  const [panelOpen, setPanelOpen] = useState(false);
  // The footer floats over the body, so the body ends that much short of it.
  const [footerHeight, setFooterHeight] = useState(0);
  // A full-height sheet with a scrolling body hands it to TrueSheet to pin:
  // only a pinned scroll view is scrolled to the focused field over the keyboard.
  const pinned = fullHeight && scroll;

  // Safety net for an owner that unmounts while the sheet is up: the native
  // view is recycled rather than destroyed, and only destruction dismisses
  // it, so it would stay on screen with nothing behind it.
  const instance = useRef<TrueSheet | null>(null);
  useEffect(() => {
    if (sheet.current) instance.current = sheet.current;
  });
  useLayoutEffect(
    () => () => {
      if (presented.current) void instance.current?.dismiss();
    },
    [],
  );

  useEffect(() => {
    if (open) {
      closing.current = false;
      setMounted(true);
    } else if (presented.current) {
      closing.current = true;
      sheet.current?.dismiss();
    } else {
      setMounted(false);
    }
  }, [open]);

  useEffect(() => {
    if (open && mounted && turn && !presented.current) sheet.current?.present();
  }, [open, mounted, turn]);

  if (!mounted || !turn) return null;

  const body = pinned ? (
    <ScrollView keyboardShouldPersistTaps="handled" className={`flex-1 ${className}`} contentContainerStyle={{ paddingBottom: footerHeight }}>
      {children}
    </ScrollView>
  ) : scroll ? (
    // Not TrueSheet's `scrollable` for a sheet sized to its content, which
    // pins the ScrollView to the full sheet and so defeats the 'auto' detent:
    // a ScrollView capped at the sheet's largest size measures to its
    // content, and scrolls past it.
    // No automaticallyAdjustKeyboardInsets: UIKit already lifts the whole
    // sheet above the keyboard, and adjusting here too scrolled the content
    // up by a second keyboard's height, hiding the title and the field.
    <ScrollView
      keyboardShouldPersistTaps="handled"
      className={className}
      style={{ maxHeight: maxHeight ?? screenHeight - insets.top - 24 }}
      contentContainerStyle={footer ? { paddingBottom: footerHeight } : undefined}
    >
      {children}
    </ScrollView>
  ) : (
    <View className={`${fullHeight ? 'flex-1' : ''} ${className}`}>{children}</View>
  );

  return (
    <TrueSheet
      ref={sheet}
      // Short sheets fit their content; a long one can still be pulled to
      // full height, as the system's own sheets allow.
      detents={fullHeight ? [1] : ['auto', 1]}
      // Solid, not the see-through glass sheet: the content sits on an opaque
      // gray, and the glass is kept for the controls on top of it.
      backgroundColor={colorScheme === 'dark' ? SHEET_BG.dark : SHEET_BG.light}
      grabber
      maxContentHeight={maxHeight}
      scrollable={pinned}
      footer={
        // Hidden while a panel (a time picker, a confirm) is open in the
        // sheet: the footer is drawn over the content, so it covered the
        // panel's own Done button.
        footer && !panelOpen ? (
          // Rendered by TrueSheet outside the content, so it gets the content's
          // contexts again: a sheet opened from it stays a panel in this one.
          <ModalNestingContext.Provider value>
            <SheetOverlayContext.Provider value={overlays}>
              <View
                onLayout={(e) => setFooterHeight(e.nativeEvent.layout.height)}
                className={`border-t border-neutral-200 px-5 pt-3 dark:border-white/[0.08] ${SHEET_BG_CLASS}`}
                style={{ paddingBottom: Math.max(12, insets.bottom) }}
              >
                {footer}
              </View>
            </SheetOverlayContext.Provider>
          </ModalNestingContext.Provider>
        ) : undefined
      }
      // A field scrolled into view above the keyboard clears the footer too.
      scrollableOptions={pinned ? { keyboardScrollOffset: footerHeight } : undefined}
      // Over the keyboard, the safe-area padding under the action isn't needed.
      footerOptions={{ keyboardOffset: -Math.max(0, Math.max(12, insets.bottom) - 12) }}
      onDidPresent={() => {
        presented.current = true;
        onPresented?.();
      }}
      onDidDismiss={() => {
        presented.current = false;
        setMounted(false);
        // Swiped away rather than closed by the caller: tell the caller.
        if (!closing.current) onClose();
        closing.current = false;
        onDismissed?.();
      }}
    >
      <ModalNestingContext.Provider value>
        <SheetOverlayContext.Provider value={overlays}>
          <View style={[fullHeight ? styles.fill : null, panelOpen ? { minHeight: PANEL_MIN_HEIGHT } : null]}>
            {body}
            <OverlayHost store={overlays} onActive={setPanelOpen} />
          </View>
        </SheetOverlayContext.Provider>
      </ModalNestingContext.Provider>
    </TrueSheet>
  );
}

function ModalSheet({
  open,
  onClose,
  onDismissed,
  children,
  maxHeight,
  className = '',
  backdropClassName,
  scroll = true,
  fullHeight = false,
  footer,
  onPresented,
}: BottomSheetProps) {
  const insets = useSafeAreaInsets();
  const screenHeight = Dimensions.get('window').height;
  const [visible, setVisible] = useState(open);
  const progress = useRef(new Animated.Value(open ? 1 : 0)).current;
  // Waits its turn behind any other root-level modal on iOS (lib/modalTurn).
  const turn = useModalTurn(visible, 60);

  useEffect(() => {
    if (open) {
      setVisible(true);
    } else if (visible) {
      Animated.timing(progress, { toValue: 0, duration: 200, useNativeDriver: true }).start(({ finished }) => {
        if (finished) {
          setVisible(false);
          onDismissed?.();
        }
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  useEffect(() => {
    if (open && turn)
      Animated.spring(progress, { toValue: 1, stiffness: 380, damping: 30, mass: 0.9, useNativeDriver: true }).start(({ finished }) => {
        if (finished) onPresented?.();
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, turn, progress]);

  if (!visible || !turn) return null;

  const panelMax = maxHeight ?? screenHeight - insets.top - 12;
  const translateY = progress.interpolate({ inputRange: [0, 1], outputRange: [screenHeight, 0] });

  return (
    <Modal visible transparent animationType="none" onRequestClose={onClose} statusBarTranslucent>
      <ModalNestingContext.Provider value>
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
              className={`w-full overflow-hidden rounded-t-[28px] border-t border-neutral-200 dark:border-white/[0.08] ${SHEET_BG_CLASS} ${
                fullHeight ? 'flex-1' : ''
              } ${className}`}
              style={{ maxHeight: panelMax }}
            >
              {/* Drag handle */}
              <View className={`items-center pb-1 pt-3 ${SHEET_BG_CLASS}`}>
                <View className="h-1 w-10 rounded-full bg-neutral-300 dark:bg-white/20" />
              </View>
              {scroll ? (
                <ScrollView
                  keyboardShouldPersistTaps="handled"
                  contentContainerStyle={{ paddingBottom: footer ? 0 : insets.bottom }}
                  style={fullHeight ? styles.fill : footer ? styles.shrink : undefined}
                >
                  {children}
                </ScrollView>
              ) : (
                <View style={[fullHeight ? styles.fill : null, { paddingBottom: footer ? 0 : insets.bottom }]}>{children}</View>
              )}
              {footer && (
                <View
                  className="border-t border-neutral-200 px-5 pt-3 dark:border-white/[0.08]"
                  style={{ paddingBottom: Math.max(12, insets.bottom) }}
                >
                  {footer}
                </View>
              )}
            </View>
          </Animated.View>
        </View>
      </KeyboardAvoidingView>
      </ModalNestingContext.Provider>
    </Modal>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  shrink: { flexShrink: 1 },
});
