# Adding a grid

A grid is a list of guides: straight segments and circles on a 240 x 240 artboard. Gridmark works out the cells by itself. You never list cells by hand.

All grids live in [`src/lib/grids.ts`](../src/lib/grids.ts).

## The shape of a grid

```ts
export interface GridDef {
  id: string;          // stable id, used in saved drawings and share links
  name: string;        // shown in the library
  family: "straight" | "round" | "radial";
  hint: string;        // one line on what the grid is good for
  build: () => Primitive[];
}

type Primitive =
  | { kind: "seg"; x1: number; y1: number; x2: number; y2: number }
  | { kind: "circle"; cx: number; cy: number; r: number };
```

Coordinates are SVG-style: `(0, 0)` is the top-left corner, x grows right, y grows down, and the sheet ends at `(240, 240)`.

## Helpers

| Helper | Returns |
| --- | --- |
| `seg(x1, y1, x2, y2)` | One segment |
| `circle(cx, cy, r)` | One circle |
| `through(px, py, deg)` | A line through a point at an angle, long enough to cross the sheet |
| `parallels(deg, spacing, px?, py?)` | A family of parallel lines, one of them through the point (the centre by default) |
| `squares(step, offset?)` | Horizontal and vertical lines every `step` units |
| `rings(cx, cy, step, count)` | Concentric circles |

Guides may run past the sheet. They are clipped when the grid is built, and anything that lies on the sheet's edge or outside it is dropped. Exact duplicates are dropped too.

## Example

A grid of squares with a ring of circles around the centre:

```ts
{
  id: "orbit",
  name: "Orbit",
  family: "radial",
  hint: "Squares with eight circles around the centre.",
  build: () => [
    ...squares(30),
    ...Array.from({ length: 8 }, (_, k) => {
      const a = (k * Math.PI) / 4;
      return circle(120 + 60 * Math.cos(a), 120 + 60 * Math.sin(a), 30);
    }),
  ],
},
```

Add the object to the `GRIDS` array. It shows up in the library under its family, with a thumbnail drawn from the same guides.

## Check it

```bash
npm test
```

The test suite builds every grid in `GRIDS` and checks that:

- the cells add up to the area of the sheet,
- no cell is smaller than 2 square units,
- every cell can be found again from its own interior point,
- the vertex, edge and cell counts satisfy Euler's formula,
- the same holds when the grid is laid over each of the others.

Then run `npm run dev` and fill some cells.

## What makes a good grid

- **No slivers.** A circle that passes very close to a crossing, without going through it, leaves a cell too small to click. Move the circle so it goes exactly through the crossing, or well clear of it. The size test catches this.
- **Meet exactly or not at all.** Guides that are meant to cross at one point must do so to within a billionth of a unit. Compute positions from one formula instead of typing rounded decimals: `30 * Math.sqrt(3)`, not `51.96`.
- **Under about 1,500 cells.** More than that is slow to draw on and hard to use.
- **Symmetric about the centre** if you can, so mirror drawing works. `parallels` and `rings` are centred by default.

## Rules that keep old drawings working

Saved drawings and share links store piece numbers, and a piece's number comes from the order in which the engine finds it among the guides of the grids involved.

- Never rename or reuse an `id`.
- Changing a grid's guides renumbers the pieces, which scrambles existing drawings and links that involve that grid. If a grid needs a real change, add it as a new grid with a new id and leave the old one in place.

## Grids are used together

A drawing can be continued on any other grid, so the engine lays your grid's guides over those of other grids. The test suite does this for your grid against every other grid, and for a sample of three at a time, and checks that the pieces still fit together. You do not need to design for it, but a failure there is a real bug worth reporting.
