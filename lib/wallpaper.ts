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
  /** Small eyebrow at the top of the card, e.g. "SATURDAY · JUL 11". */
  dateLabel?: string;
}

/** Draw the full wallpaper onto `canvas`. Fonts must already be loaded. */
export function renderDayWallpaper(canvas: HTMLCanvasElement, opts: RenderOptions): void {
  const { width: W, height: H, items, icons, background, dateLabel } = opts;
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
  const headerH = dateLabel ? 30 * u : 0;

  const maxRows = Math.max(1, Math.floor((cardBottomMax - cardTop - pad * 2 - headerH) / rowH));
  const overflow = items.length > maxRows;
  const shown = overflow ? items.slice(0, maxRows - 1) : items;
  const rowCount = Math.max(1, shown.length + (overflow ? 1 : 0));
  const cardH = pad * 2 + headerH + rowCount * rowH;
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

  // Inner top highlight — the light edge real frosted glass catches.
  ctx.save();
  roundRectPath(ctx, cardX, cardTop, cardW, cardH, radius);
  ctx.clip();
  const edge = ctx.createLinearGradient(0, cardTop, 0, cardTop + 3 * u);
  edge.addColorStop(0, "rgba(255,255,255,0.35)");
  edge.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = edge;
  ctx.fillRect(cardX, cardTop, cardW, 3 * u);
  ctx.restore();

  // ── Card content ───────────────────────────────────────────────────────────
  // Soft text shadow lifts type off busy photo backgrounds; harmless on
  // gradients. Applied to all card content, reset at the end.
  ctx.save();
  ctx.shadowColor = "rgba(0,0,0,0.35)";
  ctx.shadowBlur = 4 * u;
  ctx.shadowOffsetY = 1 * u;

  const fontPx = Math.round(17 * u);
  ctx.textBaseline = "middle";

  if (dateLabel) {
    ctx.fillStyle = "rgba(255,255,255,0.6)";
    ctx.font = `800 ${Math.round(11 * u)}px Nunito, ui-sans-serif, system-ui, sans-serif`;
    ctx.fillText(dateLabel.toUpperCase(), cardX + pad, cardTop + pad + 6 * u);
  }

  ctx.font = `800 ${fontPx}px Nunito, ui-sans-serif, system-ui, sans-serif`;
  const timeColW = ctx.measureText("12:30 PM").width;
  const iconX = cardX + pad;
  const iconSize = 22 * u;
  const timeRight = iconX + iconSize + 16 * u + timeColW; // right-aligned column
  const titleX = timeRight + 16 * u;
  const titleMax = cardX + cardW - pad - titleX;
  const rowsTop = cardTop + pad + headerH;

  if (shown.length === 0) {
    ctx.fillStyle = "rgba(255,255,255,0.85)";
    ctx.font = `700 ${fontPx}px Nunito, ui-sans-serif, system-ui, sans-serif`;
    ctx.textAlign = "center";
    ctx.fillText("Nothing scheduled — enjoy the day", cardX + cardW / 2, rowsTop + rowH / 2);
    ctx.textAlign = "left";
    ctx.restore();
    return;
  }

  shown.forEach((item, i) => {
    const cy = rowsTop + i * rowH + rowH / 2;
    const alpha = item.done ? 0.5 : 1;
    ctx.globalAlpha = alpha;

    const icon = icons[i];
    if (icon) ctx.drawImage(icon, iconX, cy - iconSize / 2, iconSize, iconSize);

    // Times right-align in their column so meridiems line up like an
    // instrument readout; titles share one left edge.
    ctx.fillStyle = "#FFFFFF";
    ctx.font = `800 ${fontPx}px Nunito, ui-sans-serif, system-ui, sans-serif`;
    ctx.textAlign = "right";
    ctx.fillText(item.time, timeRight, cy);
    ctx.textAlign = "left";

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
    const cy = rowsTop + shown.length * rowH + rowH / 2;
    ctx.fillStyle = "rgba(255,255,255,0.65)";
    ctx.font = `700 ${fontPx}px Nunito, ui-sans-serif, system-ui, sans-serif`;
    ctx.fillText(`+${items.length - shown.length} more`, titleX, cy);
  }
  ctx.restore();

  // Quiet wordmark under the card — brands the shared artifact without shouting.
  ctx.fillStyle = "rgba(255,255,255,0.35)";
  ctx.font = `800 ${Math.round(12 * u)}px Nunito, ui-sans-serif, system-ui, sans-serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText("planr.", W / 2, Math.min(cardTop + cardH + 26 * u, H - 22 * u));
  ctx.textAlign = "left";
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
