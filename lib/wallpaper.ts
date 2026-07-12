/**
 * Day Wallpaper — renders today's schedule as a lock-screen-sized PNG.
 *
 * Everything happens client-side on a canvas: background (bundled gradient or
 * the user's own photo), a frosted glass card listing the day's items, and a
 * clock-safe zone (top ~30% left empty for the iOS lock-screen clock). The
 * user saves/shares the image and sets it as wallpaper themselves — no web
 * API can do that part.
 */

export interface WallpaperItem {
  time: string;   // display format, e.g. "4:30 AM"
  title: string;
  /** Serialized SVG markup for the row icon (white strokes), or null. */
  iconSvg: string | null;
  done?: boolean;
}

export interface WallpaperGradient {
  kind: "gradient";
  id: string;
  label: string;
  from: string;
  to: string;
}

export interface WallpaperPhoto {
  kind: "photo";
  image: HTMLImageElement;
}

export type WallpaperBackground = WallpaperGradient | WallpaperPhoto;

export const WALLPAPER_GRADIENTS: WallpaperGradient[] = [
  { kind: "gradient", id: "forest", label: "Forest", from: "#10382A", to: "#04130D" },
  { kind: "gradient", id: "ink",    label: "Ink",    from: "#171B1C", to: "#05070A" },
  { kind: "gradient", id: "ocean",  label: "Ocean",  from: "#0E3A46", to: "#041318" },
  { kind: "gradient", id: "ember",  label: "Ember",  from: "#3A2417", to: "#120905" },
];

/** Portrait wallpaper size for this device (falls back to iPhone-sized). */
export function wallpaperSize(): { width: number; height: number } {
  if (typeof window === "undefined") return { width: 1179, height: 2556 };
  const dpr = Math.min(3, window.devicePixelRatio || 2);
  const w = window.screen.width * dpr;
  const h = window.screen.height * dpr;
  // Desktop or landscape: generate a standard phone-portrait wallpaper.
  if (w >= h) return { width: 1179, height: 2556 };
  return { width: Math.round(w), height: Math.round(h) };
}

/** Serialized SVG → drawable Image (SVG data URIs never taint the canvas). */
export function svgToImage(svg: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("icon load failed"));
    img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
  });
}

function roundRectPath(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function drawBackground(
  ctx: CanvasRenderingContext2D,
  bg: WallpaperBackground,
  W: number,
  H: number,
) {
  if (bg.kind === "photo") {
    const { image } = bg;
    // Cover-fit: fill the frame, crop the overflow, keep aspect.
    const scale = Math.max(W / image.width, H / image.height);
    const dw = image.width * scale;
    const dh = image.height * scale;
    ctx.drawImage(image, (W - dw) / 2, (H - dh) / 2, dw, dh);
  } else {
    const grad = ctx.createLinearGradient(0, 0, W * 0.4, H);
    grad.addColorStop(0, bg.from);
    grad.addColorStop(1, bg.to);
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, W, H);
    // Soft top-corner light so flat gradients don't feel dead.
    const glow = ctx.createRadialGradient(W * 0.2, H * 0.08, 0, W * 0.2, H * 0.08, H * 0.55);
    glow.addColorStop(0, "rgba(255,255,255,0.07)");
    glow.addColorStop(1, "rgba(255,255,255,0)");
    ctx.fillStyle = glow;
    ctx.fillRect(0, 0, W, H);
  }
}

function truncate(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string {
  if (ctx.measureText(text).width <= maxWidth) return text;
  let t = text;
  while (t.length > 1 && ctx.measureText(`${t}…`).width > maxWidth) t = t.slice(0, -1);
  return `${t.trimEnd()}…`;
}

export interface RenderOptions {
  width: number;
  height: number;
  items: WallpaperItem[];
  /** Pre-loaded icon images aligned by index with `items` (null = no icon). */
  icons: (HTMLImageElement | null)[];
  background: WallpaperBackground;
}

/** Draw the full wallpaper onto `canvas`. Fonts must already be loaded. */
export function renderDayWallpaper(canvas: HTMLCanvasElement, opts: RenderOptions): void {
  const { width: W, height: H, items, icons, background } = opts;
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  // Scale unit: design in iPhone points (390pt-wide reference).
  const u = W / 390;

  drawBackground(ctx, background, W, H);
  // Gentle bottom vignette keeps the card legible on bright photos.
  const vign = ctx.createLinearGradient(0, H * 0.2, 0, H);
  vign.addColorStop(0, "rgba(0,0,0,0)");
  vign.addColorStop(1, "rgba(0,0,0,0.28)");
  ctx.fillStyle = vign;
  ctx.fillRect(0, 0, W, H);

  // ── Card geometry — top ~30% stays clear for the lock-screen clock ────────
  const pad = 26 * u;
  const rowH = 44 * u;
  const cardX = 22 * u;
  const cardW = W - cardX * 2;
  const cardTop = H * 0.3;
  const cardBottomMax = H - 52 * u;

  const maxRows = Math.max(1, Math.floor((cardBottomMax - cardTop - pad * 2) / rowH));
  const overflow = items.length > maxRows;
  const shown = overflow ? items.slice(0, maxRows - 1) : items;
  const rowCount = Math.max(1, shown.length + (overflow ? 1 : 0));
  const cardH = pad * 2 + rowCount * rowH;
  const radius = 26 * u;

  // ── Frosted glass ──────────────────────────────────────────────────────────
  ctx.save();
  roundRectPath(ctx, cardX, cardTop, cardW, cardH, radius);
  ctx.clip();
  try {
    // Re-draw the background blurred inside the card (overscan hides edge halo).
    ctx.filter = `blur(${22 * u}px)`;
    ctx.save();
    ctx.translate(W / 2, H / 2);
    ctx.scale(1.12, 1.12);
    ctx.translate(-W / 2, -H / 2);
    drawBackground(ctx, background, W, H);
    ctx.restore();
    ctx.filter = "none";
  } catch {
    // ctx.filter unsupported — translucent fill below still reads fine.
  }
  ctx.fillStyle = "rgba(10, 18, 16, 0.35)";
  ctx.fillRect(cardX, cardTop, cardW, cardH);
  ctx.restore();

  ctx.lineWidth = 1.5 * u;
  ctx.strokeStyle = "rgba(255,255,255,0.28)";
  roundRectPath(ctx, cardX, cardTop, cardW, cardH, radius);
  ctx.stroke();

  // ── Rows ───────────────────────────────────────────────────────────────────
  const fontPx = Math.round(17 * u);
  ctx.textBaseline = "middle";
  ctx.font = `700 ${fontPx}px Nunito, ui-sans-serif, system-ui, sans-serif`;
  const timeColW = ctx.measureText("12:30 PM").width;
  const iconX = cardX + pad;
  const iconSize = 22 * u;
  const timeX = iconX + iconSize + 16 * u;
  const titleX = timeX + timeColW + 16 * u;
  const titleMax = cardX + cardW - pad - titleX;

  if (shown.length === 0) {
    ctx.fillStyle = "rgba(255,255,255,0.85)";
    ctx.textAlign = "center";
    ctx.fillText("Nothing scheduled — enjoy the day", cardX + cardW / 2, cardTop + cardH / 2);
    ctx.textAlign = "left";
    return;
  }

  shown.forEach((item, i) => {
    const cy = cardTop + pad + i * rowH + rowH / 2;
    const alpha = item.done ? 0.5 : 1;
    ctx.globalAlpha = alpha;

    const icon = icons[i];
    if (icon) ctx.drawImage(icon, iconX, cy - iconSize / 2, iconSize, iconSize);

    ctx.fillStyle = "#FFFFFF";
    ctx.font = `800 ${fontPx}px Nunito, ui-sans-serif, system-ui, sans-serif`;
    ctx.fillText(item.time, timeX, cy);

    ctx.font = `700 ${fontPx}px Nunito, ui-sans-serif, system-ui, sans-serif`;
    const title = truncate(ctx, item.title, titleMax);
    ctx.fillText(title, titleX, cy);
    if (item.done) {
      const tw = ctx.measureText(title).width;
      ctx.strokeStyle = "rgba(255,255,255,0.8)";
      ctx.lineWidth = 1.5 * u;
      ctx.beginPath();
      ctx.moveTo(titleX, cy);
      ctx.lineTo(titleX + tw, cy);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
  });

  if (overflow) {
    const cy = cardTop + pad + shown.length * rowH + rowH / 2;
    ctx.fillStyle = "rgba(255,255,255,0.65)";
    ctx.font = `700 ${fontPx}px Nunito, ui-sans-serif, system-ui, sans-serif`;
    ctx.fillText(`+${items.length - shown.length} more`, timeX, cy);
  }
}

/** Export the canvas and hand it to the OS share sheet (or download). */
export async function shareWallpaper(canvas: HTMLCanvasElement, dateISO: string): Promise<"shared" | "downloaded" | "cancelled" | "failed"> {
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/png"));
  if (!blob) return "failed";
  const file = new File([blob], `planr-day-${dateISO}.png`, { type: "image/png" });

  if (typeof navigator.canShare === "function" && navigator.canShare({ files: [file] })) {
    try {
      await navigator.share({ files: [file] });
      return "shared";
    } catch (err) {
      // User closed the share sheet — not an error.
      if (err instanceof Error && err.name === "AbortError") return "cancelled";
      // Fall through to download.
    }
  }

  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = file.name;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1_000);
  return "downloaded";
}
