import { describe, expect, it } from "vitest";
import { BOARD, buildArrangement, type Primitive } from "@/lib/geometry";
import { GRIDS, circle, seg, squares } from "@/lib/grids";

const total = (a: ReturnType<typeof buildArrangement>) =>
  a.faces.reduce((sum, f) => sum + f.area, 0);

describe("buildArrangement", () => {
  it("returns one cell for an empty grid", () => {
    const a = buildArrangement([]);
    expect(a.faces).toHaveLength(1);
    expect(a.faces[0].area).toBeCloseTo(BOARD * BOARD, 6);
  });

  it("cuts a square grid into the right number of cells", () => {
    const a = buildArrangement(squares(15));
    expect(a.faces).toHaveLength(256);
    for (const f of a.faces) expect(f.area).toBeCloseTo(225, 6);
  });

  it("handles a circle tangent to four lines", () => {
    const a = buildArrangement([...squares(120), circle(60, 60, 60)]);
    // 3 plain quadrants + 1 quadrant holding a disc and four corner pieces.
    expect(a.faces).toHaveLength(3 + 5);
    expect(total(a)).toBeCloseTo(BOARD * BOARD, 1);
  });

  it("treats a free-floating circle as a hole in its cell", () => {
    const a = buildArrangement([circle(120, 120, 50)]);
    expect(a.faces).toHaveLength(2);
    const [big, disc] = [...a.faces].sort((p, q) => q.area - p.area);
    expect(big.rings).toHaveLength(2);
    expect(Math.abs(disc.area - Math.PI * 2500)).toBeLessThan(5);
    expect(big.area + disc.area).toBeCloseTo(BOARD * BOARD, 1);
    expect(a.locate(120, 120)).toBe(disc.id);
    expect(a.locate(5, 5)).toBe(big.id);
  });

  it("nests islands inside islands", () => {
    const a = buildArrangement([circle(120, 120, 80), circle(120, 120, 40)]);
    expect(a.faces).toHaveLength(3);
    expect(total(a)).toBeCloseTo(BOARD * BOARD, 1);
  });

  it("drops shared edges when merging neighbours", () => {
    const a = buildArrangement(squares(120));
    const left = [a.locate(60, 60), a.locate(60, 180)];
    // One closed loop, six vertices, no interior edge.
    const d = a.merge(left);
    expect(d.match(/M/g)).toHaveLength(1);
    expect(d.match(/L/g)!.length).toBeLessThanOrEqual(7);
    expect(d).not.toContain("L120 120L0 120");
  });

  it("keeps corner-touching cells as separate loops or one pinched loop", () => {
    const a = buildArrangement(squares(120));
    const d = a.merge([a.locate(60, 60), a.locate(180, 180)]);
    expect(d.match(/Z/g)!.length).toBeGreaterThanOrEqual(1);
    expect(d.match(/L/g)!.length).toBeGreaterThanOrEqual(8);
  });

  it("merging every cell gives the artboard outline", () => {
    const a = buildArrangement(squares(60));
    const d = a.merge(a.faces.map((f) => f.id));
    expect(d.match(/M/g)).toHaveLength(1);
  });

  it("merges a ring into an outline with a hole", () => {
    const prims: Primitive[] = [circle(120, 120, 80), circle(120, 120, 40), seg(0, 120, 240, 120)];
    const a = buildArrangement(prims);
    const ring = [a.locate(120, 60), a.locate(120, 180)];
    expect(ring[0]).not.toBe(ring[1]);
    const d = a.merge(ring);
    expect(d.match(/M/g)).toHaveLength(2);
    expect(d).toContain("A80 80");
    expect(d).toContain("A40 40");
  });
});

describe("grid library", () => {
  it("has unique ids", () => {
    expect(new Set(GRIDS.map((g) => g.id)).size).toBe(GRIDS.length);
  });

  for (const g of GRIDS) {
    it(`${g.id}: cells tile the artboard with no slivers`, () => {
      const a = buildArrangement(g.build());
      expect(a.faces.length).toBeGreaterThan(8);
      expect(total(a)).toBeCloseTo(BOARD * BOARD, 0);
      const smallest = Math.min(...a.faces.map((f) => f.area));
      expect(smallest).toBeGreaterThan(2);
      // Every cell can be found again from its own interior point.
      for (const f of a.faces) expect(a.locate(f.point[0], f.point[1])).toBe(f.id);
      // Euler: V - E + F = 2 for a connected planar graph (F counts the outside).
      if (a.faces.every((f) => f.rings.length === 1)) {
        expect(a.vertexCount - a.edgeCount + a.faces.length + 1).toBe(2);
      }
    });
  }
});
