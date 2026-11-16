# User guide

## The screen

- **Sheet** in the middle: a 240 x 240 unit artboard with the grid's guides drawn on it. The corner ticks are crop marks, not part of the drawing.
- **Tools** on the left (along the bottom on a phone).
- **Grids** on the right, with the current grid's name and what it is good for at the top. Thumbnails show the middle of each grid, enlarged. On a phone, tap the grid name in the status bar to open the list.
- **Status bar** under the sheet: the current grid, how many cells are filled, and zoom.

The interface is neutral grey on purpose, so it does not tint how you see your colours. On the sheet, thin blue lines are the guides and the magenta outline is the cell under the pointer. Neither is part of the drawing.

The theme follows your system setting until you switch it with the sun or moon button; after that your choice is remembered.

## Drawing

| Do this | To get this |
| --- | --- |
| Click an empty cell | Fill it with the current colour |
| Click a cell that already has the current colour | Clear it |
| Click a cell that has another colour | Recolour it |
| Drag | Fill every cell the pointer crosses |
| Drag with the eraser | Clear every cell the pointer crosses |

A drag always fills, even when it starts on a filled cell, so you can extend a shape from its edge.

Cells of the same colour that share an edge join into one shape. Cells that only touch at a corner stay separate.

## Tools and shortcuts

| Tool | Key | Notes |
| --- | --- | --- |
| Draw | `V` or `B` | |
| Erase | `E` | |
| Move the sheet | `H` | Or hold `Space` and drag, or drag with the middle mouse button |
| Mirror | `M` | Cycles: off, left and right, top and bottom, both |
| Show or hide guides | `G` | Hide them to see the mark on its own |
| Undo | `Ctrl+Z` | `Cmd+Z` on a Mac |
| Redo | `Ctrl+Shift+Z` or `Ctrl+Y` | |
| Zoom in, zoom out | `+`, `-` | Or scroll the mouse wheel, or pinch |
| Fit the sheet | `0` | Or click the zoom percentage |
| Close a panel | `Esc` | |

A trackpad two-finger scroll moves the sheet. Pinch, or hold `Ctrl` and scroll, to zoom.

## Colour

The first swatch is **ink**. It follows the theme (white on dark, black on light) and you choose black or white when you export. Use it for single-colour marks.

The other swatches are fixed colours. **Custom** opens the browser colour picker for anything else.

## Mirror

With a mirror on, every cell you fill or clear is repeated across the centre of the sheet. A mirrored cell is found by reflecting a point inside the cell you touched, so mirroring works best on grids that are symmetric about the centre. Every grid is symmetric left to right. Tumbling blocks, Bricks, Three centres and Fan are not symmetric top to bottom, so on those four the top and bottom mirror can land on a cell of a different shape.

## Changing grids

There is one drawing, and it stays on the sheet when you pick another grid. Only the guides change.

The cells you click are always those of the grid on the sheet, so a new grid gives you new shapes to work with on the same drawing:

- Filling a cell adds its whole shape to the drawing, over whatever was there.
- Erasing a cell removes exactly that shape, even from the middle of something drawn on another grid.
- Clicking a cell that is only partly filled fills the rest of it.

For example, draw a block on Square, switch to Dial, and erase a ring out of it.

The cell count in the status bar counts cells of the current grid that are completely filled, so it changes from grid to grid while the drawing does not.

A drawing that uses many different grids takes a little longer to switch and paint, because each grid adds its guides to the set the drawing is cut along. Clearing the sheet starts fresh.

## Export

Click **Export** to open the panel. The preview shows exactly what will be saved.

| Option | Choices |
| --- | --- |
| Format | SVG, or PNG at 512, 1024, 2048 or 4096 px on the longest side |
| Crop | Trim to drawing (with an adjustable margin), or the full 240 x 240 sheet |
| Ink | Black or white. Shown only if the drawing uses ink |
| Background | Transparent, or a solid colour you pick |

**Copy SVG** puts the SVG markup on the clipboard. Paste it into Figma, Illustrator, Inkscape or straight into HTML.

The SVG has one `<path>` per colour. Straight runs are single lines and curves are true arcs, however many cells or grids they were built from. Guides are never exported.

## Share links

**Copy link** copies a URL that holds the current grid and drawing. Anyone who opens it sees the same drawing and can keep editing. Nothing is uploaded: the drawing is in the part of the URL after `#`, which browsers do not send to the server.

Opening a share link replaces your drawing. Undo brings yours back.

## Where drawings are kept

In your browser's local storage, on your device. Clearing site data deletes them. To keep a drawing somewhere safe, export it or save its share link.
