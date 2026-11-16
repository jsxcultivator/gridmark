# Architecture

Gridmark is a static, client-only Next.js app. There is no backend and no database.

```
src/
  app/
    layout.tsx        fonts, metadata, theme bootstrap
    page.tsx          renders <Editor />
    globals.css       all styling, two themes as CSS variables
  components/
    Editor.tsx        app state, toolbar, export panel, keyboard shortcuts
    Canvas.tsx        the sheet: rendering, pointer gestures, pan and zoom
    GridLibrary.tsx   grid picker with thumbnails
  lib/
    geometry.ts       guides -> cells (planar arrangement), merging, hit testing
    grids.ts          the 24 grid definitions and their helpers
    document.ts       drawing state, undo history, share links, autosave
    export.ts         SVG and PNG output
tests/                Vitest suites for geometry, document and export
```

## From guides to cells

A grid is only a list of segments and circles. `buildArrangement` in `geometry.ts` turns that list into cells. This is the classic planar arrangement problem, solved in six steps.

1. **Normalise.** Clip segments to the sheet, drop anything outside or on the edge, drop duplicates, and add the four edges of the sheet as segments.
2. **Find vertices.** Intersect every pair of guides: segment with segment, segment with circle, circle with circle. Tangent contacts count as a single point. Points within 0.0001 units of each other snap to one vertex, which is what makes many guides meeting at one point behave. Each circle also gets a vertex at each quarter point, so no arc spans more than 90 degrees.
3. **Cut edges.** Sort the vertices along each guide and connect neighbours. A segment becomes straight edges, a circle becomes arcs. Arcs outside the sheet are dropped.
4. **Order edges around each vertex.** Every edge is two half-edges, one in each direction. At each vertex the outgoing half-edges are sorted by angle. The angle is measured to a point a short way along the edge, not from the tangent. For an arc this turns the angle slightly towards the side it bends to, so a line and a circle that are tangent at a vertex still sort in the right order.
5. **Walk the faces.** From any half-edge, the next one around the same face is found by going to the far vertex and taking the neighbour of the reverse half-edge in that vertex's sorted list. Following `next` until it loops traces one face. The largest loop is the outside of the sheet. Loops wound the other way are cells.
6. **Attach islands.** A guide that touches nothing else, such as a lone circle, forms its own island. Its outer loop becomes a hole in whichever cell contains it.

Each cell keeps its exact SVG path (with `A` commands for arcs), a flattened outline for hit testing, a bounding box, and a point known to be inside it.

Building a grid takes a few milliseconds. Results are cached per grid for the session.

## From cells to shapes

`Arrangement.merge(ids)` returns the outline of a set of cells with interior edges removed. A half-edge is on the outline when its own cell is in the set and the cell across the edge is not. Starting from any such half-edge, the outline is followed by pivoting around each vertex until the next outline half-edge appears. Outer boundaries and holes come out wound in opposite directions, so the default non-zero fill rule renders them correctly.

The canvas and the exporter both call `merge` once per colour. That is why a drawing looks seamless on screen and exports as one path per colour.

## Hit testing

The canvas does not create a DOM element per cell. Pointer positions are converted to sheet coordinates and passed to `Arrangement.locate`, which checks bounding boxes and then runs a point-in-polygon test on the flattened outline. During a drag the pointer path is sampled every 3 pixels so a fast stroke does not skip cells.

Mirror drawing reflects the interior point of the touched cell and calls `locate` again.

## State

`document.ts` holds a reducer over this shape:

```ts
interface Doc {
  gridId: string;
  drawings: Record<string, Record<number, string>>; // grid id -> cell id -> colour
}
```

A colour is `"ink"` or `#rrggbb`. History is a list of past and future documents. A stroke is one undo step: `begin` opens a stroke, and only the first `paint` that changes anything pushes a history entry.

Persistence:

- **Autosave** writes the document to `localStorage` under `gridmark:doc:v1`.
- **Share links** put the active grid and its cells in the URL hash: `#g=<grid>&d=<colour>.<run>.<run>~<colour>.<run>`. A run is a base-36 cell id, or `a-b` for consecutive ids.

## Rendering

The sheet is one SVG. Pan and zoom are a single `transform` on a group. Guides are one path with `vector-effect: non-scaling-stroke`, clipped to the sheet. Filled cells are one path per colour. The hovered cell is one extra path. The DOM stays small whatever the grid.

## Export

`buildSvg` computes the bounding box of the filled cells (or uses the full sheet), then writes an optional background rectangle and one merged path per colour. PNG export draws that SVG onto a canvas at the chosen size.

## Limits worth knowing

- Cell ids depend on the grid definition. Changing a grid's guides scrambles drawings made on it. See [GRIDS.md](GRIDS.md).
- Collinear segments that partly overlap are not merged. Grid definitions avoid them.
- Cells cannot be filled from the keyboard.
- Bounding boxes come from flattened outlines, accurate to 0.01 units.
