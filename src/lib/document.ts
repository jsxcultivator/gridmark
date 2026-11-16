/**
 * The drawing document, its undo history, and the two ways it is persisted:
 * localStorage (autosave) and the URL hash (share links).
 */
import { DEFAULT_GRID, GRIDS } from "./grids";
import { piecesByCell, rebase, type Cells } from "./overlay";

export type { Cells };

/** Colour token that follows the theme on screen and is resolved on export. */
export const INK = "ink";

export interface Doc {
  /** The grid shown on the sheet. Always part of `basis`. */
  gridId: string;
  /** The grids the drawing is cut along. See overlay.ts. */
  basis: string[];
  /** Filled pieces of the basis. */
  cells: Cells;
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
  /** Fill or clear whole cells of the grid on the sheet. */
  | { type: "paint"; ids: number[]; color: string | null }
  | { type: "grid"; id: string }
  | { type: "clear" }
  | { type: "undo" }
  | { type: "redo" }
  | { type: "load"; doc: Doc }
  | { type: "replace"; doc: Doc };

const LIMIT = 200;
const MAX_BASIS = 8;
const known = (id: unknown): id is string =>
  typeof id === "string" && GRIDS.some((g) => g.id === id);

export const emptyDoc = (): Doc => ({ gridId: DEFAULT_GRID, basis: [DEFAULT_GRID], cells: {} });

export const initialHistory = (): History => ({
  past: [],
  present: emptyDoc(),
  future: [],
  strokeOpen: false,
});

/** Show another grid. The drawing is carried over unchanged. */
export function withGrid(doc: Doc, gridId: string): Doc {
  return { gridId, ...rebase(doc.cells, doc.basis, gridId) };
}

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
      const { gridId, basis, cells } = h.present;
      const pieces = piecesByCell(gridId, basis);
      let next: Cells | null = null;
      for (const id of action.ids) {
        for (const piece of pieces[id] ?? []) {
          const had = cells[piece];
          if (action.color === null ? had === undefined : had === action.color) continue;
          next ??= { ...cells };
          if (action.color === null) delete next[piece];
          else next[piece] = action.color;
        }
      }
      if (!next) return h;
      const doc: Doc = { ...h.present, cells: next };
      // Only the first change of a stroke adds an undo step.
      return h.strokeOpen ? commit(h, doc) : { ...h, present: doc };
    }

    case "grid":
      if (action.id === h.present.gridId) return h;
      return { ...h, present: withGrid(h.present, action.id) };

    case "clear":
      if (Object.keys(h.present.cells).length === 0) return h;
      return commit(h, { gridId: h.present.gridId, basis: [h.present.gridId], cells: {} });

    case "undo": {
      if (h.past.length === 0) return h;
      const previous = h.past[h.past.length - 1];
      return {
        past: h.past.slice(0, -1),
        // Undo changes the drawing, not which grid is on the sheet.
        present: withGrid(previous, h.present.gridId),
        future: [h.present, ...h.future],
        strokeOpen: false,
      };
    }

    case "redo": {
      if (h.future.length === 0) return h;
      const [nextDoc, ...rest] = h.future;
      return {
        past: [...h.past, h.present],
        present: withGrid(nextDoc, h.present.gridId),
        future: rest,
        strokeOpen: false,
      };
    }

    case "load":
      return { past: [], present: action.doc, future: [], strokeOpen: false };

    // Open a shared drawing. It is one undo step, so the drawing it replaces
    // can be brought back.
    case "replace":
      return commit(h, action.doc);
  }
}

// ---- share links -------------------------------------------------------------
//
// #g=<grid on the sheet>&b=<basis grid>+<basis grid>&d=<colour>.<run>.<run>~<colour>.<run>
// `b` is left out when the basis is just the grid on the sheet. A colour is
// "ink" or six hex digits. A run is a base-36 piece id, or "a-b" for a stretch
// of consecutive ids.

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

export function decodeCells(text: string): Cells {
  const cells: Cells = {};
  for (const group of text.split("~")) {
    const [token, ...runs] = group.split(".");
    const colour = token === INK ? INK : `#${token}`;
    if (colour !== INK && !HEX.test(colour)) continue;
    for (const run of runs) {
      const [a, b] = run.split("-").map((n) => parseInt(n, 36));
      if (!Number.isFinite(a)) continue;
      const end = Number.isFinite(b) ? b : a;
      for (let id = a; id <= end && id - a < 20000; id++) cells[id] = colour;
    }
  }
  return cells;
}

export function encodeShare(doc: Doc): string {
  const data = encodeCells(doc.cells);
  const basis = doc.basis.length === 1 && doc.basis[0] === doc.gridId ? "" : `&b=${doc.basis.join("+")}`;
  return `g=${doc.gridId}${data ? `${basis}&d=${data}` : ""}`;
}

/** Returns the shared document, or null when the hash holds no drawing. */
export function decodeShare(hash: string): Doc | null {
  // "+" would be read as a space by URLSearchParams, so split by hand.
  const params = new Map<string, string>();
  for (const part of hash.replace(/^#/, "").split("&")) {
    const at = part.indexOf("=");
    if (at > 0) params.set(part.slice(0, at), decodeURIComponent(part.slice(at + 1)));
  }
  const gridId = params.get("g");
  if (!known(gridId)) return null;
  const cells = decodeCells(params.get("d") ?? "");
  if (Object.keys(cells).length === 0) return { gridId, basis: [gridId], cells: {} };
  const basis = (params.get("b") ?? gridId).split(/[+ ]/).filter(known).slice(0, MAX_BASIS);
  if (basis.length === 0) return null;
  // Make sure the grid on the sheet is in the basis, whatever the link said.
  return withGrid({ gridId: basis[0], basis, cells }, gridId);
}

// ---- autosave ----------------------------------------------------------------

const STORAGE_KEY = "gridmark:doc:v2";
const OLD_STORAGE_KEY = "gridmark:doc:v1";

export function saveDoc(doc: Doc): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(doc));
  } catch {
    // Storage can be full or blocked. The drawing still lives in memory.
  }
}

function cleanCells(input: unknown): Cells {
  const clean: Cells = {};
  if (typeof input !== "object" || !input) return clean;
  for (const [cell, colour] of Object.entries(input as Record<string, unknown>)) {
    if (typeof colour === "string" && (colour === INK || HEX.test(colour))) {
      clean[Number(cell)] = colour;
    }
  }
  return clean;
}

export function loadDoc(): Doc | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<Doc>;
      if (!known(parsed.gridId) || !Array.isArray(parsed.basis)) return null;
      const basis = parsed.basis.filter(known).slice(0, MAX_BASIS);
      const cells = cleanCells(parsed.cells);
      if (basis.length === 0 || Object.keys(cells).length === 0) {
        return { gridId: parsed.gridId, basis: [parsed.gridId], cells: {} };
      }
      return withGrid({ gridId: basis[0], basis, cells }, parsed.gridId);
    }

    // Before version 2 each grid had its own drawing. Keep the one that was
    // on the sheet, or failing that the first one that is not empty.
    const old = localStorage.getItem(OLD_STORAGE_KEY);
    if (!old) return null;
    const parsed = JSON.parse(old) as { gridId?: unknown; drawings?: Record<string, unknown> };
    const drawings = parsed.drawings ?? {};
    const order = [parsed.gridId, ...Object.keys(drawings)].filter(known);
    for (const id of order) {
      const cells = cleanCells(drawings[id]);
      if (Object.keys(cells).length > 0) return { gridId: id, basis: [id], cells };
    }
    return known(parsed.gridId) ? { gridId: parsed.gridId, basis: [parsed.gridId], cells: {} } : null;
  } catch {
    return null;
  }
}
