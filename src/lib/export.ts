/**
 * Turning a drawing into files. Everything runs in the browser.
 */
import type { Arrangement, Primitive } from "./geometry";
import { INK, type Cells } from "./document";

export interface ExportOptions {
  /** "drawing" trims to the filled cells, "artboard" keeps the full 240 x 240 sheet. */
  crop: "drawing" | "artboard";
  /** Margin around a trimmed drawing, in artboard units. */
  padding: number;
  /** Colour used for cells painted with the theme ink. */
  ink: string;
  /** Background fill, or null for transparent. */
  background: string | null;
}

export const DEFAULT_EXPORT: ExportOptions = {
  crop: "drawing",
  padding: 12,
  ink: "#111111",
  background: null,
};

const round = (n: number) => Math.round(n * 1000) / 1000;

/** Cells grouped by colour, in the order the colours first appear. */
export function groupByColour(cells: Cells): Map<string, number[]> {
  const groups = new Map<string, number[]>();
  for (const [key, colour] of Object.entries(cells)) {
    const list = groups.get(colour) ?? [];
    list.push(Number(key));
    groups.set(colour, list);
  }
  return groups;
}

export interface SvgResult {
  svg: string;
  width: number;
  height: number;
}

export function buildSvg(arr: Arrangement, cells: Cells, options: ExportOptions): SvgResult {
  const ids = Object.keys(cells).map(Number);
  let box: [number, number, number, number] = [0, 0, arr.size, arr.size];
  if (options.crop === "drawing") {
    const b = arr.bounds(ids);
    if (b) {
      const p = options.padding;
      box = [b[0] - p, b[1] - p, b[2] + p, b[3] + p];
    }
  }
  const x = round(box[0]);
  const y = round(box[1]);
  const width = round(box[2] - box[0]);
  const height = round(box[3] - box[1]);

  const parts: string[] = [];
  if (options.background) {
    parts.push(`<rect x="${x}" y="${y}" width="${width}" height="${height}" fill="${options.background}"/>`);
  }
  for (const [colour, group] of groupByColour(cells)) {
    const fill = colour === INK ? options.ink : colour;
    parts.push(`<path fill="${fill}" d="${arr.merge(group)}"/>`);
  }
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${x} ${y} ${width} ${height}" ` +
    `width="${width}" height="${height}">\n  ${parts.join("\n  ")}\n</svg>\n`;
  return { svg, width, height };
}

export function download(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** Rasterise an SVG so its longer side is `longSide` pixels. */
export async function svgToPng(result: SvgResult, longSide: number): Promise<Blob> {
  const scale = longSide / Math.max(result.width, result.height);
  const w = Math.max(1, Math.round(result.width * scale));
  const h = Math.max(1, Math.round(result.height * scale));
  const url = URL.createObjectURL(new Blob([result.svg], { type: "image/svg+xml" }));
  try {
    const img = new Image();
    img.decoding = "async";
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = () => reject(new Error("The browser could not render the drawing."));
      img.src = url;
    });
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Canvas is not available in this browser.");
    ctx.drawImage(img, 0, 0, w, h);
    return await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("PNG encoding failed."))), "image/png");
    });
  } finally {
    URL.revokeObjectURL(url);
  }
}

/** Path data that draws a grid's guides. Clip it to the artboard when rendering. */
export function guidesPath(guides: Primitive[]): string {
  let d = "";
  for (const g of guides) {
    if (g.kind === "seg") {
      d += `M${round(g.x1)} ${round(g.y1)}L${round(g.x2)} ${round(g.y2)}`;
    } else {
      const r = round(g.r);
      d += `M${round(g.cx - g.r)} ${round(g.cy)}a${r} ${r} 0 1 0 ${round(2 * g.r)} 0a${r} ${r} 0 1 0 ${round(-2 * g.r)} 0`;
    }
  }
  return d;
}
