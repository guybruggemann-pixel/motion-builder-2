# Motion Builder 2.0 — project rules

Motion design app for a team of 2 motion designers and 2 designers. Drop in a design, get it rebuilt as editable layers, get three first animations, refine with keyframes and nested node networks, export to After Effects, MP4 or ProRes. Full plan: `docs/plan.md`.

## Architecture rules (do not break)

- **One scene doc is the source of truth.** `src/core/scene/schema.ts` (zod). The UI, the AI and every exporter read and write this JSON. No output-affecting state lives anywhere else (inspection views, selection and UI layout are not output).
- **Every doc passes `validateDoc` before use**, whether it comes from disk, an importer or the AI.
- **Evaluation is pure and deterministic.** Same doc + same time = same frame. No `Math.random`, no wall clock, no DOM reads in `src/core`. Seeded noise and the Park-Miller shuffle only.
- **`src/core` has no UI or renderer imports.** No React, no three.js, no canvas. It must run in Node for tests and in a worker for rendering.
- **Comps are networks; subnets are precomps.** A network with `comp` settings has a timeline. A `Subnet` node opens into another network. No cycles.
- **Every parameter is a stack:** base value → keyframes → modifiers. Keys and procedural modifiers add up; never make the user choose between them.
- **Motion assets** are subnets with promoted controls. Designers only see the promoted controls.
- **The anime-ae core must stay identical to `fixtures/anime-ae-core.es3.js`.** That ES3 file is the After Effects runtime. `test/parity.test.ts` enforces it. Change both or neither.
- **Time in the doc is seconds.** anime-ae works in ms internally; convert at the edge.
- **Catalog first.** A new node type is added to `src/core/scene/catalog.ts` with its params, then its evaluator, then tests, then UI.

## Outputs

- **After Effects:** native layers, keyframes at key times with ease converted, baking only what AE can't express (spring, elastic, modifiers). One layer per character when per-character motion looks better. No expressions in exported comps.
- **Web render (master for social and web jobs):** frame-stepped, never wall clock, sub-frame motion blur, WebCodecs MP4; ProRes 4444 with alpha.
- Preview, render and AE must match. Every phase adds frame-diff tests on reference scenes.

## How Guy works (respect this in the app and in code you touch)

- Versioning: duplicate comps with a `_v02` suffix so the previous version stays intact (`versionOf` in the schema).
- In AE: keep his comp structure; don't add expressions.
- Designers know Motion Builder v1's ease names (`MENU_EASES`). Keep that vocabulary in the UI.

## Working rules

- Run `npm test` and `npm run typecheck` before calling anything done.
- Keep `docs/plan.md` and the roadmap checkboxes current when a phase item lands.
- Each folder with non-obvious rules gets an `AGENTS.md`; read it before editing that folder.
- Prefer small, verifiable steps; show a running result in the browser for any UI change.
