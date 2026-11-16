"use client";

import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Arrangement } from "@/lib/geometry";
import { INK, type Cells } from "@/lib/document";
import { groupByColour, guidesPath } from "@/lib/export";

export type Tool = "draw" | "erase" | "pan";
export type Symmetry = "none" | "vertical" | "horizontal" | "both";

export interface View {
  /** Screen pixels per artboard unit. */
  k: number;
  x: number;
  y: number;
}

interface Props {
  arr: Arrangement;
  cells: Cells;
  tool: Tool;
  colour: string;
  symmetry: Symmetry;
  showGuides: boolean;
  view: View | null;
  onView: (view: View) => void;
  onSize: (size: { w: number; h: number }) => void;
  onBegin: () => void;
  onPaint: (ids: number[], colour: string | null) => void;
}

const MIN_ZOOM = 0.4;
const MAX_ZOOM = 40;
const cssColour = (c: string) => (c === INK ? "var(--ink)" : c);

/** Filled cells, merged per colour so neighbours read as one shape. */
const Fills = memo(function Fills({ arr, cells }: { arr: Arrangement; cells: Cells }) {
  const paths = useMemo(
    () =>
      [...groupByColour(cells)].map(([colour, ids]) => ({
        colour,
        d: arr.merge(ids),
      })),
    [arr, cells],
  );
  return (
    <g>
      {paths.map((p) => (
        <path key={p.colour} d={p.d} fill={cssColour(p.colour)} />
      ))}
    </g>
  );
});

const Guides = memo(function Guides({ arr }: { arr: Arrangement }) {
  const d = useMemo(() => guidesPath(arr.guides), [arr]);
  return <path d={d} className="guides" clipPath="url(#sheet-clip)" />;
});

export default function Canvas(props: Props) {
  const { arr, cells, tool, colour, symmetry, showGuides, view, onView, onSize, onBegin, onPaint } =
    props;
  const wrap = useRef<HTMLDivElement>(null);
  const [hover, setHover] = useState(-1);
  const [spaceHeld, setSpaceHeld] = useState(false);
  const [panning, setPanning] = useState(false);

  // Mutable gesture state. None of it needs to trigger a render.
  const gesture = useRef({
    mode: "idle" as "idle" | "stroke" | "pan" | "pinch",
    erase: false,
    /** Cell to clear if the pointer comes up without leaving it, or -1. */
    tapCell: -1,
    lastX: 0,
    lastY: 0,
    pointers: new Map<number, { x: number; y: number }>(),
    pinchDist: 0,
  });
  const live = useRef({ view, cells, arr, colour, tool, symmetry });
  live.current = { view, cells, arr, colour, tool, symmetry };

  useEffect(() => {
    const el = wrap.current;
    if (!el) return;
    const ro = new ResizeObserver(() => onSize({ w: el.clientWidth, h: el.clientHeight }));
    ro.observe(el);
    onSize({ w: el.clientWidth, h: el.clientHeight });
    return () => ro.disconnect();
  }, [onSize]);

  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.code === "Space" && !(e.target instanceof HTMLInputElement)) setSpaceHeld(true);
    };
    const up = (e: KeyboardEvent) => {
      if (e.code === "Space") setSpaceHeld(false);
    };
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
    };
  }, []);

  const toWorld = useCallback((clientX: number, clientY: number): [number, number] => {
    const v = live.current.view;
    const rect = wrap.current?.getBoundingClientRect();
    if (!v || !rect) return [-1, -1];
    return [(clientX - rect.left - v.x) / v.k, (clientY - rect.top - v.y) / v.k];
  }, []);

  const zoomAt = useCallback(
    (clientX: number, clientY: number, factor: number) => {
      const v = live.current.view;
      const rect = wrap.current?.getBoundingClientRect();
      if (!v || !rect) return;
      const k = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, v.k * factor));
      const px = clientX - rect.left;
      const py = clientY - rect.top;
      onView({ k, x: px - ((px - v.x) / v.k) * k, y: py - ((py - v.y) / v.k) * k });
    },
    [onView],
  );

  // Wheel needs a non-passive listener to stop the page from scrolling.
  useEffect(() => {
    const el = wrap.current;
    if (!el) return;
    const wheel = (e: WheelEvent) => {
      e.preventDefault();
      if (e.ctrlKey || e.metaKey || e.deltaMode !== 0 || Math.abs(e.deltaY) >= 40) {
        zoomAt(e.clientX, e.clientY, Math.exp(-e.deltaY * (e.ctrlKey ? 0.01 : 0.0015)));
      } else {
        const v = live.current.view;
        if (v) onView({ ...v, x: v.x - e.deltaX, y: v.y - e.deltaY });
      }
    };
    el.addEventListener("wheel", wheel, { passive: false });
    return () => el.removeEventListener("wheel", wheel);
  }, [zoomAt, onView]);

  /** The cell plus its mirror images under the current symmetry. */
  const withMirrors = useCallback((id: number): number[] => {
    const { arr: a, symmetry: sym } = live.current;
    if (sym === "none") return [id];
    const [x, y] = a.faces[id].point;
    const s = a.size;
    const points: [number, number][] = [];
    if (sym === "vertical" || sym === "both") points.push([s - x, y]);
    if (sym === "horizontal" || sym === "both") points.push([x, s - y]);
    if (sym === "both") points.push([s - x, s - y]);
    const ids = [id];
    for (const [mx, my] of points) {
      const m = a.locate(mx, my);
      if (m >= 0 && !ids.includes(m)) ids.push(m);
    }
    return ids;
  }, []);

  const paintAt = useCallback(
    (wx: number, wy: number) => {
      const id = live.current.arr.locate(wx, wy);
      if (id < 0) return;
      if (id !== gesture.current.tapCell) gesture.current.tapCell = -1;
      onPaint(withMirrors(id), gesture.current.erase ? null : live.current.colour);
    },
    [onPaint, withMirrors],
  );

  const onPointerDown = (e: React.PointerEvent) => {
    const g = gesture.current;
    g.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    (e.currentTarget as Element).setPointerCapture(e.pointerId);

    if (g.pointers.size === 2) {
      const [a, b] = [...g.pointers.values()];
      g.mode = "pinch";
      g.pinchDist = Math.hypot(a.x - b.x, a.y - b.y);
      g.lastX = (a.x + b.x) / 2;
      g.lastY = (a.y + b.y) / 2;
      return;
    }
    g.lastX = e.clientX;
    g.lastY = e.clientY;

    if (e.button === 1 || tool === "pan" || spaceHeld) {
      g.mode = "pan";
      setPanning(true);
      return;
    }
    if (e.button !== 0) return;

    const [wx, wy] = toWorld(e.clientX, e.clientY);
    const id = arr.locate(wx, wy);
    if (id < 0) return;
    g.erase = tool === "erase";
    g.mode = "stroke";
    onBegin();
    // A tap on a cell that already has this colour clears it. A drag that
    // starts there keeps filling, so shapes can be extended from their edge.
    g.tapCell = !g.erase && cells[id] === colour ? id : -1;
    if (g.tapCell < 0) paintAt(wx, wy);
  };

  const onPointerMove = (e: React.PointerEvent) => {
    const g = gesture.current;
    if (g.pointers.has(e.pointerId)) g.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });

    if (g.mode === "pinch" && g.pointers.size >= 2) {
      const [a, b] = [...g.pointers.values()];
      const dist = Math.hypot(a.x - b.x, a.y - b.y);
      const cx = (a.x + b.x) / 2;
      const cy = (a.y + b.y) / 2;
      const v = live.current.view;
      const rect = wrap.current?.getBoundingClientRect();
      if (v && rect && g.pinchDist > 0) {
        const k = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, (v.k * dist) / g.pinchDist));
        const px = g.lastX - rect.left;
        const py = g.lastY - rect.top;
        onView({
          k,
          x: cx - rect.left - ((px - v.x) / v.k) * k,
          y: cy - rect.top - ((py - v.y) / v.k) * k,
        });
      }
      g.pinchDist = dist;
      g.lastX = cx;
      g.lastY = cy;
      return;
    }

    if (g.mode === "pan") {
      const v = live.current.view;
      if (v) onView({ ...v, x: v.x + e.clientX - g.lastX, y: v.y + e.clientY - g.lastY });
      g.lastX = e.clientX;
      g.lastY = e.clientY;
      return;
    }

    if (g.mode === "stroke") {
      // Sample along the pointer path so a fast drag does not skip cells.
      const dx = e.clientX - g.lastX;
      const dy = e.clientY - g.lastY;
      const steps = Math.max(1, Math.ceil(Math.hypot(dx, dy) / 3));
      for (let i = 1; i <= steps; i++) {
        const [wx, wy] = toWorld(g.lastX + (dx * i) / steps, g.lastY + (dy * i) / steps);
        paintAt(wx, wy);
      }
      g.lastX = e.clientX;
      g.lastY = e.clientY;
    }

    if (e.pointerType === "mouse") {
      const [wx, wy] = toWorld(e.clientX, e.clientY);
      const id = tool === "pan" || spaceHeld ? -1 : arr.locate(wx, wy);
      if (id !== hover) setHover(id);
    }
  };

  const endPointer = (e: React.PointerEvent) => {
    const g = gesture.current;
    g.pointers.delete(e.pointerId);
    if (g.mode === "stroke" && g.tapCell >= 0 && e.type === "pointerup") {
      onPaint(withMirrors(g.tapCell), null);
    }
    g.tapCell = -1;
    if (g.pointers.size === 0) {
      g.mode = "idle";
      setPanning(false);
    } else if (g.mode === "pinch") {
      // One finger left after a pinch: carry on as a pan, never as a stroke.
      const [p] = [...g.pointers.values()];
      g.mode = "pan";
      g.lastX = p.x;
      g.lastY = p.y;
    }
  };

  const grabbing = tool === "pan" || spaceHeld;
  const hoverFace = hover >= 0 ? arr.faces[hover] : null;
  const s = arr.size;
  // Crop marks sit just outside the sheet and stay the same size on screen.
  const tick = view ? 14 / view.k : 0;
  const gap = view ? 6 / view.k : 0;

  return (
    <div
      ref={wrap}
      className="canvas"
      data-cursor={panning ? "grabbing" : grabbing ? "grab" : tool}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={endPointer}
      onPointerCancel={endPointer}
      onPointerLeave={() => setHover(-1)}
      onContextMenu={(e) => e.preventDefault()}
    >
      {view && (
        <svg width="100%" height="100%" role="img" aria-label="Drawing sheet">
          <defs>
            <clipPath id="sheet-clip">
              <rect width={s} height={s} />
            </clipPath>
          </defs>
          <g transform={`translate(${view.x} ${view.y}) scale(${view.k})`}>
            <rect width={s} height={s} className="sheet" />
            <Fills arr={arr} cells={cells} />
            {showGuides && <Guides arr={arr} />}
            {hoverFace && (
              <path d={hoverFace.d} className={tool === "erase" ? "hover hover-erase" : "hover"} />
            )}
            <rect width={s} height={s} className="sheet-edge" />
            <path
              className="crop-marks"
              d={[
                [0, 0, -1, -1],
                [s, 0, 1, -1],
                [s, s, 1, 1],
                [0, s, -1, 1],
              ]
                .map(
                  ([x, y, sx, sy]) =>
                    `M${x + sx * gap} ${y}h${sx * tick}M${x} ${y + sy * gap}v${sy * tick}`,
                )
                .join("")}
            />
          </g>
        </svg>
      )}
    </div>
  );
}
