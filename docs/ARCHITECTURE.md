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
    overlay.ts        one drawing across several grids
    document.ts       drawing state, undo history, share links, autosave
    export.ts         SVG and PNG output
tests/                Vitest suites for geometry, document and export
```

## From guides to cells

A grid is only a list of segments and circles. `buildArrangement` in `geometry.ts` turns that list into cells. This is the classic planar arrangement problem, solved in six steps.

1. **Normalise.** Clip segments to the sheet, drop anything outside or on the edge, drop duplicates, and add the four edges of the sheet as segments.
2. **Find vertices.** Intersect every pair of guides: segment with segment, segment with circle, circle with circle. Tangent contacts count as a single point. Points within a billionth of a unit of each other snap to one vertex, which is what makes many guides meeting at one point behave. The tolerance is deliberately tiny; see "Why the tolerances are so tight" below. Each circle also gets a vertex at each quarter point, so no arc spans more than 90 degrees.
3. **Cut edges.** Sort the vertices along each guide and connect neighbours. A segment becomes straight edges, a circle becomes arcs. Arcs outside the sheet are dropped. Where two segments run along the same line, each is cut at the other's ends and the shared stretch is stored once.
4. **Order edges around each vertex.** Every edge is two half-edges, one in each direction. At each vertex the outgoing half-edges are sorted by angle. A straight edge uses the direction of the guide it lies on. An arc is measured to a point a short way along it, not from the tangent. For an arc this turns the angle slightly towards the side it bends to, so a line and a circle that are tangent at a vertex still sort in the right order.
5. **Walk the faces.** From any half-edge, the next one around the same face is found by going to the far vertex and taking the neighbour of the reverse half-edge in that vertex's sorted list. Following `next` until it loops traces one face. The largest loop is the outside of the sheet. Loops wound the other way are cells.
6. **Attach islands.** A guide that touches nothing else, such as a lone circle, forms its own island. Its outer loop becomes a hole in whichever cell contains it.

Each cell keeps its exact SVG path (with `A` commands for arcs), a flattened outline for hit testing, a bounding box, and a point known to be inside it.

Building a grid takes a few milliseconds. Results are cached per grid for the session.

## From cells to shapes

`Arrangement.merge(ids)` returns the outline of a set of cells with interior edges removed. A half-edge is on the outline when its own cell is in the set and the cell across the edge is not. Starting from any such half-edge, the outline is followed by pivoting around each vertex until the next outline half-edge appears. Outer boundaries and holes come out wound in opposite directions, so the default non-zero fill rule renders them correctly.

The outline is then tidied. Consecutive straight edges on one line become a single `L`. Consecutive arcs on one circle become a single arc, written as pieces of at most a third of a turn. That last part matters: the end points are rounded to three decimals, and an arc close to a half turn is pinned down so loosely by its end points that this rounding can move it by a quarter of a unit.

The canvas and the exporter both call `merge` once per colour. That is why a drawing looks seamless on screen and exports as one path per colour.

## One drawing across grids

A drawing is not tied to the grid it was made on. `overlay.ts` stores it against a **basis**: an ordered list of grid ids. The guides of every grid in the basis are fed to `buildArrangement` together, which cuts the sheet into **pieces**. The drawing is a map from piece id to colour.

Every cell of every grid in the basis is a whole number of pieces. So filling or erasing a cell means setting or deleting its pieces, and the result is exact: no polygon clipping, no flattened curves, and the exporter still sees true arcs.

Three operations keep this going:

- **`piecesByCell(gridId, basis)`** lists the pieces inside each cell of a grid. It locates each piece's interior point in the grid's own arrangement.
- **`rebase(cells, basis, gridId)`** runs when the grid on the sheet changes. If the grid is not in the basis it is added, and each new, smaller piece takes the colour of the old piece that contains it. Then every other grid is tried for removal: a grid can go if each piece of the remaining basis is one colour throughout. Grids you only looked at leave no trace, and the basis stays as small as the drawing allows.
- **`wholeCells(cells, gridId, basis)`** gives the drawing as seen from one grid: the cells that are filled edge to edge in one colour. The canvas uses it to decide whether a click should clear a cell.

Arrangements and piece lists are cached by basis for the session. Two grids make at most about 3,000 pieces and build in under 50 ms; five can reach 15,000 and take about 150 ms.

### Why the tolerances are so tight

Laying grids over each other produces near misses that a single designed grid never has. The typical case: two circles of one grid touch at a point, and a line of another grid passes a few thousandths of a unit away. Near the touching point the two circles are less than a millionth of a unit apart, so the line crosses them at two points that are almost, but not quite, the same.

If those two crossings are snapped into one vertex, the edges around it can no longer be laid flat: the walk in step 5 joins cells that should be separate. So the snap distance is a billionth of a unit, and a line or circle only counts as touching a circle when it does so to within rounding error.

`Arrangement.defect` measures this. It is zero when vertices, edges and loops satisfy Euler's formula for a flat sheet. The tests require zero for every grid, every pair of grids, a sample of triples, and the reduced case that first showed the problem.

## Hit testing

The canvas does not create a DOM element per cell. Pointer positions are converted to sheet coordinates and passed to `Arrangement.locate`, which checks bounding boxes and then runs a point-in-polygon test on the flattened outline. During a drag the pointer path is sampled every 3 pixels so a fast stroke does not skip cells.

Mirror drawing reflects the interior point of the touched cell and calls `locate` again.

## State

`document.ts` holds a reducer over this shape:

```ts
interface Doc {
  gridId: string;                 // the grid on the sheet, always part of the basis
  basis: string[];                // the grids the drawing is cut along
  cells: Record<number, string>;  // piece id -> colour
}
```

A colour is `"ink"` or `#rrggbb`. History is a list of past and future documents. A stroke is one undo step: `begin` opens a stroke, and only the first `paint` that changes anything pushes a history entry. Changing grid is not an undo step, and undo never changes which grid is on the sheet: the restored drawing is rebased onto it.

Persistence:

- **Autosave** writes the document to `localStorage` under `gridmark:doc:v2`. A `v1` document, from when each grid had its own drawing, is converted on first load.
- **Share links** put the document in the URL hash: `#g=<grid>&b=<basis grid>+<basis grid>&d=<colour>.<run>.<run>~<colour>.<run>`. `b` is left out when the basis is just the grid on the sheet. A run is a base-36 piece id, or `a-b` for consecutive ids.

## Rendering

The sheet is one SVG. Pan and zoom are a single `transform` on a group. Guides are one path with `vector-effect: non-scaling-stroke`, clipped to the sheet. The drawing is one path per colour, merged from its pieces. The hovered cell is one extra path. The DOM stays small whatever the grid.

## Interface

All styling is in `globals.css`, driven by a small set of CSS variables defined once per theme.

- **Chrome is achromatic.** Panels, buttons and text are neutral greys with no tint, in both themes. A mark should be judged against nothing but itself, which is why drawing tools are grey.
- **Colour means something, and only on the sheet.** `--guide` (blue) draws construction lines. `--pick` (magenta) outlines the cell under the pointer. They borrow the guide and smart-guide colours designers know from other tools. Neither is used for buttons or decoration.
- **State is shown with ink, not colour.** The tool in hand and the primary action are solid `--ink` with `--on-ink` text. A setting that is merely switched on gets an outline.
- **Type is Jost**, a face drawn from circles and straight lines, like the grids.

The theme is set before first paint by a small inline script in `layout.tsx`. It uses a stored choice if there is one and the system setting otherwise.

## Export

`buildSvg` computes the bounding box of the filled cells (or uses the full sheet), then writes an optional background rectangle and one merged path per colour. PNG export draws that SVG onto a canvas at the chosen size.

## Limits worth knowing

- Piece ids depend on the grid definitions. Changing a grid's guides scrambles drawings and links that involve it. See [GRIDS.md](GRIDS.md).
- The engine uses ordinary floating point. Every pair and every triple of the built-in grids has been checked, and 500 random sets of four and five. Larger combinations are not checked exhaustively.
- Pieces thinner than about a hundred-thousandth of a unit can be assigned to the wrong neighbour. They are far too small to see or to matter in an export.
- Cells cannot be filled from the keyboard.
- Bounding boxes come from flattened outlines, accurate to 0.01 units.
