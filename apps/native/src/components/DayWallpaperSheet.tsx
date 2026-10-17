import { useEffect, useMemo, useRef, useState } from 'react';
import { Dimensions, PixelRatio, Platform, Pressable, ScrollView, Share, View } from 'react-native';
import Svg, { Defs, G, Line, LinearGradient, RadialGradient, Rect, Stop, Text as SvgText } from 'react-native-svg';
import { IconCheck, IconRepeat, IconStar } from '@tabler/icons-react-native';
import type { DayKey, Schedule } from '@planr/core/lib/scheduleTypes';
import { isTaskScheduledOn, resolveOccurrence } from '@planr/core/lib/taskOccurrence';
import { ritualScheduledOnDate } from '@planr/core/lib/ritualRecurrence';
import { categoriesById, taskIdentity } from '@planr/core/lib/taskIdentity';
import { formatDisplayTime, parseTimeToMinutes } from '@planr/core/lib/timeUtils';
import { localISODate } from '@planr/core/lib/dateUtils';
import { haptic } from '../lib/haptics';
import BottomSheet from './ui/BottomSheet';
import SheetHeader from './ui/SheetHeader';
import Button, { BUTTON_TEXT } from './ui/Button';
import { Icon, type TablerIcon } from './ui/Icon';
import { Text } from './ui/Text';
import { SECTION_ICONS } from './SectionIcons';

const ICON_BY_NAME = new Map(SECTION_ICONS.map((entry) => [entry.name, entry.icon]));

/** lib/wallpaper.ts's WALLPAPER_GRADIENTS — the same four backgrounds. */
const WALLPAPER_GRADIENTS = [
  { id: 'forest', label: 'Forest', from: '#10382A', to: '#04130D' },
  { id: 'ink', label: 'Ink', from: '#171B1C', to: '#05070A' },
  { id: 'ocean', label: 'Ocean', from: '#0E3A46', to: '#041318' },
  { id: 'ember', label: 'Ember', from: '#3A2417', to: '#120905' },
] as const;

interface WallpaperItem {
  id: string;
  time: string;
  title: string;
  iconName: string;
  done?: boolean;
  minutes: number;
}

/** Portrait wallpaper size for this device (lib/wallpaper.ts's wallpaperSize). */
function wallpaperSize(): { width: number; height: number } {
  const { width, height } = Dimensions.get('screen');
  const dpr = Math.min(3, PixelRatio.get() || 2);
  const w = width * dpr;
  const h = height * dpr;
  if (w >= h) return { width: 1179, height: 2556 };
  return { width: Math.round(w), height: Math.round(h) };
}

function iconFor(name: string): TablerIcon {
  return name === '__ritual__' ? IconRepeat : ICON_BY_NAME.get(name) ?? IconStar;
}

/**
 * The wallpaper itself — lib/wallpaper.ts's renderDayWallpaper geometry,
 * drawn as SVG so it can preview at any size and export at full resolution.
 * Text width is estimated from the font size (no canvas measureText here);
 * the frosted blur falls back to the translucent card fill the web also uses
 * when canvas filters are unavailable.
 */
function WallpaperSvg({
  width: W,
  height: H,
  items,
  bgId,
  dateLabel,
  svgRef,
  displayHeight,
}: {
  width: number;
  height: number;
  items: WallpaperItem[];
  bgId: string;
  dateLabel: string;
  svgRef?: React.Ref<Svg>;
  displayHeight: number;
}) {
  const bg = WALLPAPER_GRADIENTS.find((g) => g.id === bgId) ?? WALLPAPER_GRADIENTS[0];
  const u = W / 390;
  const pad = 26 * u;
  const rowHNatural = 44 * u;
  const cardX = 22 * u;
  const cardW = W - cardX * 2;
  const cardTop = H * 0.3;
  const cardBottomMax = H - 52 * u;
  const headerH = dateLabel ? 30 * u : 0;
  const radius = 26 * u;
  const rowCount = Math.max(1, items.length);
  const availableH = Math.max(rowHNatural, cardBottomMax - cardTop - pad * 2 - headerH);
  const naturalRowsH = rowCount * rowHNatural;
  const rowScale = naturalRowsH > availableH ? Math.max(0.68, availableH / naturalRowsH) : 1;
  const rowH = rowHNatural * rowScale;
  const cardH = pad * 2 + headerH + rowCount * rowH;
  const fontPx = Math.round(17 * u * rowScale);
  const timeColW = fontPx * 4.6; // ≈ width of "12:30 PM" at weight 800
  const iconX = cardX + pad;
  const iconSize = 22 * u * rowScale;
  const timeRight = iconX + iconSize + 16 * u + timeColW;
  const titleX = timeRight + 16 * u;
  const titleMax = cardX + cardW - pad - titleX;
  const rowsTop = cardTop + pad + headerH;
  const maxChars = Math.max(4, Math.floor(titleMax / (fontPx * 0.56)));
  const fontFamily = 'Avenir Next';

  return (
    <Svg ref={svgRef} width={(W / H) * displayHeight} height={displayHeight} viewBox={`0 0 ${W} ${H}`}>
      <Defs>
        <LinearGradient id="bg" x1="0" y1="0" x2={W * 0.4} y2={H} gradientUnits="userSpaceOnUse">
          <Stop offset="0" stopColor={bg.from} />
          <Stop offset="1" stopColor={bg.to} />
        </LinearGradient>
        <RadialGradient id="glow" cx={W * 0.2} cy={H * 0.08} r={H * 0.55} gradientUnits="userSpaceOnUse">
          <Stop offset="0" stopColor="#FFFFFF" stopOpacity={0.07} />
          <Stop offset="1" stopColor="#FFFFFF" stopOpacity={0} />
        </RadialGradient>
        <LinearGradient id="vign" x1="0" y1={H * 0.2} x2="0" y2={H} gradientUnits="userSpaceOnUse">
          <Stop offset="0" stopColor="#000000" stopOpacity={0} />
          <Stop offset="1" stopColor="#000000" stopOpacity={0.28} />
        </LinearGradient>
        <LinearGradient id="edge" x1="0" y1={cardTop} x2="0" y2={cardTop + 3 * u} gradientUnits="userSpaceOnUse">
          <Stop offset="0" stopColor="#FFFFFF" stopOpacity={0.35} />
          <Stop offset="1" stopColor="#FFFFFF" stopOpacity={0} />
        </LinearGradient>
      </Defs>
      <Rect x={0} y={0} width={W} height={H} fill="url(#bg)" />
      <Rect x={0} y={0} width={W} height={H} fill="url(#glow)" />
      <Rect x={0} y={0} width={W} height={H} fill="url(#vign)" />

      {/* Glass card — top ~30% stays clear for the lock-screen clock. */}
      <Rect x={cardX} y={cardTop} width={cardW} height={cardH} rx={radius} fill="rgba(10, 18, 16, 0.35)" stroke="rgba(255,255,255,0.28)" strokeWidth={1.5 * u} />
      <Rect x={cardX + radius / 2} y={cardTop} width={cardW - radius} height={3 * u} fill="url(#edge)" />

      {dateLabel ? (
        <SvgText x={cardX + pad} y={cardTop + pad + 6 * u} fill="rgba(255,255,255,0.6)" fontSize={Math.round(11 * u)} fontWeight="800" fontFamily={fontFamily} alignmentBaseline="middle">
          {dateLabel.toUpperCase()}
        </SvgText>
      ) : null}

      {items.length === 0 ? (
        <SvgText
          x={cardX + cardW / 2}
          y={rowsTop + rowH / 2}
          fill="rgba(255,255,255,0.85)"
          fontSize={fontPx}
          fontWeight="700"
          fontFamily={fontFamily}
          textAnchor="middle"
          alignmentBaseline="middle"
        >
          Nothing scheduled — enjoy the day
        </SvgText>
      ) : (
        items.map((item, i) => {
          const cy = rowsTop + i * rowH + rowH / 2;
          const Glyph = iconFor(item.iconName);
          const title = item.title.length > maxChars ? `${item.title.slice(0, maxChars - 1).trimEnd()}…` : item.title;
          const titleW = Math.min(titleMax, title.length * fontPx * 0.56);
          return (
            <G key={item.id} opacity={item.done ? 0.5 : 1}>
              <G x={iconX} y={cy - iconSize / 2}>
                <Glyph size={iconSize} strokeWidth={2} color="#FFFFFF" />
              </G>
              <SvgText x={timeRight} y={cy} fill="#FFFFFF" fontSize={fontPx} fontWeight="800" fontFamily={fontFamily} textAnchor="end" alignmentBaseline="middle">
                {item.time}
              </SvgText>
              <SvgText x={titleX} y={cy} fill="#FFFFFF" fontSize={fontPx} fontWeight="700" fontFamily={fontFamily} alignmentBaseline="middle">
                {title}
              </SvgText>
              {item.done && <Line x1={titleX} y1={cy} x2={titleX + titleW} y2={cy} stroke="rgba(255,255,255,0.8)" strokeWidth={1.5 * u} />}
            </G>
          );
        })
      )}

      {/* Quiet wordmark under the card. */}
      <SvgText
        x={W / 2}
        y={Math.min(cardTop + cardH + 26 * u, H - 22 * u)}
        fill="rgba(255,255,255,0.35)"
        fontSize={Math.round(12 * u)}
        fontWeight="800"
        fontFamily={fontFamily}
        textAnchor="middle"
        alignmentBaseline="middle"
      >
        planr.
      </SvgText>
    </Svg>
  );
}

interface DayWallpaperSheetProps {
  open: boolean;
  onClose: () => void;
  schedule: Schedule;
  todayKey: DayKey;
}

/**
 * Native port of components/DayWallpaperSheet.tsx — a lock-screen wallpaper
 * of today's schedule: preview, choose which items appear, pick a
 * background, and save it through the share sheet ("Save Image"), then set it
 * as the Lock Screen from Photos. (The web's "your own photo" background
 * needs an image-picker module the native build doesn't include.)
 */
export default function DayWallpaperSheet({ open, onClose, schedule, todayKey }: DayWallpaperSheetProps) {
  const svgRef = useRef<Svg>(null);
  const [bgId, setBgId] = useState<string>(WALLPAPER_GRADIENTS[0].id);
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string> | null>(null);

  const todayISO = localISODate(new Date());

  // Today's full agenda: scheduled tasks + due rituals, sorted by clock time.
  const allItems = useMemo(() => {
    const rows: WallpaperItem[] = [];
    const categoryMap = categoriesById(schedule.categories);

    for (const task of schedule.activities[todayKey] ?? []) {
      if (!isTaskScheduledOn(task, todayISO, true, schedule.preferences?.startDate)) continue;
      const occ = resolveOccurrence(task, todayISO);
      const minutes = parseTimeToMinutes(occ.startTime);
      if (minutes == null) continue;
      rows.push({
        id: `task:${task.id}`,
        time: formatDisplayTime(occ.startTime),
        title: occ.title,
        iconName: taskIdentity(task, categoryMap).icon,
        done: !!task.completed,
        minutes,
      });
    }

    for (const ritual of schedule.rituals ?? []) {
      if (!ritualScheduledOnDate(ritual, todayISO, schedule.preferences?.startDate)) continue;
      const minutes = parseTimeToMinutes(ritual.time);
      if (minutes == null) continue;
      rows.push({ id: `ritual:${ritual.id}`, time: formatDisplayTime(ritual.time), title: ritual.title, iconName: '__ritual__', minutes });
    }

    return rows.sort((a, b) => a.minutes - b.minutes);
  }, [schedule.activities, schedule.rituals, schedule.categories, schedule.preferences?.startDate, todayKey, todayISO]);

  // Default to "everything included" each time the sheet opens.
  useEffect(() => {
    if (open) {
      setSelectedIds(new Set(allItems.map((i) => i.id)));
      setFeedback(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const items = useMemo(() => (selectedIds ? allItems.filter((i) => selectedIds.has(i.id)) : allItems), [allItems, selectedIds]);

  function toggleItem(id: string) {
    haptic('light');
    setSelectedIds((prev) => {
      const next = new Set(prev ?? allItems.map((i) => i.id));
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  const { width, height } = wallpaperSize();
  const dateLabel = new Date().toLocaleDateString('en-US', { weekday: 'long' });
  const previewHeight = Math.round(Dimensions.get('window').height * 0.44);

  function handleSave() {
    const svg = svgRef.current as unknown as { toDataURL?: (cb: (base64: string) => void, options?: { width: number; height: number }) => void } | null;
    if (!svg?.toDataURL) return;
    haptic('light');
    if (Platform.OS !== 'ios') {
      setFeedback("Saving the image isn't available on this device yet.");
      return;
    }
    setSaving(true);
    setFeedback(null);
    svg.toDataURL(
      (base64) => {
        Share.share({ url: `data:image/png;base64,${base64}` })
          .then((result) => {
            if (result.action === Share.sharedAction) setFeedback('Saved. Set it from Photos → share → Use as Wallpaper.');
          })
          .catch(() => setFeedback("Couldn't export the image — try again."))
          .finally(() => setSaving(false));
      },
      { width, height },
    );
  }

  return (
    <BottomSheet open={open} onClose={onClose}>
      <View className="px-5 pb-7 pt-2">
        <SheetHeader eyebrow="Today" title="Lock screen wallpaper" onClose={onClose} />

        {/* Preview — the hero of this sheet. */}
        <View className="mt-4 items-center">
          <View
            accessibilityLabel="Wallpaper preview of today's schedule"
            className="overflow-hidden rounded-2xl border border-neutral-200/70 dark:border-white/[0.10]"
            style={{ shadowColor: '#000', shadowOpacity: 0.18, shadowRadius: 18, shadowOffset: { width: 0, height: 8 }, elevation: 6 }}
          >
            <WallpaperSvg svgRef={svgRef} width={width} height={height} items={items} bgId={bgId} dateLabel={dateLabel} displayHeight={previewHeight} />
          </View>
        </View>

        {/* Task picker — choose what actually shows on the wallpaper. */}
        {allItems.length > 0 && (
          <View className="mt-4">
            <View className="mb-2 flex-row items-center justify-between px-0.5">
              <Text className="text-[11px] font-bold uppercase tracking-[0.10em] text-neutral-500 dark:text-neutral-400">
                Include ({items.length}/{allItems.length})
              </Text>
              <View className="flex-row items-center gap-3">
                <Pressable
                  accessibilityRole="button"
                  hitSlop={8}
                  onPress={() => {
                    haptic('light');
                    setSelectedIds(new Set(allItems.map((i) => i.id)));
                  }}
                >
                  <Text className="text-[11px] font-semibold text-neutral-500 dark:text-neutral-400">All</Text>
                </Pressable>
                <Pressable
                  accessibilityRole="button"
                  hitSlop={8}
                  onPress={() => {
                    haptic('light');
                    setSelectedIds(new Set());
                  }}
                >
                  <Text className="text-[11px] font-semibold text-neutral-500 dark:text-neutral-400">None</Text>
                </Pressable>
              </View>
            </View>
            <ScrollView nestedScrollEnabled style={{ maxHeight: 192 }} className="rounded-xl border border-neutral-200/70 dark:border-white/[0.07]">
              {allItems.map((item, i) => {
                const checked = selectedIds?.has(item.id) ?? true;
                return (
                  <Pressable
                    key={item.id}
                    accessibilityRole="checkbox"
                    accessibilityState={{ checked }}
                    accessibilityLabel={`${item.time} ${item.title}`}
                    onPress={() => toggleItem(item.id)}
                    className={`w-full flex-row items-center gap-2.5 px-3 py-2 active:bg-neutral-50 dark:active:bg-white/[0.03] ${
                      i > 0 ? 'border-t border-neutral-100 dark:border-white/[0.05]' : ''
                    } ${checked ? '' : 'opacity-45'}`}
                  >
                    <Icon icon={iconFor(item.iconName)} size={15} strokeWidth={1.8} className="shrink-0 text-neutral-500 dark:text-neutral-400" />
                    <Text className="w-[70px] shrink-0 text-[11px] font-bold tabular-nums text-neutral-500 dark:text-neutral-400">{item.time}</Text>
                    <Text className="min-w-0 flex-1 truncate text-[13px] font-semibold text-neutral-800 dark:text-neutral-200">{item.title}</Text>
                    <View
                      className={`h-5 w-5 shrink-0 items-center justify-center rounded-pr-sm border-2 ${
                        checked ? 'border-transparent bg-[#00A63E] dark:bg-[#2FD46E]' : 'border-neutral-300 dark:border-white/20'
                      }`}
                    >
                      {checked && <Icon icon={IconCheck} size={12} strokeWidth={3} className="text-white dark:text-neutral-950" />}
                    </View>
                  </Pressable>
                );
              })}
            </ScrollView>
          </View>
        )}

        {/* Backgrounds */}
        <View className="mt-4 flex-row items-center justify-center gap-2.5">
          {WALLPAPER_GRADIENTS.map((g) => (
            <Pressable
              key={g.id}
              accessibilityRole="button"
              accessibilityLabel={`${g.label} background`}
              accessibilityState={{ selected: bgId === g.id }}
              onPress={() => {
                haptic('light');
                setBgId(g.id);
              }}
              className={`h-10 w-10 rounded-full border-2 ${bgId === g.id ? 'border-neutral-900 dark:border-white' : 'border-neutral-200/80 dark:border-white/[0.12]'}`}
              style={{ backgroundColor: g.from }}
            />
          ))}
        </View>

        <Text className="mt-3 text-center text-[11px] leading-snug text-neutral-500 dark:text-neutral-400">
          The top stays clear for the clock. Save the image, then set it as your Lock Screen from Photos.
        </Text>

        <View className="mt-4">
          <Button variant="cta" fullWidth disabled={saving} onPress={handleSave}>
            <Text className={`text-[16px] font-semibold ${BUTTON_TEXT.cta}`}>{saving ? 'Exporting…' : 'Save wallpaper'}</Text>
          </Button>
          {feedback && <Text className="mt-2 text-center text-[11px] font-semibold text-neutral-500 dark:text-neutral-400">{feedback}</Text>}
        </View>
      </View>
    </BottomSheet>
  );
}
