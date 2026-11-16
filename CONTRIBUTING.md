# Contributing

Bug reports, new grids and fixes are welcome.

## Set up

```bash
git clone https://github.com/jsxcultivator/gridmark.git
cd gridmark
npm install
npm run dev
```

## Before you open a pull request

```bash
npm run typecheck
npm test
npm run build
```

CI runs the same three commands.

## Where things go

- A new grid: one entry in `src/lib/grids.ts`. Read [docs/GRIDS.md](docs/GRIDS.md) first. The tests check every grid automatically.
- Geometry changes: `src/lib/geometry.ts`, with a test in `tests/geometry.test.ts`. Be careful with the tolerances at the top of the file; the architecture notes explain why they are what they are. [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) explains the algorithm.
- UI changes: `src/components/` and `src/app/globals.css`. Check both themes and a narrow window.

## Ground rules

- Do not rename a grid id or change the guides of an existing grid. Both break saved drawings and share links.
- Keep the app client-only. No accounts, no tracking, no server.
- Keep dependencies few. The geometry engine has none and should stay that way.
- Write interface text in plain words and sentence case.

## Reporting a bug

Include the grid, what you did, and what you expected. A share link to the drawing is the fastest way to reproduce a geometry bug.
