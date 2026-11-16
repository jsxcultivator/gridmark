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
    // A plain rectangle: four corners, no point left where the cells met.
    expect(d.match(/L/g)).toHaveLength(4);
    expect(d).not.toContain("120 120");
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
    expect(d.match(/A80 80 0 0/g)).toHaveLength(3);
    expect(d.match(/A40 40 0 0/g)).toHaveLength(3);
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
      expect(a.defect).toBe(0);
    });
  }
});

describe("merged outlines", () => {
  it("joins straight runs, whatever grid they were drawn on", () => {
    const coarse = buildArrangement(squares(120));
    const fine = buildArrangement(squares(15));
    const ids = fine.faces.filter((f) => f.point[0] < 120 && f.point[1] < 120).map((f) => f.id);
    expect(ids).toHaveLength(64);
    const d = fine.merge(ids);
    expect(d.match(/L/g)).toHaveLength(4);
    expect(d.match(/[ML][^ML]*/g)!.map((s) => s.replace("Z", "")).sort()).toEqual(
      coarse.merge([coarse.locate(60, 60)]).match(/[ML][^ML]*/g)!.map((s) => s.replace("Z", "")).sort(),
    );
  });

  it("joins arcs of one circle and closes a full circle with two arcs", () => {
    const a = buildArrangement([...squares(30), circle(120, 120, 45)]);
    const disc = a.faces.filter((f) => Math.hypot(f.point[0] - 120, f.point[1] - 120) < 45 && a.locate(f.point[0], f.point[1]) === f.id);
    const inside = disc.filter((f) => f.rings[0].every((v, i) => i % 2 === 1 || Math.hypot(v - 120, f.rings[0][i + 1] - 120) < 45.01));
    const d = a.merge(inside.map((f) => f.id));
    // A full circle is three arcs of a third of a turn, never half turns:
    // a half-turn arc is badly pinned down once its end points are rounded.
    expect(d).toMatch(/^M[\d. ]+(A45 45 0 0 [01] [\d. ]+){3}Z$/);
    // Half of it: one straight side and the half circle as two arcs.
    const half = a.merge(inside.filter((f) => f.point[1] < 120).map((f) => f.id));
    expect(half.match(/A/g)).toHaveLength(2);
    expect(half.match(/L/g)).toHaveLength(1);
    expect(half).not.toMatch(/A45 45 0 1/);
  });
});

describe("grids laid over each other", () => {
  // Every pair is covered in document.test.ts. This samples three at a time.
  it("stay flat and cover the sheet", () => {
    const n = GRIDS.length;
    let checked = 0;
    for (let i = 0; i < n; i++) {
      for (let j = i + 1; j < n; j++) {
        for (let k = j + 1; k < n; k++) {
          if ((i * 7 + j * 13 + k * 31) % 17 !== 0) continue;
          checked++;
          const ids = [GRIDS[i].id, GRIDS[j].id, GRIDS[k].id].join("+");
          const a = buildArrangement([...GRIDS[i].build(), ...GRIDS[j].build(), ...GRIDS[k].build()]);
          expect(a.defect, ids).toBe(0);
          expect(Math.abs(total(a) - BOARD * BOARD), ids).toBeLessThan(1);
        }
      }
    }
    expect(checked).toBeGreaterThan(100);
  }, 120000);

  it("handles a line that runs along part of another", () => {
    const a = buildArrangement([seg(0, 120, 240, 120), seg(60, 120, 180, 120), seg(60, 0, 60, 240), seg(180, 120, 180, 240)]);
    expect(a.defect).toBe(0);
    expect(total(a)).toBeCloseTo(BOARD * BOARD, 6);
    expect(a.faces).toHaveLength(5);
  });

  it("keeps a line apart from the point where two circles touch when it only passes close by", () => {
    // Reduced from Isometric + Rounded corners + Three centres.
    const a = buildArrangement([
      seg(1003.3459118601274, -269.99999999999994, -659.4228634059948, 690),
      circle(150, 240, 15),
      circle(150, 137.32050807568876, 90),
    ]);
    expect(a.defect).toBe(0);
  });
});

