# Mistboard contributor guide

## What this is

Mistboard is an early, browser-based shared tabletop prototype. It has a fixed 36″ × 36″ board, six sample models, shareable in-memory rooms, and live updates over a hand-written WebSocket server. It is not yet a rules-complete game or a Vassal-module importer.

## Repository layout

- `server.mjs` — dependency-free Node HTTP/WebSocket server, room store, message validation, and static-file serving.
- `src/main.jsx` — React application shell and the `PixiBoard` canvas integration.
- `src/geometry.js` — pure tabletop geometry helpers. Put measurement, base, collision, and template math here rather than in React or Pixi drawing code.
- `src/styles.css` — application-shell and canvas-container styling.
- `test/server.test.mjs` — Node test suite for room state and server behavior.
- `public/` — production browser build served by `server.mjs`.
- `public/assets/` — hashed Vite output. These files are intentionally committed because the Node server serves `public/` directly.

`src/circle-select.jsx` is a legacy file; the active range selector currently lives in `src/main.jsx`.

## Architecture boundaries

- Use React for controls, panels, menus, dialogs, and websocket/application state.
- Use PixiJS for everything drawn inside the tabletop: board, models, base/facing markers, templates, ranges, highlights, and pointer hit testing.
- Keep geometric calculations independent of rendering in `src/geometry.js`. Board positions use percentages; zero degrees faces toward the top of the board.
- The WebSocket server is authoritative for the shared model state. The currently supported messages are `move`, `rotate`, and `base`; successful updates broadcast a `state` payload.
- Client-only presentation state, such as selected model, ranges, rulers, and charge lanes, is not currently synchronized between players.

## Measurement conventions

- The board is `36` inches square (`BOARD_INCHES` in `src/geometry.js`).
- Model base data is stored in millimetres as `baseMm`, using 30 mm, 40 mm, or 50 mm.
- Convert base diameters with `baseDiameterInches()`, then use `inchesToPixels()` when drawing in Pixi. Do not treat inches as board percentages.
- Range circles measure from the base edge. A charge lane begins at the base edge and currently extends 10″.

## Local development

```sh
npm install
npm run dev
```

Open `http://localhost:3000`; the app places a room identifier in the URL. Open that exact URL in another tab to test synchronization.

Useful checks:

```sh
npm run build:controls
npm test
git diff --check
```

`npm run dev` builds the frontend before starting the Node server. If port 3000 is already occupied, use the existing server or start one with a different `PORT` value.

## Change workflow

1. Edit source files under `src/` and, when needed, `server.mjs`.
2. Run `npm run build:controls`; this refreshes `public/index.html` and hashed files in `public/assets/`.
3. Run `npm test` and `git diff --check`.
4. When committing frontend changes, include the matching generated `public/` changes. Do not add unrelated untracked files or directories.

Avoid replacing the raw WebSocket server with a framework unless the task explicitly calls for that architectural change; keeping it small is intentional at this stage.
