"use client";

import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from "react";
import {
  Check,
  Copy,
  Download,
  Eraser,
  Eye,
  EyeOff,
  FlipHorizontal2,
  FlipVertical2,
  Hand,
  Link2,
  Maximize,
  Minus,
  Moon,
  Pencil,
  Plus,
  Redo2,
  Square,
  Sun,
  Trash2,
  Undo2,
  LayoutGrid,
} from "lucide-react";
import Canvas, { type Symmetry, type Tool, type View } from "./Canvas";
import GridLibrary from "./GridLibrary";
import { gridById } from "@/lib/grids";
import { arrangementFor, wholeCells } from "@/lib/overlay";
import {
  INK,
  decodeShare,
  encodeShare,
  initialHistory,
  loadDoc,
  reducer,
  saveDoc,
} from "@/lib/document";
import { DEFAULT_EXPORT, buildSvg, download, svgToPng, type ExportOptions } from "@/lib/export";

export const REPO_URL = "https://github.com/jsxcultivator/gridmark";

const PALETTE = [
  INK,
  "#8c9197",
  "#ffc83d",
  "#f0803c",
  "#e4472e",
  "#d93a6a",
  "#8a5cf6",
  "#2f6fed",
  "#1fa7a0",
  "#3da35d",
];

const SYMMETRIES: { id: Symmetry; label: string }[] = [
  { id: "none", label: "No mirror" },
  { id: "vertical", label: "Mirror left and right" },
  { id: "horizontal", label: "Mirror top and bottom" },
  { id: "both", label: "Mirror both ways" },
];

const PNG_SIZES = [512, 1024, 2048, 4096];

type Theme = "blueprint" | "paper";
type Panel = "colour" | "mirror" | "export" | null;

function fitView(w: number, h: number, size: number): View {
  const k = (Math.min(w, h) * 0.84) / size;
  return { k, x: (w - size * k) / 2, y: (h - size * k) / 2 };
}

function SymmetryIcon({ mode }: { mode: Symmetry }) {
  // Lucide names these after the axis the arrows travel along, so the icon
  // that shows a left/right mirror is FlipVertical2.
  if (mode === "vertical") return <FlipVertical2 size={18} />;
  if (mode === "horizontal") return <FlipHorizontal2 size={18} />;
  if (mode === "both") return <LayoutGrid size={18} />;
  return <Square size={18} />;
}

export default function Editor() {
  const [history, dispatch] = useReducer(reducer, undefined, initialHistory);
  const doc = history.present;
  const grid = gridById(doc.gridId);
  // The grid on the sheet, and the drawing, which may span several grids.
  const arr = useMemo(() => arrangementFor([doc.gridId]), [doc.gridId]);
  const pieces = useMemo(() => arrangementFor(doc.basis), [doc.basis]);
  const fills = doc.cells;
  const cells = useMemo(
    () => wholeCells(doc.cells, doc.gridId, doc.basis),
    [doc.cells, doc.gridId, doc.basis],
  );

  const [ready, setReady] = useState(false);
  const [tool, setTool] = useState<Tool>("draw");
  const [colour, setColour] = useState<string>(INK);
  const [symmetry, setSymmetry] = useState<Symmetry>("none");
  const [showGuides, setShowGuides] = useState(true);
  const [theme, setTheme] = useState<Theme>("blueprint");
  const [panel, setPanel] = useState<Panel>(null);
  const [libraryOpen, setLibraryOpen] = useState(false);
  const [view, setView] = useState<View | null>(null);
  const [size, setSize] = useState({ w: 0, h: 0 });
  const [toast, setToast] = useState<string | null>(null);
  const [options, setOptions] = useState<ExportOptions>(DEFAULT_EXPORT);
  const [format, setFormat] = useState<"svg" | "png">("svg");
  const [pngSize, setPngSize] = useState(1024);

  const filled = Object.keys(fills).length;
  const wholeCount = Object.keys(cells).length;
  const usesInk = useMemo(() => Object.values(fills).includes(INK), [fills]);

  // ---- load and save ---------------------------------------------------------
  useEffect(() => {
    const stored = loadDoc();
    if (stored) dispatch({ type: "load", doc: stored });

    // A share link can arrive with the page or later, when someone pastes one
    // into the address bar of a tab that is already open.
    const openShared = () => {
      const shared = decodeShare(window.location.hash);
      if (!shared) return;
      if (Object.keys(shared.cells).length > 0) {
        dispatch({ type: "replace", doc: shared });
      } else {
        dispatch({ type: "grid", id: shared.gridId });
      }
      // The link has done its job. Leaving it would overwrite later edits on reload.
      window.history.replaceState(null, "", window.location.pathname + window.location.search);
    };
    openShared();
    window.addEventListener("hashchange", openShared);

    setTheme(document.documentElement.dataset.theme === "paper" ? "paper" : "blueprint");
    setReady(true);
    return () => window.removeEventListener("hashchange", openShared);
  }, []);

  useEffect(() => {
    if (ready) saveDoc(doc);
  }, [doc, ready]);

  useEffect(() => {
    if (!ready) return;
    document.documentElement.dataset.theme = theme;
    try {
      localStorage.setItem("gridmark:theme", theme);
    } catch {}
  }, [theme, ready]);

  // ---- view ------------------------------------------------------------------
  const fit = useMemo(
    () => (size.w > 0 && size.h > 0 ? fitView(size.w, size.h, arr.size) : null),
    [size, arr.size],
  );
  useEffect(() => {
    if (!view && fit) setView(fit);
  }, [view, fit]);

  const zoomBy = useCallback(
    (factor: number) => {
      setView((v) => {
        if (!v) return v;
        const k = Math.min(40, Math.max(0.4, v.k * factor));
        const cx = size.w / 2;
        const cy = size.h / 2;
        return { k, x: cx - ((cx - v.x) / v.k) * k, y: cy - ((cy - v.y) / v.k) * k };
      });
    },
    [size],
  );
  const zoomPercent = view && fit ? Math.round((view.k / fit.k) * 100) : 100;

  // ---- feedback ----------------------------------------------------------------
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const say = useCallback((message: string) => {
    setToast(message);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 2600);
  }, []);

  // ---- actions -----------------------------------------------------------------
  const onBegin = useCallback(() => dispatch({ type: "begin" }), []);
  const onPaint = useCallback(
    (ids: number[], c: string | null) => dispatch({ type: "paint", ids, color: c }),
    [],
  );

  const clear = useCallback(() => {
    if (filled === 0) return;
    dispatch({ type: "clear" });
    say("Sheet cleared. Undo brings it back.");
  }, [filled, say]);

  const copyLink = useCallback(async () => {
    const url = `${window.location.origin}${window.location.pathname}#${encodeShare(doc)}`;
    try {
      await navigator.clipboard.writeText(url);
      say("Link copied. Anyone who opens it gets this drawing.");
    } catch {
      window.prompt("Copy this link", url);
    }
  }, [doc, say]);

  const exported = useMemo(
    () => (panel === "export" && filled > 0 ? buildSvg(pieces, fills, options) : null),
    [panel, filled, pieces, fills, options],
  );

  const downloadFile = useCallback(async () => {
    if (filled === 0) return;
    const result = buildSvg(pieces, fills, options);
    const name = `gridmark-${doc.gridId}`;
    try {
      if (format === "svg") {
        download(new Blob([result.svg], { type: "image/svg+xml" }), `${name}.svg`);
      } else {
        download(await svgToPng(result, pngSize), `${name}.png`);
      }
      say(`Downloaded ${name}.${format}`);
    } catch (err) {
      say(err instanceof Error ? err.message : "The download failed.");
    }
  }, [filled, pieces, fills, options, doc.gridId, format, pngSize, say]);

  const copySvg = useCallback(async () => {
    if (filled === 0) return;
    try {
      await navigator.clipboard.writeText(buildSvg(pieces, fills, options).svg);
      say("SVG copied. Paste it into Figma, Illustrator or your code.");
    } catch {
      say("The browser blocked clipboard access. Download the SVG instead.");
    }
  }, [filled, pieces, fills, options, say]);

  // ---- keyboard ----------------------------------------------------------------
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null;
      if (el && (el.tagName === "INPUT" || el.tagName === "SELECT" || el.tagName === "TEXTAREA")) return;
      const mod = e.ctrlKey || e.metaKey;
      const key = e.key.toLowerCase();
      if (mod && key === "z") {
        e.preventDefault();
        dispatch({ type: e.shiftKey ? "redo" : "undo" });
      } else if (mod && key === "y") {
        e.preventDefault();
        dispatch({ type: "redo" });
      } else if (mod || e.altKey) {
        return;
      } else if (key === "escape") setPanel(null);
      else if (key === "v" || key === "b") setTool("draw");
      else if (key === "e") setTool("erase");
      else if (key === "h") setTool("pan");
      else if (key === "g") setShowGuides((s) => !s);
      else if (key === "m")
        setSymmetry((s) => SYMMETRIES[(SYMMETRIES.findIndex((x) => x.id === s) + 1) % 4].id);
      else if (key === "=" || key === "+") zoomBy(1.25);
      else if (key === "-") zoomBy(0.8);
      else if (key === "0") setView(fit);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [zoomBy, fit]);

  // Close an open panel when the pointer goes down anywhere outside it.
  useEffect(() => {
    if (!panel) return;
    const close = (e: PointerEvent) => {
      const t = e.target as Element | null;
      if (t && t.closest("[data-panel]")) return;
      setPanel(null);
    };
    window.addEventListener("pointerdown", close, true);
    return () => window.removeEventListener("pointerdown", close, true);
  }, [panel]);

  const toggle = (p: Exclude<Panel, null>) => setPanel((cur) => (cur === p ? null : p));
  const swatch = (c: string) => (c === INK ? "var(--ink)" : c);
  const inkOnDark = options.ink.toLowerCase() === "#ffffff";

  return (
    <div className="app" data-library={libraryOpen ? "open" : "closed"}>
      <header className="topbar">
        <a className="brand" href={REPO_URL} target="_blank" rel="noreferrer" title="Gridmark on GitHub">
          <svg viewBox="0 0 32 32" aria-hidden="true">
            <path className="brand-a" d="M7 7h9a9 9 0 0 1 9 9H16V7zM7 16h9v9a9 9 0 0 1-9-9z" />
            <path className="brand-b" d="M16 16h9v9h-9z" />
          </svg>
          Gridmark
        </a>
        <div className="topbar-actions">
          <button type="button" className="btn" onClick={copyLink} title="Copy a link to this drawing">
            <Link2 size={16} />
            <span>Copy link</span>
          </button>
          <div className="anchor" data-panel>
            <button
              type="button"
              className="btn btn-primary"
              aria-expanded={panel === "export"}
              onClick={() => toggle("export")}
            >
              <Download size={16} />
              <span>Export</span>
            </button>
            {panel === "export" && (
              <div className="panel panel-export" role="dialog" aria-label="Export">
                {filled === 0 ? (
                  <p className="empty">Nothing to export yet. Fill a few cells first.</p>
                ) : (
                  <>
                    <div
                      className="preview"
                      data-dark={options.background ? undefined : inkOnDark ? "true" : "false"}
                      dangerouslySetInnerHTML={{ __html: exported?.svg ?? "" }}
                    />
                    <div className="field">
                      <span>Format</span>
                      <div className="seg">
                        <button type="button" aria-pressed={format === "svg"} onClick={() => setFormat("svg")}>
                          SVG
                        </button>
                        <button type="button" aria-pressed={format === "png"} onClick={() => setFormat("png")}>
                          PNG
                        </button>
                      </div>
                    </div>
                    {format === "png" && (
                      <label className="field">
                        <span>Longest side</span>
                        <select value={pngSize} onChange={(e) => setPngSize(Number(e.target.value))}>
                          {PNG_SIZES.map((s) => (
                            <option key={s} value={s}>
                              {s} px
                            </option>
                          ))}
                        </select>
                      </label>
                    )}
                    <div className="field">
                      <span>Crop</span>
                      <div className="seg">
                        <button
                          type="button"
                          aria-pressed={options.crop === "drawing"}
                          onClick={() => setOptions((o) => ({ ...o, crop: "drawing" }))}
                        >
                          Trim to drawing
                        </button>
                        <button
                          type="button"
                          aria-pressed={options.crop === "artboard"}
                          onClick={() => setOptions((o) => ({ ...o, crop: "artboard" }))}
                        >
                          Full sheet
                        </button>
                      </div>
                    </div>
                    {options.crop === "drawing" && (
                      <label className="field">
                        <span>Margin</span>
                        <input
                          type="range"
                          min={0}
                          max={60}
                          step={1}
                          value={options.padding}
                          onChange={(e) => setOptions((o) => ({ ...o, padding: Number(e.target.value) }))}
                        />
                      </label>
                    )}
                    {usesInk && (
                      <div className="field">
                        <span>Ink</span>
                        <div className="seg">
                          <button
                            type="button"
                            aria-pressed={!inkOnDark}
                            onClick={() => setOptions((o) => ({ ...o, ink: "#111111" }))}
                          >
                            Black
                          </button>
                          <button
                            type="button"
                            aria-pressed={inkOnDark}
                            onClick={() => setOptions((o) => ({ ...o, ink: "#ffffff" }))}
                          >
                            White
                          </button>
                        </div>
                      </div>
                    )}
                    <div className="field">
                      <span>Background</span>
                      <div className="seg">
                        <button
                          type="button"
                          aria-pressed={options.background === null}
                          onClick={() => setOptions((o) => ({ ...o, background: null }))}
                        >
                          Transparent
                        </button>
                        <button
                          type="button"
                          aria-pressed={options.background !== null}
                          onClick={() =>
                            setOptions((o) => ({ ...o, background: o.background ?? (inkOnDark ? "#12305a" : "#ffffff") }))
                          }
                        >
                          Solid
                        </button>
                        {options.background !== null && (
                          <input
                            type="color"
                            aria-label="Background colour"
                            value={options.background}
                            onChange={(e) => setOptions((o) => ({ ...o, background: e.target.value }))}
                          />
                        )}
                      </div>
                    </div>
                    <div className="panel-actions">
                      <button type="button" className="btn btn-primary" onClick={downloadFile}>
                        <Download size={16} />
                        Download {format.toUpperCase()}
                      </button>
                      <button type="button" className="btn" onClick={copySvg}>
                        <Copy size={16} />
                        Copy SVG
                      </button>
                    </div>
                  </>
                )}
              </div>
            )}
          </div>
          <button
            type="button"
            className="icon-btn"
            onClick={() => setTheme((t) => (t === "blueprint" ? "paper" : "blueprint"))}
            title={theme === "blueprint" ? "Switch to paper" : "Switch to blueprint"}
            aria-label={theme === "blueprint" ? "Switch to paper theme" : "Switch to blueprint theme"}
          >
            {theme === "blueprint" ? <Sun size={18} /> : <Moon size={18} />}
          </button>
        </div>
      </header>

      <div className="rail" role="toolbar" aria-label="Tools">
        <div className="group">
          <button type="button" className="icon-btn" aria-pressed={tool === "draw"} onClick={() => setTool("draw")} title="Draw (V)" aria-label="Draw">
            <Pencil size={18} />
          </button>
          <button type="button" className="icon-btn" aria-pressed={tool === "erase"} onClick={() => setTool("erase")} title="Erase (E)" aria-label="Erase">
            <Eraser size={18} />
          </button>
          <button type="button" className="icon-btn" aria-pressed={tool === "pan"} onClick={() => setTool("pan")} title="Move the sheet (H, or hold Space)" aria-label="Move the sheet">
            <Hand size={18} />
          </button>
        </div>

        <div className="group">
          <div className="anchor" data-panel>
            <button
              type="button"
              className="icon-btn"
              aria-expanded={panel === "colour"}
              onClick={() => toggle("colour")}
              title="Colour"
              aria-label="Colour"
            >
              <span className="swatch" style={{ background: swatch(colour) }} />
            </button>
            {panel === "colour" && (
              <div className="panel panel-colour" role="dialog" aria-label="Colour">
                <div className="swatches">
                  {PALETTE.map((c) => (
                    <button
                      key={c}
                      type="button"
                      className="swatch-btn"
                      aria-pressed={colour === c}
                      aria-label={c === INK ? "Ink, follows the theme" : c}
                      title={c === INK ? "Ink. White on blueprint, black on paper." : c}
                      onClick={() => {
                        setColour(c);
                        setTool("draw");
                        setPanel(null);
                      }}
                    >
                      <span className="swatch" style={{ background: swatch(c) }} />
                      {colour === c && <Check size={12} />}
                    </button>
                  ))}
                </div>
                <label className="field">
                  <span>Custom</span>
                  <input
                    type="color"
                    value={colour === INK ? "#ffffff" : colour}
                    onChange={(e) => {
                      setColour(e.target.value.toLowerCase());
                      setTool("draw");
                    }}
                  />
                </label>
              </div>
            )}
          </div>
          <div className="anchor" data-panel>
            <button
              type="button"
              className="icon-btn"
              aria-expanded={panel === "mirror"}
              data-on={symmetry !== "none"}
              onClick={() => toggle("mirror")}
              title="Mirror (M)"
              aria-label="Mirror"
            >
              <SymmetryIcon mode={symmetry === "none" ? "vertical" : symmetry} />
            </button>
            {panel === "mirror" && (
              <div className="panel panel-menu" role="menu" aria-label="Mirror">
                {SYMMETRIES.map((s) => (
                  <button
                    key={s.id}
                    type="button"
                    role="menuitemradio"
                    aria-checked={symmetry === s.id}
                    onClick={() => {
                      setSymmetry(s.id);
                      setPanel(null);
                    }}
                  >
                    <SymmetryIcon mode={s.id} />
                    {s.label}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="group">
          <button type="button" className="icon-btn" disabled={history.past.length === 0} onClick={() => dispatch({ type: "undo" })} title="Undo (Ctrl+Z)" aria-label="Undo">
            <Undo2 size={18} />
          </button>
          <button type="button" className="icon-btn" disabled={history.future.length === 0} onClick={() => dispatch({ type: "redo" })} title="Redo (Ctrl+Shift+Z)" aria-label="Redo">
            <Redo2 size={18} />
          </button>
          <button type="button" className="icon-btn" disabled={filled === 0} onClick={clear} title="Clear the sheet" aria-label="Clear the sheet">
            <Trash2 size={18} />
          </button>
        </div>

        <div className="group">
          <button
            type="button"
            className="icon-btn"
            aria-pressed={!showGuides}
            onClick={() => setShowGuides((s) => !s)}
            title={showGuides ? "Hide guides (G)" : "Show guides (G)"}
            aria-label={showGuides ? "Hide guides" : "Show guides"}
          >
            {showGuides ? <Eye size={18} /> : <EyeOff size={18} />}
          </button>
        </div>
      </div>

      <main className="stage">
        <Canvas
          arr={arr}
          cells={cells}
          pieces={pieces}
          fills={fills}
          tool={tool}
          colour={colour}
          symmetry={symmetry}
          showGuides={showGuides}
          view={view}
          onView={setView}
          onSize={setSize}
          onBegin={onBegin}
          onPaint={onPaint}
        />
        <footer className="status">
          <button type="button" className="grid-name" onClick={() => setLibraryOpen((o) => !o)} title="Choose a grid">
            <LayoutGrid size={15} />
            {grid.name}
          </button>
          <p>
            {filled === 0
              ? "Click a cell to fill it. Drag to fill several."
              : `${wholeCount} of ${arr.faces.length} cells filled`}
          </p>
          <div className="zoom">
            <button type="button" className="icon-btn small" onClick={() => zoomBy(0.8)} title="Zoom out (-)" aria-label="Zoom out">
              <Minus size={15} />
            </button>
            <button type="button" className="zoom-value" onClick={() => setView(fit)} title="Fit the sheet (0)">
              {zoomPercent}%
            </button>
            <button type="button" className="icon-btn small" onClick={() => zoomBy(1.25)} title="Zoom in (+)" aria-label="Zoom in">
              <Plus size={15} />
            </button>
            <button type="button" className="icon-btn small" onClick={() => setView(fit)} title="Fit the sheet (0)" aria-label="Fit the sheet">
              <Maximize size={15} />
            </button>
          </div>
        </footer>
        {toast && (
          <div className="toast" role="status">
            {toast}
          </div>
        )}
      </main>

      {libraryOpen && <div className="scrim" onClick={() => setLibraryOpen(false)} />}
      <aside className="side">
        <GridLibrary
          activeId={doc.gridId}
          onPick={(id) => {
            dispatch({ type: "grid", id });
            setLibraryOpen(false);
          }}
        />
        <p className="side-note">
          {grid.hint} Your drawing stays when you change grids. Gridmark is free and open source.{" "}
          <a href={REPO_URL} target="_blank" rel="noreferrer">
            Read the source
          </a>{" "}
          or add your own grid.
        </p>
      </aside>
    </div>
  );
}
