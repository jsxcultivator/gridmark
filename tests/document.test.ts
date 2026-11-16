import { describe, expect, it } from "vitest";
import {
  INK,
  decodeCells,
  decodeShare,
  encodeCells,
  encodeShare,
  initialHistory,
  reducer,
  type Cells,
  type Doc,
  type History,
} from "@/lib/document";
import { arrangementFor, piecesByCell, wholeCells } from "@/lib/overlay";
import { BOARD, buildArrangement } from "@/lib/geometry";
import { buildSvg, DEFAULT_EXPORT } from "@/lib/export";
import { GRIDS, squares } from "@/lib/grids";

const run = (h: History, ...actions: Parameters<typeof reducer>[1][]) =>
  actions.reduce(reducer, h);

const area = (doc: Doc) => {
  const arr = arrangementFor(doc.basis);
  return Object.keys(doc.cells).reduce((sum, id) => sum + arr.faces[Number(id)].area, 0);
};
const cellAt = (gridId: string, x: number, y: number) => arrangementFor([gridId]).locate(x, y);
const stroke = (h: History, ids: number[], color: string | null) =>
  run(h, { type: "begin" }, { type: "paint", ids, color });

describe("share links", () => {
  it("round-trips cells and colours", () => {
    const cells: Cells = { 0: INK, 1: INK, 2: INK, 9: "#ff0000", 40: "#ff0000", 41: "#ff0000", 700: INK };
    expect(decodeCells(encodeCells(cells))).toEqual(cells);
  });

  it("packs consecutive cells into runs", () => {
    expect(encodeCells({ 10: INK, 11: INK, 12: INK, 20: INK })).toBe("ink.a-c.k");
  });

  it("ignores junk", () => {
    expect(decodeCells("zzzzzz.1~ink.!!~nothex.4")).toEqual({});
    expect(decodeShare("#g=not-a-grid&d=ink.1")).toBeNull();
    expect(decodeShare("")).toBeNull();
  });

  it("round-trips a drawing made on one grid", () => {
    const h = stroke(run(initialHistory(), { type: "grid", id: "dial" }), [3, 4], "#2f6fed");
    const link = encodeShare(h.present);
    expect(link).toBe("g=dial&d=2f6fed.3-4");
    expect(decodeShare("#" + link)).toEqual(h.present);
  });

  it("round-trips a drawing made on two grids", () => {
    let h = stroke(initialHistory(), [cellAt("square", 20, 20)], INK);
    h = reducer(h, { type: "grid", id: "flower" });
    h = stroke(h, [cellAt("flower", 150, 150)], "#ff0000");
    const link = encodeShare(h.present);
    expect(link).toContain("&b=square+flower&");
    expect(decodeShare("#" + link)).toEqual(h.present);
  });
});

describe("history", () => {
  it("makes one undo step per stroke", () => {
    let h = run(
      initialHistory(),
      { type: "begin" },
      { type: "paint", ids: [1], color: INK },
      { type: "paint", ids: [2], color: INK },
      { type: "paint", ids: [3], color: INK },
    );
    expect(Object.keys(h.present.cells)).toHaveLength(3);
    expect(h.past).toHaveLength(1);
    h = reducer(h, { type: "undo" });
    expect(h.present.cells).toEqual({});
    h = reducer(h, { type: "redo" });
    expect(Object.keys(h.present.cells)).toHaveLength(3);
  });

  it("does not record strokes that change nothing", () => {
    const h = stroke(initialHistory(), [5], null);
    expect(h.past).toHaveLength(0);
  });

  it("clear is undoable", () => {
    let h = run(stroke(initialHistory(), [1], INK), { type: "clear" });
    expect(h.present.cells).toEqual({});
    h = reducer(h, { type: "undo" });
    expect(h.present.cells).toEqual({ 1: INK });
  });

  it("undo keeps the grid that is on the sheet", () => {
    let h = stroke(initialHistory(), [cellAt("square", 20, 20)], INK);
    h = reducer(h, { type: "grid", id: "triangle" });
    h = stroke(h, [cellAt("triangle", 200, 200)], INK);
    h = reducer(h, { type: "undo" });
    expect(h.present.gridId).toBe("triangle");
    expect(area(h.present)).toBeCloseTo(225, 3);
  });
});

describe("one drawing across grids", () => {
  it("keeps the drawing when the grid changes", () => {
    let h = stroke(initialHistory(), [cellAt("square", 20, 20), cellAt("square", 50, 20)], INK);
    const before = buildSvg(arrangementFor(h.present.basis), h.present.cells, DEFAULT_EXPORT).svg;
    for (const id of ["flower", "triangle", "dial", "honeycomb"]) {
      h = reducer(h, { type: "grid", id });
      expect(h.present.gridId).toBe(id);
      expect(area(h.present)).toBeCloseTo(450, 1);
    }
    // Grids that were only looked at leave no trace.
    expect(h.present.basis).toEqual(["square", "honeycomb"]);
    h = reducer(h, { type: "grid", id: "square" });
    expect(h.present.basis).toEqual(["square"]);
    expect(buildSvg(arrangementFor(h.present.basis), h.present.cells, DEFAULT_EXPORT).svg).toBe(before);
  });

  it("erases with the cells of the new grid", () => {
    // A 15 x 15 square, then a 10 x 10 corner taken out with the fine grid.
    let h = stroke(initialHistory(), [cellAt("square", 5, 5)], INK);
    h = reducer(h, { type: "grid", id: "square-fine" });
    h = stroke(h, [cellAt("square-fine", 5, 5)], null);
    expect(area(h.present)).toBeCloseTo(225 - 100, 3);
    h = reducer(h, { type: "undo" });
    expect(area(h.present)).toBeCloseTo(225, 3);
  });

  it("adds to the drawing with the cells of the new grid", () => {
    let h = stroke(initialHistory(), [cellAt("square", 5, 5)], INK);
    h = reducer(h, { type: "grid", id: "dial" });
    const id = cellAt("dial", 200, 60);
    h = stroke(h, [id], "#ff0000");
    expect(area(h.present)).toBeCloseTo(225 + arrangementFor(["dial"]).faces[id].area, 0);
    expect(wholeCells(h.present.cells, "dial", h.present.basis)[id]).toBe("#ff0000");
  });

  it("painting over a partly filled cell fills all of it", () => {
    let h = reducer(initialHistory(), { type: "grid", id: "square-fine" });
    h = stroke(h, [cellAt("square-fine", 5, 5)], INK);
    h = reducer(h, { type: "grid", id: "square" });
    const id = cellAt("square", 5, 5);
    expect(wholeCells(h.present.cells, "square", h.present.basis)[id]).toBeUndefined();
    h = stroke(h, [id], INK);
    expect(area(h.present)).toBeCloseTo(225, 3);
    // The fine grid is no longer needed to describe the drawing.
    expect(reducer(h, { type: "grid", id: "triangle" }).present.basis).toEqual(["square", "triangle"]);
  });

  it("every cell of a grid is made of whole pieces of any overlay it is part of", () => {
    for (let i = 0; i < GRIDS.length; i++) {
      for (let j = i + 1; j < GRIDS.length; j++) {
        const basis = [GRIDS[i].id, GRIDS[j].id];
        const pieces = arrangementFor(basis);
        const total = pieces.faces.reduce((s, f) => s + f.area, 0);
        expect(Math.abs(total - BOARD * BOARD)).toBeLessThan(1);
        expect(pieces.defect).toBe(0);
        for (const gridId of basis) {
          const grid = arrangementFor([gridId]);
          // Pieces and cells are measured on slightly different polylines, so
          // allow for that. A piece in the wrong cell is far outside this margin.
          piecesByCell(gridId, basis).forEach((list, cell) => {
            const sum = list.reduce((s, id) => s + pieces.faces[id].area, 0);
            const want = grid.faces[cell].area;
            if (Math.abs(sum - want) > 0.5 + want * 0.01) {
              throw new Error(`${basis.join("+")}: cell ${cell} of ${gridId} is ${want}, pieces add up to ${sum}`);
            }
          });
        }
      }
    }
  }, 120000);
});

describe("buildSvg", () => {
  const arr = buildArrangement(squares(120));
  const a = arr.locate(60, 60);
  const b = arr.locate(180, 60);

  it("trims to the drawing with a margin", () => {
    const { svg, width, height } = buildSvg(arr, { [a]: INK }, { ...DEFAULT_EXPORT, padding: 10 });
    expect([width, height]).toEqual([140, 140]);
    expect(svg).toContain('viewBox="-10 -10 140 140"');
    expect(svg).toContain('fill="#111111"');
  });

  it("writes one path per colour and an optional background", () => {
    const { svg } = buildSvg(
      arr,
      { [a]: INK, [b]: "#ff0000" },
      { crop: "artboard", padding: 0, ink: "#ffffff", background: "#000000" },
    );
    expect(svg.match(/<path/g)).toHaveLength(2);
    expect(svg).toContain('<rect x="0" y="0" width="240" height="240" fill="#000000"/>');
    expect(svg).toContain('viewBox="0 0 240 240"');
  });
});
