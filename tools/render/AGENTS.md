# tools/render rules

The headless render job: `bun run render <doc.json>` (see `USAGE` in `args.ts`) and `bun run render:check`.

- **No second renderer.** `driver.ts` opens the app's `/render` page (`src/app/headless/`) in a background browser through Playwright and calls `window.mbHeadless`. Everything that decides a pixel stays in `src/app/render` and `src/core`. Don't draw, composite or encode here (PNG writing in `png.ts` is a lossless container for the page's RGBA, nothing more).
- The contract is `src/app/headless/types.ts` (types only, importable from Node). Change the page and the driver together and bump `version`.
- Browser: Google Chrome when installed (`channel: "chrome"`), because plain Chromium has no H.264 encoder and `--format mp4` fails there; ProRes and PNG work in both. `playwright-core` is used so no browser is downloaded on install.
- The app must be reachable at `--url` (default http://localhost:8080); the driver starts `vite dev` on that port when it isn't and stops it afterwards. On the dev server, editing source while a render runs reloads the page and kills the render.
- Results come back in 4 MB base64 slices (`read`), since a ProRes file doesn't fit in one message.
- Overrides are batch-row semantics: `--instance <network>/<node> --set control=value` sets promoted controls on one Subnet instance through `applyRow`, and the doc is validated again.
- **The gate:** `bun run render:check` renders the built-in examples (2D, 3D text, clones with AO and shadows) headless and in a real window and compares every frame. They match exactly today; keep it that way. Run it after touching `src/app/render`, the 3D pass or this folder. It opens a browser window, so it doesn't run in CI yet.
- `test/headlessRender.test.ts` covers the arguments, the PNG writer and doc preparation without a browser.
