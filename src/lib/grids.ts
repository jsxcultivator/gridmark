/**
 * The grid library.
 *
 * Every grid is a list of guide primitives on a 240 x 240 artboard. Guides may
 * run past the artboard; they are clipped when the grid is built. To add a
 * grid, write a function that returns primitives and add an entry to GRIDS.
 * See docs/GRIDS.md.
 */
import { BOARD, type Circ, type Primitive, type Seg } from "./geometry";

export type GridFamily = "straight" | "round" | "radial";

export interface GridDef {
  /** Stable id. It is stored in saved drawings and share links, so never rename it. */
  id: string;
  name: string;
  family: GridFamily;
  /** One line on what the grid is good for. */
  hint: string;
  build: () => Primitive[];
}

const S = BOARD;
const C = S / 2;
const SQRT3 = Math.sqrt(3);
const FAR = S * 4;

// ---- helpers ---------------------------------------------------------------

export const seg = (x1: number, y1: number, x2: number, y2: number): Seg => ({
  kind: "seg",
  x1,
  y1,
  x2,
  y2,
});

export const circle = (cx: number, cy: number, r: number): Circ => ({
  kind: "circle",
  cx,
  cy,
  r,
});

/** A line through (px, py) at the given angle, long enough to cross the artboard. */
export function through(px: number, py: number, deg: number): Seg {
  const a = (deg * Math.PI) / 180;
  const dx = Math.cos(a) * FAR;
  const dy = Math.sin(a) * FAR;
  return seg(px - dx, py - dy, px + dx, py + dy);
}

/** Parallel lines at an angle, `spacing` apart, one of them through (px, py). */
export function parallels(deg: number, spacing: number, px = C, py = C): Seg[] {
  const a = (deg * Math.PI) / 180;
  const nx = -Math.sin(a);
  const ny = Math.cos(a);
  const reach = Math.ceil((S * 1.5) / spacing);
  const out: Seg[] = [];
  for (let k = -reach; k <= reach; k++) {
    out.push(through(px + nx * spacing * k, py + ny * spacing * k, deg));
  }
  return out;
}

/** Horizontal and vertical lines every `step` units. */
export function squares(step: number, offset = 0): Seg[] {
  const out: Seg[] = [];
  for (let p = offset; p < S; p += step) {
    if (p <= 0) continue;
    out.push(seg(p, 0, p, S), seg(0, p, S, p));
  }
  return out;
}

/** Concentric circles. */
export function rings(cx: number, cy: number, step: number, count: number): Circ[] {
  return Array.from({ length: count }, (_, i) => circle(cx, cy, step * (i + 1)));
}

/** Closed polygon outline as segments. */
function polygon(points: [number, number][]): Seg[] {
  return points.map((p, i) => {
    const q = points[(i + 1) % points.length];
    return seg(p[0], p[1], q[0], q[1]);
  });
}

/** Centres of a pointy-top hexagon tiling with the given side, covering the artboard. */
function hexCentres(side: number): [number, number][] {
  const w = SQRT3 * side;
  const rowH = 1.5 * side;
  const out: [number, number][] = [];
  const rows = Math.ceil(S / rowH) + 2;
  const cols = Math.ceil(S / w) + 2;
  for (let j = -rows; j <= rows; j++) {
    for (let i = -cols; i <= cols; i++) {
      const x = C + i * w + (j % 2 !== 0 ? w / 2 : 0);
      const y = C + j * rowH;
      if (x < -w || x > S + w || y < -2 * side || y > S + 2 * side) continue;
      out.push([x, y]);
    }
  }
  return out;
}

function hexCorners(cx: number, cy: number, side: number): [number, number][] {
  return Array.from({ length: 6 }, (_, k) => {
    const a = (Math.PI / 180) * (60 * k - 90);
    return [cx + side * Math.cos(a), cy + side * Math.sin(a)] as [number, number];
  });
}

// ---- grids -----------------------------------------------------------------

const triangleLines = (side: number): Seg[] => {
  const h = (side * SQRT3) / 2;
  return [...parallels(0, h), ...parallels(60, h), ...parallels(120, h)];
};

const crossed = (step: number): Seg[] => [
  ...squares(step),
  ...parallels(45, step / Math.SQRT2),
  ...parallels(135, step / Math.SQRT2),
];

export const GRIDS: GridDef[] = [
  {
    id: "square",
    name: "Square",
    family: "straight",
    hint: "Pixel marks and blocky letterforms.",
    build: () => squares(15),
  },
  {
    id: "square-fine",
    name: "Fine square",
    family: "straight",
    hint: "The square grid at a finer pitch for more detail.",
    build: () => squares(10),
  },
  {
    id: "crossed",
    name: "Crossed squares",
    family: "straight",
    hint: "Squares cut by both diagonals. Arrows, chevrons, folded ribbons.",
    build: () => crossed(30),
  },
  {
    id: "diamond",
    name: "Diamond",
    family: "straight",
    hint: "A square grid turned 45 degrees.",
    build: () => [...parallels(45, 20 / Math.SQRT2), ...parallels(135, 20 / Math.SQRT2)],
  },
  {
    id: "triangle",
    name: "Triangle",
    family: "straight",
    hint: "Equilateral triangles. Hexagons, stars and faceted shapes.",
    build: () => triangleLines(20),
  },
  {
    id: "isometric",
    name: "Isometric",
    family: "straight",
    hint: "The triangle grid on its side, for cubes and 3D lettering.",
    build: () => {
      const h = (20 * SQRT3) / 2;
      return [...parallels(90, h), ...parallels(30, h), ...parallels(150, h)];
    },
  },
  {
    id: "honeycomb",
    name: "Honeycomb",
    family: "straight",
    hint: "Hexagon cells.",
    build: () => hexCentres(14).flatMap(([x, y]) => polygon(hexCorners(x, y, 14))),
  },
  {
    id: "cubes",
    name: "Tumbling blocks",
    family: "straight",
    hint: "Hexagons split into three rhombi. Reads as stacked cubes.",
    build: () =>
      hexCentres(20).flatMap(([x, y]) => {
        const p = hexCorners(x, y, 20);
        return [
          ...polygon(p),
          seg(x, y, p[1][0], p[1][1]),
          seg(x, y, p[3][0], p[3][1]),
          seg(x, y, p[5][0], p[5][1]),
        ];
      }),
  },
  {
    id: "bricks",
    name: "Bricks",
    family: "straight",
    hint: "Offset courses of 2:1 bricks.",
    build: () => {
      const out: Seg[] = [];
      for (let row = 0; row < 16; row++) {
        const y = row * 15;
        if (row > 0) out.push(seg(0, y, S, y));
        for (let x = row % 2 ? 15 : 30; x < S; x += 30) out.push(seg(x, y, x, y + 15));
      }
      return out;
    },
  },
  {
    id: "octagons",
    name: "Octagons",
    family: "straight",
    hint: "Octagons with small squares between them.",
    build: () => {
      const p = 40;
      const a = p / (1 + Math.SQRT2) / 2;
      const out: Seg[] = [];
      for (let cy = p / 2; cy < S; cy += p) {
        for (let cx = p / 2; cx < S; cx += p) {
          out.push(
            ...polygon([
              [cx - a, cy - p / 2],
              [cx + a, cy - p / 2],
              [cx + p / 2, cy - a],
              [cx + p / 2, cy + a],
              [cx + a, cy + p / 2],
              [cx - a, cy + p / 2],
              [cx - p / 2, cy + a],
              [cx - p / 2, cy - a],
            ]),
          );
        }
      }
      return out;
    },
  },
  {
    id: "circles-in-squares",
    name: "Circles in squares",
    family: "round",
    hint: "A dot in every square. Halftone marks and rounded pixels.",
    build: () => {
      const out: Primitive[] = squares(20);
      for (let y = 10; y < S; y += 20) for (let x = 10; x < S; x += 20) out.push(circle(x, y, 10));
      return out;
    },
  },
  {
    id: "rounded",
    name: "Rounded corners",
    family: "round",
    hint: "A circle on every crossing, so any square corner can be rounded.",
    build: () => {
      const out: Primitive[] = squares(30);
      for (let y = 0; y <= S; y += 30) for (let x = 0; x <= S; x += 30) out.push(circle(x, y, 15));
      return out;
    },
  },
  {
    id: "stencil",
    name: "Stencil",
    family: "round",
    hint: "Circles on the crossings and in the squares. Rounded letterforms.",
    build: () => {
      const out: Primitive[] = squares(30);
      for (let y = 0; y <= S; y += 30) for (let x = 0; x <= S; x += 30) out.push(circle(x, y, 15));
      for (let y = 15; y < S; y += 30) for (let x = 15; x < S; x += 30) out.push(circle(x, y, 15));
      return out;
    },
  },
  {
    id: "quatrefoil",
    name: "Quatrefoil",
    family: "round",
    hint: "Overlapping circles that leave four-petal flowers.",
    build: () => {
      const out: Primitive[] = squares(30, 15);
      const r = 15 * Math.SQRT2;
      for (let y = 0; y <= S; y += 30) for (let x = 0; x <= S; x += 30) out.push(circle(x, y, r));
      return out;
    },
  },
  {
    id: "flower",
    name: "Flower of life",
    family: "round",
    hint: "Circles on a triangle lattice. Petals, leaves and knots.",
    build: () => {
      const a = 30;
      const h = (a * SQRT3) / 2;
      const out: Primitive[] = [];
      for (let j = -6; j <= 6; j++) {
        for (let i = -6; i <= 6; i++) {
          const x = C + i * a + (j % 2 !== 0 ? a / 2 : 0);
          const y = C + j * h;
          if (x < -a || x > S + a || y < -a || y > S + a) continue;
          out.push(circle(x, y, a));
        }
      }
      return out;
    },
  },
  {
    id: "scales",
    name: "Scales",
    family: "round",
    hint: "Staggered rows of circles. Waves, scales and scallops.",
    build: () => {
      const out: Primitive[] = [];
      for (let j = 0; j <= 16; j++) {
        for (let x = j % 2 ? 15 : 0; x <= S; x += 30) out.push(circle(x, j * 15, 15));
      }
      return out;
    },
  },
  {
    id: "dial",
    name: "Dial",
    family: "radial",
    hint: "Rings and spokes from the centre. Badges, suns and gauges.",
    build: () => [
      ...rings(C, C, 15, 11),
      ...Array.from({ length: 12 }, (_, k) => through(C, C, k * 15)),
    ],
  },
  {
    id: "target",
    name: "Target",
    family: "radial",
    hint: "Rings over a square grid.",
    build: () => [...squares(30), ...rings(C, C, 15, 11)],
  },
  {
    id: "compass",
    name: "Compass",
    family: "radial",
    hint: "Crossed squares with rings. Stars and compass roses.",
    build: () => [...crossed(30), ...rings(C, C, 30, 5)],
  },
  {
    id: "halo",
    name: "Triangle halo",
    family: "radial",
    hint: "Triangles with rings through the lattice points.",
    build: () => [...triangleLines(30), ...rings(C, C, 30 * SQRT3, 3)],
  },
  {
    id: "two-centres",
    name: "Two centres",
    family: "radial",
    hint: "Two sets of rings. Lenses, eyes and interlocking loops.",
    build: () => [
      seg(0, C, S, C),
      seg(C, 0, C, S),
      ...rings(60, C, 20, 12),
      ...rings(180, C, 20, 12),
    ],
  },
  {
    id: "three-centres",
    name: "Three centres",
    family: "radial",
    hint: "Three sets of rings around the centre. Trefoils and knots.",
    build: () => {
      // Centres 60 apart and rings every 30, so rings pass through the other centres.
      const d = 60 / SQRT3;
      return [
        ...rings(C, C - d, 30, 7),
        ...rings(C - 30, C + d / 2, 30, 7),
        ...rings(C + 30, C + d / 2, 30, 7),
      ];
    },
  },
  {
    id: "golden",
    name: "Golden",
    family: "radial",
    hint: "Lines at golden-ratio divisions with the circles they imply.",
    build: () => {
      const phi = (1 + Math.sqrt(5)) / 2;
      const out: Primitive[] = [through(C, C, 45), through(C, C, 135)];
      for (let k = 2; k <= 5; k++) {
        const p = S / phi ** k;
        out.push(seg(p, 0, p, S), seg(S - p, 0, S - p, S), seg(0, p, S, p), seg(0, S - p, S, S - p));
        out.push(circle(C, C, C - p));
      }
      return out;
    },
  },
  {
    id: "fan",
    name: "Fan",
    family: "radial",
    hint: "Spokes and arcs from the bottom edge. Shells, sunrises and fans.",
    build: () => [
      ...rings(C, S, 20, 13),
      ...Array.from({ length: 17 }, (_, k) => through(C, S, (k + 1) * 10)),
    ],
  },
];

export const FAMILY_LABELS: Record<GridFamily, string> = {
  straight: "Straight",
  round: "Round",
  radial: "Radial",
};

export const DEFAULT_GRID = "square";

export function gridById(id: string): GridDef {
  return GRIDS.find((g) => g.id === id) ?? GRIDS[0];
}
