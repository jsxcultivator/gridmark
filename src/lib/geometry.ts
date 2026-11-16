/**
 * Planar arrangement of line segments and circles.
 *
 * A grid is a handful of guide primitives (segments and circles) drawn on a
 * square artboard. The guides cut the artboard into cells. This module finds
 * those cells exactly: it splits every guide where it meets another one,
 * builds a half-edge graph and walks its faces. Arcs stay arcs, so exported
 * artwork is made of true SVG `A` commands rather than polylines.
 *
 * Coordinates are SVG-style: x grows right, y grows down.
 */

export const BOARD = 240;

export interface Seg {
  kind: "seg";
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

export interface Circ {
  kind: "circle";
  cx: number;
  cy: number;
  r: number;
}

export type Primitive = Seg | Circ;

/** A ring is a flat list of points: [x0, y0, x1, y1, ...]. */
export type Ring = number[];

export interface Face {
  id: number;
  /** SVG path data for the cell, holes included. */
  d: string;
  area: number;
  /** [minX, minY, maxX, maxY] */
  bbox: [number, number, number, number];
  /** Flattened outline. rings[0] is the outer boundary, the rest are holes. */
  rings: Ring[];
  /** A point guaranteed to lie inside the cell. */
  point: [number, number];
}

export interface Arrangement {
  size: number;
  faces: Face[];
  /** Guides as clipped primitives, ready to draw. */
  guides: Primitive[];
  vertexCount: number;
  edgeCount: number;
  /** Index of the cell containing the point, or -1. */
  locate(x: number, y: number): number;
  /** Outline of the union of the given cells, with shared edges removed. */
  merge(ids: Iterable<number>): string;
  /** Bounding box of the given cells, or null when the set is empty. */
  bounds(ids: Iterable<number>): [number, number, number, number] | null;
}

const TOL = 1e-7;
const SNAP = 1e-4;
const TAU = Math.PI * 2;

const fmt = (n: number): string => {
  const r = Math.round(n * 1000) / 1000;
  return Object.is(r, -0) ? "0" : String(r);
};

/** Liang–Barsky clip of a segment to the artboard. */
function clipSeg(s: Seg, size: number): Seg | null {
  let t0 = 0;
  let t1 = 1;
  const dx = s.x2 - s.x1;
  const dy = s.y2 - s.y1;
  const p = [-dx, dx, -dy, dy];
  const q = [s.x1, size - s.x1, s.y1, size - s.y1];
  for (let i = 0; i < 4; i++) {
    if (Math.abs(p[i]) < 1e-12) {
      if (q[i] < 0) return null;
    } else {
      const t = q[i] / p[i];
      if (p[i] < 0) {
        if (t > t1) return null;
        if (t > t0) t0 = t;
      } else {
        if (t < t0) return null;
        if (t < t1) t1 = t;
      }
    }
  }
  const out: Seg = {
    kind: "seg",
    x1: s.x1 + t0 * dx,
    y1: s.y1 + t0 * dy,
    x2: s.x1 + t1 * dx,
    y2: s.y1 + t1 * dy,
  };
  if (Math.hypot(out.x2 - out.x1, out.y2 - out.y1) < 1e-6) return null;
  return out;
}

function onBorder(s: Seg, size: number): boolean {
  const near = (a: number, b: number) => Math.abs(a - b) < 1e-6;
  if (near(s.x1, s.x2) && (near(s.x1, 0) || near(s.x1, size))) return true;
  if (near(s.y1, s.y2) && (near(s.y1, 0) || near(s.y1, size))) return true;
  return false;
}

function pointInRing(ring: Ring, x: number, y: number): boolean {
  let inside = false;
  const n = ring.length;
  for (let i = 0, j = n - 2; i < n; j = i, i += 2) {
    const xi = ring[i];
    const yi = ring[i + 1];
    const xj = ring[j];
    const yj = ring[j + 1];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) {
      inside = !inside;
    }
  }
  return inside;
}

function ringArea(ring: Ring): number {
  let a = 0;
  const n = ring.length;
  for (let i = 0, j = n - 2; i < n; j = i, i += 2) {
    a += ring[j] * ring[i + 1] - ring[i] * ring[j + 1];
  }
  return a / 2;
}

/** Midpoint of the widest horizontal span through the middle of the shape. */
function interiorPoint(rings: Ring[], bbox: Face["bbox"]): [number, number] {
  const h = bbox[3] - bbox[1];
  for (const f of [0.5, 0.37, 0.63, 0.21, 0.79]) {
    const y = bbox[1] + h * f + 1.37e-5;
    const xs: number[] = [];
    for (const ring of rings) {
      const n = ring.length;
      for (let i = 0, j = n - 2; i < n; j = i, i += 2) {
        const yi = ring[i + 1];
        const yj = ring[j + 1];
        if (yi > y !== yj > y) {
          xs.push(ring[j] + ((y - yj) / (yi - yj)) * (ring[i] - ring[j]));
        }
      }
    }
    xs.sort((a, b) => a - b);
    let best = -1;
    let bx = 0;
    for (let i = 0; i + 1 < xs.length; i += 2) {
      const w = xs[i + 1] - xs[i];
      if (w > best) {
        best = w;
        bx = (xs[i] + xs[i + 1]) / 2;
      }
    }
    if (best > 1e-9) return [bx, y];
  }
  return [(bbox[0] + bbox[2]) / 2, (bbox[1] + bbox[3]) / 2];
}

export function buildArrangement(primitives: Primitive[], size = BOARD): Arrangement {
  // ---- 1. Normalise input -------------------------------------------------
  const segs: Seg[] = [
    { kind: "seg", x1: 0, y1: 0, x2: size, y2: 0 },
    { kind: "seg", x1: size, y1: 0, x2: size, y2: size },
    { kind: "seg", x1: size, y1: size, x2: 0, y2: size },
    { kind: "seg", x1: 0, y1: size, x2: 0, y2: 0 },
  ];
  const circles: Circ[] = [];
  const guides: Primitive[] = [];
  const seen = new Set<string>();
  const k4 = (n: number) => Math.round(n * 1e4);

  for (const p of primitives) {
    if (p.kind === "seg") {
      const c = clipSeg(p, size);
      if (!c || onBorder(c, size)) continue;
      const a = `${k4(c.x1)},${k4(c.y1)}`;
      const b = `${k4(c.x2)},${k4(c.y2)}`;
      const key = a < b ? `s${a}|${b}` : `s${b}|${a}`;
      if (seen.has(key)) continue;
      seen.add(key);
      segs.push(c);
      guides.push(c);
    } else {
      if (p.r <= 1e-6) continue;
      // Skip circles that cannot reach the artboard.
      const nx = Math.max(0, Math.min(size, p.cx));
      const ny = Math.max(0, Math.min(size, p.cy));
      if (Math.hypot(nx - p.cx, ny - p.cy) > p.r + TOL) continue;
      const key = `c${k4(p.cx)},${k4(p.cy)},${k4(p.r)}`;
      if (seen.has(key)) continue;
      seen.add(key);
      circles.push(p);
      guides.push(p);
    }
  }

  // ---- 2. Vertices ----------------------------------------------------------
  const vx: number[] = [];
  const vy: number[] = [];
  const grid = new Map<string, number>();
  const vertex = (x: number, y: number): number => {
    const gx = Math.round(x / SNAP);
    const gy = Math.round(y / SNAP);
    for (let dx = -1; dx <= 1; dx++) {
      for (let dy = -1; dy <= 1; dy++) {
        const hit = grid.get(`${gx + dx},${gy + dy}`);
        if (hit !== undefined) return hit;
      }
    }
    const id = vx.length;
    vx.push(x);
    vy.push(y);
    grid.set(`${gx},${gy}`, id);
    return id;
  };
  const inBoard = (x: number, y: number, pad = 1e-6) =>
    x >= -pad && x <= size + pad && y >= -pad && y <= size + pad;

  // For each primitive: the points where it must be split.
  const segCuts: { t: number; v: number }[][] = segs.map(() => []);
  const circCuts: { a: number; v: number }[][] = circles.map(() => []);
  const norm = (a: number) => {
    let r = a % TAU;
    if (r < 0) r += TAU;
    return r;
  };

  segs.forEach((s, i) => {
    segCuts[i].push({ t: 0, v: vertex(s.x1, s.y1) }, { t: 1, v: vertex(s.x2, s.y2) });
  });

  // segment x segment
  for (let i = 0; i < segs.length; i++) {
    const a = segs[i];
    const adx = a.x2 - a.x1;
    const ady = a.y2 - a.y1;
    const alen = Math.hypot(adx, ady);
    for (let j = i + 1; j < segs.length; j++) {
      const b = segs[j];
      const bdx = b.x2 - b.x1;
      const bdy = b.y2 - b.y1;
      const blen = Math.hypot(bdx, bdy);
      const den = adx * bdy - ady * bdx;
      if (Math.abs(den) < 1e-10 * alen * blen) continue;
      const ex = b.x1 - a.x1;
      const ey = b.y1 - a.y1;
      const t = (ex * bdy - ey * bdx) / den;
      const u = (ex * ady - ey * adx) / den;
      const et = 1e-6 / alen;
      const eu = 1e-6 / blen;
      if (t < -et || t > 1 + et || u < -eu || u > 1 + eu) continue;
      const v = vertex(a.x1 + t * adx, a.y1 + t * ady);
      segCuts[i].push({ t, v });
      segCuts[j].push({ t: u, v });
    }
  }

  // segment x circle
  for (let i = 0; i < segs.length; i++) {
    const s = segs[i];
    const dx = s.x2 - s.x1;
    const dy = s.y2 - s.y1;
    const len = Math.hypot(dx, dy);
    const et = 1e-6 / len;
    for (let j = 0; j < circles.length; j++) {
      const c = circles[j];
      const t0 = ((c.cx - s.x1) * dx + (c.cy - s.y1) * dy) / (len * len);
      const fx = s.x1 + t0 * dx;
      const fy = s.y1 + t0 * dy;
      const dist = Math.hypot(fx - c.cx, fy - c.cy);
      if (dist > c.r + TOL) continue;
      const ts: number[] = [];
      if (Math.abs(dist - c.r) <= TOL) {
        ts.push(t0);
      } else {
        const half = Math.sqrt(c.r * c.r - dist * dist) / len;
        ts.push(t0 - half, t0 + half);
      }
      for (const t of ts) {
        if (t < -et || t > 1 + et) continue;
        const x = s.x1 + t * dx;
        const y = s.y1 + t * dy;
        const v = vertex(x, y);
        segCuts[i].push({ t, v });
        circCuts[j].push({ a: norm(Math.atan2(vy[v] - c.cy, vx[v] - c.cx)), v });
      }
    }
  }

  // circle x circle
  for (let i = 0; i < circles.length; i++) {
    const a = circles[i];
    for (let j = i + 1; j < circles.length; j++) {
      const b = circles[j];
      const dx = b.cx - a.cx;
      const dy = b.cy - a.cy;
      const d = Math.hypot(dx, dy);
      if (d < 1e-9) continue;
      if (d > a.r + b.r + TOL || d < Math.abs(a.r - b.r) - TOL) continue;
      const pts: [number, number][] = [];
      const ux = dx / d;
      const uy = dy / d;
      if (Math.abs(d - (a.r + b.r)) <= TOL) {
        pts.push([a.cx + ux * a.r, a.cy + uy * a.r]);
      } else if (Math.abs(d - Math.abs(a.r - b.r)) <= TOL) {
        const sgn = a.r > b.r ? 1 : -1;
        pts.push([a.cx + sgn * ux * a.r, a.cy + sgn * uy * a.r]);
      } else {
        const m = (d * d + a.r * a.r - b.r * b.r) / (2 * d);
        const h = Math.sqrt(Math.max(0, a.r * a.r - m * m));
        const mx = a.cx + ux * m;
        const my = a.cy + uy * m;
        pts.push([mx - uy * h, my + ux * h], [mx + uy * h, my - ux * h]);
      }
      for (const [x, y] of pts) {
        if (!inBoard(x, y)) continue;
        const v = vertex(x, y);
        circCuts[i].push({ a: norm(Math.atan2(vy[v] - a.cy, vx[v] - a.cx)), v });
        circCuts[j].push({ a: norm(Math.atan2(vy[v] - b.cy, vx[v] - b.cx)), v });
      }
    }
  }

  // Quarter points keep every arc at 90° or less, so the SVG large-arc flag
  // is always 0 and a lone circle still has vertices to hang edges on.
  circles.forEach((c, i) => {
    for (let q = 0; q < 4; q++) {
      const ang = (q * Math.PI) / 2;
      const x = c.cx + c.r * Math.cos(ang);
      const y = c.cy + c.r * Math.sin(ang);
      if (!inBoard(x, y)) continue;
      const v = vertex(x, y);
      circCuts[i].push({ a: norm(Math.atan2(vy[v] - c.cy, vx[v] - c.cx)), v });
    }
  });

  // ---- 3. Edges -------------------------------------------------------------
  // Edge e owns half-edges 2e (a -> b) and 2e + 1 (b -> a).
  const eA: number[] = [];
  const eB: number[] = [];
  const eCirc: number[] = []; // circle index, or -1 for a straight edge
  const eFrom: number[] = []; // start angle (arcs)
  const eSpan: number[] = []; // angular span (arcs), always > 0
  const edgeKeys = new Set<string>();

  segCuts.forEach((cuts) => {
    cuts.sort((p, q) => p.t - q.t);
    for (let i = 0; i + 1 < cuts.length; i++) {
      const a = cuts[i].v;
      const b = cuts[i + 1].v;
      if (a === b) continue;
      const key = a < b ? `${a}-${b}` : `${b}-${a}`;
      if (edgeKeys.has(key)) continue;
      edgeKeys.add(key);
      eA.push(a);
      eB.push(b);
      eCirc.push(-1);
      eFrom.push(0);
      eSpan.push(0);
    }
  });

  circCuts.forEach((cuts, ci) => {
    const c = circles[ci];
    cuts.sort((p, q) => p.a - q.a);
    // Drop repeats of the same vertex (several guides meeting at one point).
    const uniq = cuts.filter((p, i) => i === 0 || p.v !== cuts[i - 1].v);
    if (uniq.length > 1 && uniq[0].v === uniq[uniq.length - 1].v) uniq.pop();
    if (uniq.length < 2) return;
    for (let i = 0; i < uniq.length; i++) {
      const p = uniq[i];
      const q = uniq[(i + 1) % uniq.length];
      let span = q.a - p.a;
      if (span <= 0) span += TAU;
      const mid = p.a + span / 2;
      if (!inBoard(c.cx + c.r * Math.cos(mid), c.cy + c.r * Math.sin(mid), 1e-9)) continue;
      eA.push(p.v);
      eB.push(q.v);
      eCirc.push(ci);
      eFrom.push(p.a);
      eSpan.push(span);
    }
  });

  const E = eA.length;
  const H = E * 2;
  const V = vx.length;
  const orig = (h: number) => (h & 1 ? eB[h >> 1] : eA[h >> 1]);
  const dest = (h: number) => (h & 1 ? eA[h >> 1] : eB[h >> 1]);

  // ---- 4. Sort half-edges around each vertex ----------------------------------
  // Direction is measured to a point a short way along the edge. For an arc
  // that nudges the angle towards the side it bends to, which orders an arc
  // and a line correctly even when they are tangent at the vertex.
  const hAngle = new Float64Array(H);
  for (let h = 0; h < H; h++) {
    const e = h >> 1;
    const ci = eCirc[e];
    if (ci < 0) {
      const o = orig(h);
      const d = dest(h);
      hAngle[h] = Math.atan2(vy[d] - vy[o], vx[d] - vx[o]);
    } else {
      const c = circles[ci];
      const step = Math.min(1e-3 / c.r, eSpan[e] / 2);
      const from = h & 1 ? eFrom[e] + eSpan[e] : eFrom[e];
      const to = h & 1 ? from - step : from + step;
      hAngle[h] = Math.atan2(
        c.r * (Math.sin(to) - Math.sin(from)),
        c.r * (Math.cos(to) - Math.cos(from)),
      );
    }
  }
  const out: number[][] = Array.from({ length: V }, () => []);
  for (let h = 0; h < H; h++) out[orig(h)].push(h);
  const slot = new Int32Array(H);
  for (const list of out) {
    list.sort((p, q) => hAngle[p] - hAngle[q]);
    list.forEach((h, i) => (slot[h] = i));
  }
  const next = new Int32Array(H);
  for (let h = 0; h < H; h++) {
    const t = h ^ 1;
    const list = out[orig(t)];
    next[h] = list[(slot[t] - 1 + list.length) % list.length];
  }

  // ---- 5. Walk the cycles -----------------------------------------------------
  const flatten = (h: number, into: Ring) => {
    const e = h >> 1;
    const o = orig(h);
    into.push(vx[o], vy[o]);
    const ci = eCirc[e];
    if (ci < 0) return;
    const c = circles[ci];
    const maxStep = 2 * Math.acos(Math.max(0, 1 - 0.01 / c.r));
    const n = Math.max(2, Math.ceil(eSpan[e] / maxStep));
    for (let k = 1; k < n; k++) {
      const f = k / n;
      const ang = h & 1 ? eFrom[e] + eSpan[e] * (1 - f) : eFrom[e] + eSpan[e] * f;
      into.push(c.cx + c.r * Math.cos(ang), c.cy + c.r * Math.sin(ang));
    }
  };

  const pathOf = (cycle: number[]): string => {
    const o = orig(cycle[0]);
    let d = `M${fmt(vx[o])} ${fmt(vy[o])}`;
    for (const h of cycle) {
      const e = h >> 1;
      const to = dest(h);
      if (eCirc[e] < 0) {
        d += `L${fmt(vx[to])} ${fmt(vy[to])}`;
      } else {
        const r = fmt(circles[eCirc[e]].r);
        d += `A${r} ${r} 0 0 ${h & 1 ? 0 : 1} ${fmt(vx[to])} ${fmt(vy[to])}`;
      }
    }
    return d + "Z";
  };

  interface Cycle {
    hes: number[];
    ring: Ring;
    signed: number;
  }
  const cycles: Cycle[] = [];
  const done = new Uint8Array(H);
  for (let h0 = 0; h0 < H; h0++) {
    if (done[h0]) continue;
    const hes: number[] = [];
    const ring: Ring = [];
    let h = h0;
    do {
      done[h] = 1;
      hes.push(h);
      flatten(h, ring);
      h = next[h];
    } while (h !== h0);
    cycles.push({ hes, ring, signed: ringArea(ring) });
  }

  // The artboard outline is the largest cycle. Cycles wound the same way are
  // outer boundaries of free-floating guide islands (holes in some cell);
  // cycles wound the other way are the cells.
  let outer = 0;
  cycles.forEach((c, i) => {
    if (Math.abs(c.signed) > Math.abs(cycles[outer].signed)) outer = i;
  });
  const outerSign = Math.sign(cycles[outer].signed);

  const parent = Int32Array.from({ length: V }, (_, i) => i);
  const find = (a: number): number => {
    while (parent[a] !== a) {
      parent[a] = parent[parent[a]];
      a = parent[a];
    }
    return a;
  };
  for (let e = 0; e < E; e++) parent[find(eA[e])] = find(eB[e]);

  const faceOf = new Int32Array(H).fill(-1);
  const faceCycles: number[][][] = [];
  const faces: Face[] = [];
  const faceComp: number[] = [];

  cycles.forEach((c) => {
    if (Math.sign(c.signed) === outerSign || Math.abs(c.signed) < 1e-7) return;
    const id = faces.length;
    for (const h of c.hes) faceOf[h] = id;
    faceCycles.push([c.hes]);
    faceComp.push(find(orig(c.hes[0])));
    faces.push({
      id,
      d: "",
      area: Math.abs(c.signed),
      bbox: [0, 0, 0, 0],
      rings: [c.ring],
      point: [0, 0],
    });
  });

  cycles.forEach((c, i) => {
    if (i === outer || Math.sign(c.signed) !== outerSign) return;
    const comp = find(orig(c.hes[0]));
    const px = c.ring[0];
    const py = c.ring[1];
    let host = -1;
    for (const f of faces) {
      if (faceComp[f.id] === comp) continue;
      if (host >= 0 && f.area >= faces[host].area) continue;
      if (pointInRing(f.rings[0], px, py)) host = f.id;
    }
    if (host < 0) return;
    for (const h of c.hes) faceOf[h] = host;
    faceCycles[host].push(c.hes);
    faces[host].rings.push(c.ring);
  });

  for (const f of faces) {
    const outerRing = f.rings[0];
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    for (let i = 0; i < outerRing.length; i += 2) {
      minX = Math.min(minX, outerRing[i]);
      maxX = Math.max(maxX, outerRing[i]);
      minY = Math.min(minY, outerRing[i + 1]);
      maxY = Math.max(maxY, outerRing[i + 1]);
    }
    f.bbox = [minX, minY, maxX, maxY];
    for (let i = 1; i < f.rings.length; i++) f.area -= Math.abs(ringArea(f.rings[i]));
    f.d = faceCycles[f.id].map(pathOf).join("");
    f.point = interiorPoint(f.rings, f.bbox);
  }

  // ---- 6. Queries -------------------------------------------------------------
  const locate = (x: number, y: number): number => {
    for (const f of faces) {
      const b = f.bbox;
      if (x < b[0] || x > b[2] || y < b[1] || y > b[3]) continue;
      if (!pointInRing(f.rings[0], x, y)) continue;
      let inHole = false;
      for (let i = 1; i < f.rings.length; i++) {
        if (pointInRing(f.rings[i], x, y)) inHole = true;
      }
      if (!inHole) return f.id;
    }
    return -1;
  };

  const merge = (ids: Iterable<number>): string => {
    const inSet = new Uint8Array(faces.length);
    const list: number[] = [];
    for (const id of ids) {
      if (id >= 0 && id < faces.length && !inSet[id]) {
        inSet[id] = 1;
        list.push(id);
      }
    }
    // A half-edge is on the outline when its own cell is filled and the cell
    // across the edge is not.
    const isRim = (h: number) => {
      const f = faceOf[h];
      if (f < 0 || !inSet[f]) return false;
      const g = faceOf[h ^ 1];
      return g < 0 || !inSet[g];
    };
    const used = new Set<number>();
    let d = "";
    for (const id of list) {
      for (const cyc of faceCycles[id]) {
        for (const start of cyc) {
          if (used.has(start) || !isRim(start)) continue;
          const loop: number[] = [];
          let h = start;
          let guard = 0;
          do {
            used.add(h);
            loop.push(h);
            // Pivot around the end vertex until the outline continues.
            let n = next[h];
            while (!isRim(n) && guard++ < H * 4) n = next[n ^ 1];
            h = n;
          } while (h !== start && guard++ < H * 4);
          d += pathOf(loop);
        }
      }
    }
    return d;
  };

  const bounds = (ids: Iterable<number>): [number, number, number, number] | null => {
    let b: [number, number, number, number] | null = null;
    for (const id of ids) {
      const f = faces[id];
      if (!f) continue;
      b = b
        ? [
            Math.min(b[0], f.bbox[0]),
            Math.min(b[1], f.bbox[1]),
            Math.max(b[2], f.bbox[2]),
            Math.max(b[3], f.bbox[3]),
          ]
        : [...f.bbox];
    }
    return b;
  };

  return { size, faces, guides, vertexCount: V, edgeCount: E, locate, merge, bounds };
}
