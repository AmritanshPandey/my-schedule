"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { IconPhoto, IconRepeat, IconStar } from "@tabler/icons-react";
import BottomSheet from "@/components/ui/BottomSheet";
import SheetHeader from "@/components/ui/SheetHeader";
import Button from "@/components/ui/Button";
import { SECTION_ICONS } from "@/components/SectionIcons";
import type { DayKey, Schedule } from "@/lib/useScheduleDB";
import { isTaskScheduledOn, resolveOccurrence } from "@/lib/taskOccurrence";
import { parseTimeToMinutes, formatDisplayTime } from "@/lib/timeUtils";
import { localISODate } from "@/lib/dateUtils";
import { haptic } from "@/lib/haptics";
import {
  WALLPAPER_GRADIENTS,
  renderDayWallpaper,
  shareWallpaper,
  svgToImage,
  wallpaperSize,
  type WallpaperBackground,
  type WallpaperItem,
} from "@/lib/wallpaper";

const ICON_BY_NAME = new Map(SECTION_ICONS.map((entry) => [entry.name, entry.icon]));

interface DayWallpaperSheetProps {
  open: boolean;
  onClose: () => void;
  schedule: Schedule;
  todayKey: DayKey;
}

/**
 * Generates a lock-screen wallpaper of today's schedule. The top third stays
 * clear for the clock; the user saves the image and sets it as wallpaper from
 * Photos (no web API can set it directly — we're honest about that in copy).
 */
export default function DayWallpaperSheet({ open, onClose, schedule, todayKey }: DayWallpaperSheetProps) {
  // State (not a plain ref) because BottomSheet portals its children in a
  // later commit than this component's mount — the render effect must re-run
  // once the canvas actually exists in the DOM.
  const [canvasEl, setCanvasEl] = useState<HTMLCanvasElement | null>(null);
  const iconHostRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const [bgId, setBgId] = useState<string>(WALLPAPER_GRADIENTS[0].id);
  const [photo, setPhoto] = useState<HTMLImageElement | null>(null);
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);

  const todayISO = localISODate(new Date());

  // Today's agenda: scheduled tasks + due rituals, sorted by clock time.
  const items = useMemo(() => {
    const rows: Array<WallpaperItem & { iconName: string; minutes: number }> = [];

    for (const task of schedule.activities[todayKey] ?? []) {
      if (!isTaskScheduledOn(task, todayISO, true)) continue;
      const occ = resolveOccurrence(task, todayISO);
      const minutes = parseTimeToMinutes(occ.startTime);
      if (minutes == null) continue;
      rows.push({
        time: occ.startTime,
        title: occ.title,
        iconName: task.icon || "star",
        iconSvg: null,
        done: !!task.completed,
        minutes,
      });
    }

    for (const ritual of schedule.rituals ?? []) {
      if (ritual.repeatDays && ritual.repeatDays.length > 0 && !ritual.repeatDays.includes(todayKey)) continue;
      const minutes = parseTimeToMinutes(ritual.time);
      if (minutes == null) continue;
      rows.push({
        time: formatDisplayTime(ritual.time),
        title: ritual.title,
        iconName: "__ritual__",
        iconSvg: null,
        minutes,
      });
    }

    return rows.sort((a, b) => a.minutes - b.minutes);
  }, [schedule.activities, schedule.rituals, todayKey, todayISO]);

  const background: WallpaperBackground = useMemo(() => {
    if (bgId === "photo" && photo) return { kind: "photo", image: photo };
    return WALLPAPER_GRADIENTS.find((g) => g.id === bgId) ?? WALLPAPER_GRADIENTS[0];
  }, [bgId, photo]);

  // Render whenever the sheet is open and inputs change. Icons come from the
  // hidden host below: serialized to white-stroke SVGs, loaded as images.
  useEffect(() => {
    if (!open || !canvasEl) return;
    let cancelled = false;

    (async () => {
      try {
        await document.fonts.load("800 20px Nunito");
        await document.fonts.load("700 20px Nunito");
      } catch {
        /* system fallback still renders */
      }

      const host = iconHostRef.current;
      const svgs: (string | null)[] = items.map((_, i) => {
        const el = host?.querySelector<SVGSVGElement>(`[data-wp-icon="${i}"]`);
        if (!el) return null;
        const clone = el.cloneNode(true) as SVGSVGElement;
        if (!clone.getAttribute("xmlns")) clone.setAttribute("xmlns", "http://www.w3.org/2000/svg");
        clone.setAttribute("style", "color:#FFFFFF");
        return new XMLSerializer().serializeToString(clone);
      });
      const icons = await Promise.all(
        svgs.map((svg) => (svg ? svgToImage(svg).catch(() => null) : Promise.resolve(null))),
      );

      if (cancelled) return;
      const { width, height } = wallpaperSize();
      renderDayWallpaper(canvasEl, { width, height, items, icons, background });
    })();

    return () => {
      cancelled = true;
    };
  }, [open, canvasEl, items, background]);

  function handlePhotoPick(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      setPhoto(img);
      setBgId("photo");
      URL.revokeObjectURL(url);
    };
    img.onerror = () => URL.revokeObjectURL(url);
    img.src = url;
  }

  async function handleSave() {
    const canvas = canvasEl;
    if (!canvas) return;
    haptic("light");
    setSaving(true);
    setFeedback(null);
    try {
      const result = await shareWallpaper(canvas, todayISO);
      if (result === "downloaded") setFeedback("Saved. Set it from Photos → share → Use as Wallpaper.");
      else if (result === "failed") setFeedback("Couldn't export the image — try again.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <BottomSheet open={open} onClose={onClose} desktopWidth="max-w-[440px]">
      <div
        className="px-5 pt-2"
        style={{ paddingBottom: "max(28px, calc(env(safe-area-inset-bottom) + 16px))" }}
      >
        <SheetHeader eyebrow="Today" title="Lock Screen Wallpaper" onClose={onClose} />

        {/* Hidden icon host — serialized into the canvas render. */}
        <div ref={iconHostRef} aria-hidden="true" className="pointer-events-none absolute h-0 w-0 overflow-hidden">
          {items.map((item, i) => {
            const Icon =
              item.iconName === "__ritual__"
                ? IconRepeat
                : ICON_BY_NAME.get(item.iconName) ?? IconStar;
            return <Icon key={i} data-wp-icon={i} size={44} strokeWidth={2} />;
          })}
        </div>

        {/* Preview */}
        <div className="mt-4 flex justify-center">
          <canvas
            ref={setCanvasEl}
            aria-label="Wallpaper preview of today's schedule"
            className="max-h-[44vh] w-auto rounded-2xl border border-neutral-200/70 dark:border-white/[0.10]"
          />
        </div>

        {/* Backgrounds */}
        <div className="mt-4 flex items-center justify-center gap-2.5">
          {WALLPAPER_GRADIENTS.map((g) => (
            <button
              key={g.id}
              type="button"
              aria-label={`${g.label} background`}
              aria-pressed={bgId === g.id}
              onClick={() => { haptic("light"); setBgId(g.id); }}
              className={`h-10 w-10 rounded-full border-2 transition-colors ${
                bgId === g.id ? "border-neutral-900 dark:border-white" : "border-transparent"
              }`}
              style={{ backgroundColor: g.from }}
            />
          ))}
          <button
            type="button"
            aria-label="Use your own photo"
            aria-pressed={bgId === "photo"}
            onClick={() => { haptic("light"); fileRef.current?.click(); }}
            className={`flex h-10 w-10 items-center justify-center rounded-full border-2 bg-neutral-100 text-neutral-500 dark:bg-white/[0.08] dark:text-neutral-300 ${
              bgId === "photo" ? "border-neutral-900 dark:border-white" : "border-transparent"
            }`}
          >
            <IconPhoto size={17} strokeWidth={2} />
          </button>
          <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handlePhotoPick} />
        </div>

        <p className="mt-3 text-center text-[11px] leading-snug text-neutral-400 dark:text-neutral-500">
          The top stays clear for the clock. Save the image, then set it as your
          Lock Screen from Photos.
        </p>

        <div className="mt-4">
          <Button variant="cta" fullWidth disabled={saving} onClick={() => void handleSave()}>
            {saving ? "Exporting…" : "Save wallpaper"}
          </Button>
          {feedback && (
            <p className="mt-2 text-center text-[11px] font-semibold text-neutral-500 dark:text-neutral-400">
              {feedback}
            </p>
          )}
        </div>
      </div>
    </BottomSheet>
  );
}
