/**
 * The drawing document, its undo history, and the two ways it is persisted:
 * localStorage (autosave) and the URL hash (share links).
 */
import { DEFAULT_GRID, GRIDS } from "./grids";

/** Colour token that follows the theme on screen and is resolved on export. */
export const INK = "ink";

/** Cell id -> colour. A colour is INK or a #rrggbb string. */
export type Cells = Record<number, string>;

export interface Doc {
  gridId: string;
  /** One drawing per grid, so switching grids never destroys work. */
  drawings: Record<string, Cells>;
}

export interface History {
  past: Doc[];
  present: Doc;
  future: Doc[];
  /** True between pointer-down and the first real change of a stroke. */
  strokeOpen: boolean;
}

export type Action =
  | { type: "begin" }
  | { type: "paint"; ids: number[]; color: string | null }
  | { type: "grid"; id: string }
  | { type: "clear" }
  | { type: "undo" }
  | { type: "redo" }
  | { type: "load"; doc: Doc }
  | { type: "replace"; gridId: string; cells: Cells };

const LIMIT = 200;

export const emptyDoc = (): Doc => ({ gridId: DEFAULT_GRID, drawings: {} });

export const initialHistory = (): History => ({
  past: [],
  present: emptyDoc(),
  future: [],
  strokeOpen: false,
});

export const activeCells = (doc: Doc): Cells => doc.drawings[doc.gridId] ?? {};

const commit = (h: History, next: Doc): History => ({
  past: [...h.past, h.present].slice(-LIMIT),
  present: next,
  future: [],
  strokeOpen: false,
});

export function reducer(h: History, action: Action): History {
  switch (action.type) {
    case "begin":
      return { ...h, strokeOpen: true };

    case "paint": {
      const current = activeCells(h.present);
      let next: Cells | null = null;
      for (const id of action.ids) {
        const had = current[id];
        if (action.color === null ? had === undefined : had === action.color) continue;
        next ??= { ...current };
        if (action.color === null) delete next[id];
        else next[id] = action.color;
      }
      if (!next) return h;
      const doc: Doc = {
        ...h.present,
        drawings: { ...h.present.drawings, [h.present.gridId]: next },
      };
      // Only the first change of a stroke adds an undo step.
      return h.strokeOpen ? commit(h, doc) : { ...h, present: doc };
    }

    case "grid":
      if (action.id === h.present.gridId) return h;
      return { ...h, present: { ...h.present, gridId: action.id } };

    case "clear": {
      if (Object.keys(activeCells(h.present)).length === 0) return h;
      const drawings = { ...h.present.drawings };
      delete drawings[h.present.gridId];
      return commit(h, { ...h.present, drawings });
    }

    case "undo": {
      if (h.past.length === 0) return h;
      const previous = h.past[h.past.length - 1];
      return {
        past: h.past.slice(0, -1),
        present: previous,
        future: [h.present, ...h.future],
        strokeOpen: false,
      };
    }

    case "redo": {
      if (h.future.length === 0) return h;
      const [nextDoc, ...rest] = h.future;
      return { past: [...h.past, h.present], present: nextDoc, future: rest, strokeOpen: false };
    }

    case "load":
      return { past: [], present: action.doc, future: [], strokeOpen: false };

    // Open a shared drawing. It is one undo step, so the drawing it replaces
    // can be brought back.
    case "replace":
      return commit(h, {
        gridId: action.gridId,
        drawings: { ...h.present.drawings, [action.gridId]: action.cells },
      });
  }
}

// ---- share links -------------------------------------------------------------
//
// #g=<grid id>&d=<colour>.<run>.<run>~<colour>.<run>
// A colour is "ink" or six hex digits. A run is a base-36 cell id, or "a-b"
// for a stretch of consecutive ids.

const HEX = /^#[0-9a-f]{6}$/i;

export function encodeCells(cells: Cells): string {
  const byColour = new Map<string, number[]>();
  for (const [key, colour] of Object.entries(cells)) {
    const list = byColour.get(colour) ?? [];
    list.push(Number(key));
    byColour.set(colour, list);
  }
  const groups: string[] = [];
  for (const [colour, ids] of byColour) {
    ids.sort((a, b) => a - b);
    const runs: string[] = [];
    for (let i = 0; i < ids.length; i++) {
      let j = i;
      while (j + 1 < ids.length && ids[j + 1] === ids[j] + 1) j++;
      runs.push(j > i ? `${ids[i].toString(36)}-${ids[j].toString(36)}` : ids[i].toString(36));
      i = j;
    }
    const token = colour === INK ? INK : colour.slice(1).toLowerCase();
    groups.push([token, ...runs].join("."));
  }
  return groups.join("~");
}

export function decodeCells(text: string, cellCount = Infinity): Cells {
  const cells: Cells = {};
  for (const group of text.split("~")) {
    const [token, ...runs] = group.split(".");
    const colour = token === INK ? INK : `#${token}`;
    if (colour !== INK && !HEX.test(colour)) continue;
    for (const run of runs) {
      const [a, b] = run.split("-").map((n) => parseInt(n, 36));
      if (!Number.isFinite(a)) continue;
      const end = Number.isFinite(b) ? b : a;
      for (let id = a; id <= end && id < cellCount && id - a < 5000; id++) cells[id] = colour;
    }
  }
  return cells;
}

export function encodeShare(doc: Doc): string {
  const data = encodeCells(activeCells(doc));
  return `g=${doc.gridId}${data ? `&d=${data}` : ""}`;
}

/** Returns the shared grid and cells, or null when the hash holds no drawing. */
export function decodeShare(hash: string): { gridId: string; cells: Cells } | null {
  const params = new URLSearchParams(hash.replace(/^#/, ""));
  const gridId = params.get("g");
  if (!gridId || !GRIDS.some((g) => g.id === gridId)) return null;
  return { gridId, cells: decodeCells(params.get("d") ?? "") };
}

// ---- autosave ----------------------------------------------------------------

const STORAGE_KEY = "gridmark:doc:v1";

export function saveDoc(doc: Doc): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(doc));
  } catch {
    // Storage can be full or blocked. The drawing still lives in memory.
  }
}

export function loadDoc(): Doc | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<Doc>;
    if (typeof parsed.gridId !== "string" || typeof parsed.drawings !== "object") return null;
    const gridId = GRIDS.some((g) => g.id === parsed.gridId) ? parsed.gridId : DEFAULT_GRID;
    const drawings: Record<string, Cells> = {};
    for (const [id, cells] of Object.entries(parsed.drawings ?? {})) {
      if (!GRIDS.some((g) => g.id === id) || typeof cells !== "object" || !cells) continue;
      const clean: Cells = {};
      for (const [cell, colour] of Object.entries(cells as Record<string, unknown>)) {
        if (typeof colour === "string" && (colour === INK || HEX.test(colour))) {
          clean[Number(cell)] = colour;
        }
      }
      drawings[id] = clean;
    }
    return { gridId, drawings };
  } catch {
    return null;
  }
}
