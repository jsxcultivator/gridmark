import { describe, expect, it } from "vitest";
import {
  INK,
  activeCells,
  decodeCells,
  decodeShare,
  encodeCells,
  encodeShare,
  initialHistory,
  reducer,
  type Cells,
  type History,
} from "@/lib/document";
import { buildArrangement } from "@/lib/geometry";
import { buildSvg, DEFAULT_EXPORT } from "@/lib/export";
import { squares } from "@/lib/grids";

const run = (h: History, ...actions: Parameters<typeof reducer>[1][]) =>
  actions.reduce(reducer, h);

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

  it("round-trips a document", () => {
    const h = run(initialHistory(), { type: "grid", id: "dial" }, { type: "begin" }, { type: "paint", ids: [3, 4], color: "#2f6fed" });
    const shared = decodeShare("#" + encodeShare(h.present));
    expect(shared).toEqual({ gridId: "dial", cells: { 3: "#2f6fed", 4: "#2f6fed" } });
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
    expect(Object.keys(activeCells(h.present))).toHaveLength(3);
    expect(h.past).toHaveLength(1);
    h = reducer(h, { type: "undo" });
    expect(activeCells(h.present)).toEqual({});
    h = reducer(h, { type: "redo" });
    expect(Object.keys(activeCells(h.present))).toHaveLength(3);
  });

  it("does not record strokes that change nothing", () => {
    const h = run(initialHistory(), { type: "begin" }, { type: "paint", ids: [5], color: null });
    expect(h.past).toHaveLength(0);
  });

  it("keeps a drawing per grid", () => {
    const h = run(
      initialHistory(),
      { type: "begin" },
      { type: "paint", ids: [1], color: INK },
      { type: "grid", id: "triangle" },
    );
    expect(activeCells(h.present)).toEqual({});
    expect(activeCells(reducer(h, { type: "grid", id: "square" }).present)).toEqual({ 1: INK });
  });

  it("clear is undoable", () => {
    let h = run(initialHistory(), { type: "begin" }, { type: "paint", ids: [1], color: INK }, { type: "clear" });
    expect(activeCells(h.present)).toEqual({});
    h = reducer(h, { type: "undo" });
    expect(activeCells(h.present)).toEqual({ 1: INK });
  });
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
