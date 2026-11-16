/**
 * One drawing across many grids.
 *
 * A drawing is stored against a "basis": the ordered list of grids it was
 * drawn on. The guides of all those grids are laid over each other and cut
 * into pieces, and the drawing is the set of pieces that are filled. A cell of
 * any grid in the basis is a whole number of pieces, so it can be filled or
 * cleared exactly, whatever was drawn before on another grid.
 */
import { buildArrangement, type Arrangement } from "./geometry";
import { gridById } from "./grids";

/** Piece id -> colour. */
export type Cells = Record<number, string>;

const arrangements = new Map<string, Arrangement>();

/** The pieces made by laying the given grids over each other. */
export function arrangementFor(basis: string[]): Arrangement {
  const key = basis.join("+");
  let a = arrangements.get(key);
  if (!a) {
    a = buildArrangement(basis.flatMap((id) => gridById(id).build()));
    arrangements.set(key, a);
  }
  return a;
}

const childCache = new Map<string, number[][]>();

/** For each cell of one grid, the pieces of the basis that lie inside it. */
export function piecesByCell(gridId: string, basis: string[]): number[][] {
  const key = `${gridId}|${basis.join("+")}`;
  let out = childCache.get(key);
  if (!out) {
    const grid = arrangementFor([gridId]);
    const pieces = arrangementFor(basis);
    out = grid.faces.map(() => []);
    for (const f of pieces.faces) {
      const cell = grid.locate(f.point[0], f.point[1]);
      if (cell >= 0) out[cell].push(f.id);
    }
    childCache.set(key, out);
  }
  return out;
}

/** Carry a drawing over to a basis that cuts the sheet at least as finely. */
function refine(cells: Cells, from: string[], to: string[]): Cells {
  const src = arrangementFor(from);
  const dst = arrangementFor(to);
  const out: Cells = {};
  for (const f of dst.faces) {
    const colour = cells[src.locate(f.point[0], f.point[1])];
    if (colour !== undefined) out[f.id] = colour;
  }
  return out;
}

/**
 * Try to express a drawing on a coarser basis. Works only if every piece of
 * the coarser basis is filled with a single colour or not at all.
 */
function coarsen(cells: Cells, from: string[], to: string[]): Cells | null {
  const src = arrangementFor(from);
  const dst = arrangementFor(to);
  const seen = new Map<number, string | undefined>();
  for (const f of src.faces) {
    const target = dst.locate(f.point[0], f.point[1]);
    if (target < 0) return null;
    const colour = cells[f.id];
    if (!seen.has(target)) seen.set(target, colour);
    else if (seen.get(target) !== colour) return null;
  }
  const out: Cells = {};
  for (const [id, colour] of seen) if (colour !== undefined) out[id] = colour;
  return out;
}

/**
 * Re-express a drawing so that `gridId` is part of its basis, and drop any
 * other grid the drawing no longer depends on. The picture does not change.
 */
export function rebase(
  cells: Cells,
  basis: string[],
  gridId: string,
): { basis: string[]; cells: Cells } {
  if (Object.keys(cells).length === 0) return { basis: [gridId], cells: {} };

  let nextBasis = basis;
  let nextCells = cells;
  if (!nextBasis.includes(gridId)) {
    const wider = [...nextBasis, gridId];
    nextCells = refine(nextCells, nextBasis, wider);
    nextBasis = wider;
  }
  for (const id of [...nextBasis]) {
    if (id === gridId) continue;
    const without = nextBasis.filter((b) => b !== id);
    const coarser = coarsen(nextCells, nextBasis, without);
    if (coarser) {
      nextBasis = without;
      nextCells = coarser;
    }
  }
  return { basis: nextBasis, cells: nextCells };
}

/**
 * The drawing as seen from one grid: the colour of each of its cells that is
 * filled edge to edge with a single colour.
 */
export function wholeCells(cells: Cells, gridId: string, basis: string[]): Cells {
  const out: Cells = {};
  piecesByCell(gridId, basis).forEach((pieces, cell) => {
    if (pieces.length === 0) return;
    const colour = cells[pieces[0]];
    if (colour === undefined) return;
    for (const piece of pieces) if (cells[piece] !== colour) return;
    out[cell] = colour;
  });
  return out;
}
