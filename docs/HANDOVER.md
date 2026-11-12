# Motion Builder 2.0 — full handover

Written 2026-11-12 at commit `78d586a` (main, pushed to `github.com/guybruggemann-pixel/motion-builder-2`, private), for continuing the work in Lovable or any other agent. Read this first, then `CLAUDE.md` (the rules), `docs/plan.md` (roadmap with checkboxes), `docs/decisions.md` (why things are the way they are), `src/core/AGENTS.md` and `src/app/AGENTS.md` (folder rules and hard-won lessons).

---

## 1. What this is, in one paragraph

A browser motion-design app for a team of 2 motion designers and 2 designers. A **scene doc** (one JSON, zod schema) holds comps as **node networks** (Houdini-style; a Subnet is a precomp). Every parameter is a **stack**: base value → keyframes → modifiers (wave, noise, stagger, link). A pure, deterministic **core** evaluates a doc at a time into drawables; the **app** draws them (Canvas 2D for 2D, three.js for 3D scenes), edits the doc through validated, undoable recipes, and exports **ProRes 4444 / MP4**, **batches from a live Google Sheet**, and **After Effects passes + AOVs** (beauty per layer, alpha mattes, puzzle mattes, depth) with an assembly script. It has a Cinema 4D-style 3D layer (extruded text from real font outlines, physical materials, camera, lights, cloners, effectors, fields).

## 2. Run it

```bash
npm install
npm run dev        # http://localhost:5173 (Vite, root is src/app)
npm test           # vitest: 565 tests, 1 skipped (SVG path test needs a DOM)
npm run typecheck  # tsc --noEmit, must be clean
npm run build      # outputs dist/
```

- Node 22+ works (developed on Node 26). Chrome or Edge for the app: it uses File System Access (folder pickers), WebCodecs (MP4), OffscreenCanvas + WebGL (3D).
- `ffmpeg`/`ffprobe` on the PATH make `test/prores.test.ts` check real ProRes output; without them those checks skip.
- **Vite root is `src/app`** (`vite.config.ts`), with aliases `@core` → `src/core`, `@` → `src/app`. `index.html` lives in `src/app`. If a tool (Lovable) expects `index.html` at the repo root, see §13.

## 3. The rules that keep it working (from CLAUDE.md, condensed)

1. **One scene doc is the source of truth** (`src/core/scene/schema.ts`). No output-affecting state anywhere else. View state (selection, playhead, tabs, theme, pane sizes) lives in `uiStore` and never affects output.
2. **Every doc passes `validateDoc`** (zod + catalog + wiring checks) before use. The doc store rejects any edit whose result fails it.
3. **`src/core` is pure and deterministic**: no React, no three.js, no canvas, no DOM, no `Math.random`, no clock. Seeded noise and Park-Miller only. `test/boundaries.test.ts` enforces the imports.
4. **Catalog first**: a new node type goes into `src/core/scene/catalog.ts` with params, then its evaluator, then tests, then UI.
5. **Time in the doc is seconds**; anime-ae works in ms internally.
6. **`src/core/motion` is a 1:1 port of `fixtures/anime-ae-core.es3.js`** (Motion Builder v1's ease engine). `test/parity.test.ts` keeps them bit-identical. Change both or neither.
7. **AE gets renders, not a rebuild** (decided 2026-11-12). New features never need an After Effects equivalent. The old native-layer AE export is frozen: keep it working, don't extend it.
8. **Preview and render must match**; every pass must line up with the beauty pixel for pixel.
9. Guy's working habits: version comps as `_v02` duplicates (`versionOf`), keep his AE comp structure, no expressions, keep v1's ease names (`MENU_EASES`) in the UI.
10. Before calling anything done: `npm test` and `npm run typecheck` green, and show UI changes running in a browser.

## 4. Repository map

```
CLAUDE.md                 project rules (read first)
docs/
  HANDOVER.md             this file
  plan.md                 roadmap with checkboxes, current state per phase
  decisions.md            decision log (stack, styling, fonts, renderer, AE, batch, sheet access…)
  ui-handover.md          the approved UI redesign (soft direction), phases A–E
  ui-reference/*.dc.html  design mockups (read for spacing/copy; not app code; need a runtime that isn't in the repo)
  references/             3D reference looks (helix type, cloner grid) used as gates
fixtures/
  anime-ae-core.es3.js    v1 ease engine (ES3, the AE runtime) — parity source
  anime-ae-rig.es3.js     v1 phase rig — parity source
src/core/                 PURE. Runs in Node, workers, browser.
  AGENTS.md
  motion/                 eases.ts, stagger.ts, presets.ts (MENU_EASES, easeString/easeChoice, CHARACTERS)
  scene/
    schema.ts             zod schema, DOC_VERSION = 3
    migrate.ts            v2 → v3 (adds batches)
    validate.ts           validateDoc, promotedSpecs
    catalog.ts            every node type: category, label, inputs, named ports, params with defaults
    evaluateParam.ts      base → keys → modifiers; link modifier; seeded noise
    evaluate.ts           evaluateFrame (2D parts → drawables), Phase, Split, Subnet, Scene3D, 2D cloners, buildScene (3D), attachClones
    phase.ts, delays.ts   v1's animate in/out rig (bit-exact parity)
    text.ts               layout (maxWidth, shrink, wrap), measuring is injected
    matrix.ts             2D (AE layer order), scene3d.ts 4×4 + camera maths
    clone.ts              cloners, effectors, fields, cloneRandom, applyReveal
    materials.ts          MATERIAL_PRESETS, KIND_DEFAULTS, presetParams
    graph.ts              layerOrder, chainAfter, inputsOf (named ports excluded)
    frameCache.ts         per-doc frame cache (docs are immutable; identity is the key)
    examples/             lowerThird, lowerThirdFit, title3d, uniqueGrid (test content, also the Presets)
  batch/index.ts          CSV, applyRow, fileName template, QC, sheetCsvUrl, hash
src/app/                  React 19 + zustand + immer + Tailwind 4
  AGENTS.md               app rules and lessons (read before editing)
  App.tsx                 the shell grid; bottom card with Timeline / Graph / Network tabs
  main.tsx                mounts App, installs the 3D pass hook
  useShortcuts.ts         Space, ←/→, Home/End, J/K, E/R tools, Esc, Delete, ⌘Z/⇧⌘Z
  store/                  docStore (validated edits, patch undo/redo, coalesce + commit), uiStore (view state), navigation (subnet path)
  shell/                  TopBar (flow stepper, comp name → settings), Rail, Splitter (pane resizing), look.tsx (Sphere, MiniCurve, role labels, cssColor)
  design-system/          Brandbook structure on Tailwind 4 + cva, retokened to the soft light/dark direction
  viewer/                 Viewer (canvas, picking, drag move/turn, drop), Transport, Selection (outline + contextual toolbar), Gizmo, manipulate.ts, turn3d.ts, FieldOverlay
  timeline/               Timeline (layer tree + tracks), GraphEditor, ScrubBar, edits.ts
  inspector/              Inspector (Motion, Look, own params, folded Transform/Modifiers/Layer, material header, scene contents), controls.tsx, edits.ts
  network/                NetworkView (@xyflow/react, material/field ports), edits.ts (addNode, connect with ports, wireToOutput, insertAfter…)
  panels/                 Library (Materials / Presets / Brand), AddMenu (+ Add), materials.ts (apply recipes), insertPreset.ts
  render/
    canvas2d.ts           2D renderer, drawFrame/drawCompFrame, 3D hook, canvasMeasure, requestRedraw
    renderComp.ts         frame-stepped render (motion blur, only/transparent/scene3d options)
    renderJob.ts          ProRes/MP4 job, encoder worker pool (submit/drain back-pressure), has3D
    prores/               v1's ProRes 4444 encoder (verbatim ES3, loaded as text)
    mp4.ts                WebCodecs + mp4-muxer
    fonts.ts              bundled variable fonts, fontFiles
    outlines.ts           glyph outlines for 3D text (wawoff2 → TTF, fontkit)
    bounds.ts             drawable boxes, hitTest/hitTestAll, ownerIn
    three/pass.ts         three.js ScenePass: render (beauty / id / depth), pick, box, axes, planeDelta, project, depthRange, instancing
    three/install.ts      plugs the pass into canvas2d; shared on globalThis; load3D, pick3D, box3D, axes3D, planeDelta3D, project3D, depthRange3D
    passes/               AE passes: plan.ts, coverage.ts (matte maths), export.ts (one-sweep render + encode)
    frameDiff.ts          frame comparison helpers
    RenderPanel.tsx       Deliver popover: ProRes/MP4, AE passes checklist + export, frozen native AE export
  export/                 frozen native AE export (aePlan, bake, ae-build.jsx) + ae-passes.jsx (assembly script) + exportAe.ts (script generators)
  batch/BatchPanel.tsx    batch from a Google Sheet into a folder with a manifest
test/                     vitest suites, one per area (see §11)
```

## 5. The data model

- **SceneDoc v3**: `{ version: 3, name, root, networks[], brand?, assets[], batches[], source? }`. `root` must be a comp.
- **Network**: `{ id, name, comp?, nodes[], wires[], output, promoted?, versionOf? }`. A network with `comp` (width, height, fps, duration, background?, motionBlur?) has a timeline.
- **Node**: `{ id, type, name, enabled, params: Record<string, Param>, timing?: {in,out}, role?, subnet?, ui: {x,y} }`. Only `Subnet` and `Scene3D` may have `subnet`.
- **Param** (the stack): `{ value, keys?: [{ t, v, ease }], modifiers?: [{ id, type: wave|noise|stagger|link|audio, enabled, blend, params }] }`. A key's `ease` shapes the segment that starts at it (AE outgoing semantics). Eases are anime-ae strings: `outExpo`, `outBack(1.6)`, `cubicBezier(.2,0,0,1)`, `spring(.4,628)`, `hold`.
- **Wire**: `{ from: {node, port:"out"}, to: {node, port} }`. `port: "in"` is the main input. Named ports (from the catalog's `ports`): `material` (only a Material may feed it) and `field` (only a field node). Each named port takes one wire. Main inputs are pulled upstream from `output`; named ports are not part of that pull.
- **Promoted controls**: an asset network lists `promoted: [{ id, label, target: {node, param}, control }]`. Values set on the Subnet instance live as params named after the promoted id (full stacks, keys in parent time).
- **Brand kit**: `{ name, colors: [{token, value}], fonts: [{family, weights, role}], assets }`. Colour values may be `brand:token`; only whole values resolve as tokens. A Random effector's `palette` text resolves its own tokens.
- **Batches** (v3): sheet URL, target instance, column → promoted-control mapping, file name template. Rows are never stored in the doc.

### Node catalog (all in `catalog.ts`)
- 2D layers: `Text` (maxWidth, overflow none/shrink/wrap), `Shape`, `Image`, `Group`, `Subnet`, `Scene3D` (a 3D scene drawn as one layer).
- 2D split/animate: `Split` (characters/words/lines), `Phase` (v1 animate in/out: offsets, reveal wipes, stagger), `State` (stub).
- 3D (inside a Scene3D network): `Text3D`, `Shape3D` (extrude depth, bevel, `material` port), `Camera` (AE lens maths, 36 mm film back), `Light` (directional/point/spot, soft shadows), `Material` (kind: solid, plastic, plaster, glass, metal, iridescent, emissive + physical params + grain).
- Cloning (3D and 2D): `Cloner` (grid with rowSlide, linear, radial), effectors `Random` (palette, seed), `Plain`, `Step`, `Reveal` (per-clone animate in/out with phase timing; 3D), fields `LinearField`, `SphericalField`, `NoiseField` (into an effector's `field` port).
- Utility: `Merge`, `Output`.

### 3D world conventions (`scene3d.ts`)
px units, y up, origin at the scene centre, +z towards the camera, column-major 4×4 matrices (three.js), Euler XYZ in degrees, objects are TRS · −anchor, extrusions span ±depth/2, text outlines stay in 2D layout space with an `origin`. Default camera = AE's (z = 0 plane 1:1 at 50 mm). Opening a 3D network itself evaluates to one scene drawable (`sceneOwner`).

## 6. How evaluation works

`evaluateFrame(doc, networkId, t, { measure, flattenSubnets, instance, span })`:
1. Pull from the network's `output` upstream (main inputs, wire order = paint order).
2. Layer nodes emit parts; Split cuts text into parts; Phase animates parts (v1 rig, bit-exact); Subnets evaluate at local time (`t − timing.in`) with promoted overrides; a 2D Cloner copies parts (renumbered, so a Phase after it staggers over copies); 2D effectors offset parts and can set `anim.fill`.
3. Scene3D: `evalScene3D` → `buildScene` collects objects, lights, the first camera; `attachClones` runs each Cloner and its effector chain (with fields) and gives the object `clones` (scene matrices + colours) and `cloner` (for picking the group).
4. Parts → drawables: text runs, shapes, images, subnet drawables (exporters), scene3d drawables (`scene`: plain data three.js draws).

Measuring text is injected (`approxMeasure` in Node; `canvasMeasure()` in the app after `loadFonts()`).

## 7. The app (UI)

The approved redesign (`docs/ui-handover.md`): calm floating cards on a soft grey canvas, light by default, dark via the rail. Tokens in `design-system/.../styles.css` (`canvas, card, field, raised, stage, bar, ink, muted, faint, line, line2, volt`, warn/ok, axis colours). State rules: black pill = where you are / main action; white raised pill = selected; **volt only for live state** (playhead, key at the playhead, selection outline, running progress) and always with ink.

- **Shell**: top bar (project / comp name → comp settings, edit count, undo/redo, flow stepper, Animate/Edit, Batch, Deliver), icon rail (Library, theme), Library card, viewer card, inspector card, bottom card (Timeline / Graph / Network, breadcrumb, + Add). Gaps are drag handles (pane sizes per browser). Below 900 px it stacks.
- **Viewer**: dotted stage, comp with soft shadow, view pills (fit, format, safe areas, motion blur, transparency), floating transport (J/K, play, timecode, loop). Click picks the whole thing (a 3D scene layer, or inside a scene a Cloner); Shift+click picks the part. Contextual toolbar (name, material, in-ease, Move/Turn switch, key position). Gizmo: X/Y/Z arrows (move along an axis) or rings (turn), drag the body to move (2D in the comp, 3D parallel to the screen) or turn. E / R switch tools. Library tiles drop onto layers.
- **Timeline**: the one layer list (tree with connectors, material dot, role) + tracks (bars, phase ranges, keys, volt key at the playhead), ruler scrub.
- **Graph**: value/speed curves, bezier handles (presets and preview are UI phase C, not built).
- **Network**: xyflow node cards, material/field ports, double-click a Subnet/Scene3D to open it. Graph and Network have a ScrubBar.
- **Inspector** (ordered by intent): title + gear (comp settings) + on/off; promoted Controls; Motion (in/hold/out bar, ease cards); Look (material card or solid fill, opacity); the node's own params; folded Transform (2D placement for scene layers, Transform 3D for objects), Modifiers, Layer (timing, role); Material header (kind buttons with defaults, used by); "In this scene" for scene layers; "Designers can edit" inside assets.
- **Library**: Materials (scene materials, 12 presets, colours; click or drag), Presets (add into the comp as a precomp; "Open alone" replaces the doc), Brand.
- **+ Add**: lists what fits the open network; wires new layers into the output; chains Cloner after a selected object, effectors after a selected cloner, fields into a selected effector.
- **Deliver** (Render panel): ProRes 4444 + alpha / MP4; **After Effects passes** (beauty per layer + alpha mattes + puzzle mattes + depth, into a folder with `<comp>_passes.jsx`); frozen "Native AE layers (simple 2D)". **Batch** panel: live Google Sheet (shared by link, gviz CSV, polled every 30 s), mapping, QC, renders into a folder with a manifest (re-runs skip unchanged rows).

## 8. Outputs in detail

- **ProRes 4444**: Motion Builder v1's encoder (verbatim ES3 in `render/prores/`, loaded as `?raw` text and run with `new Function`) in a worker pool. Use `pool.submit` / `pool.drain` (back-pressure that waits only on running work; racing settled promises froze long renders).
- **MP4**: WebCodecs H.264 + mp4-muxer, over the comp background or black.
- **3D**: renders go through the same three.js pass as the preview; `renderJob` awaits `load3D()` when the doc has a Scene3D. A network rendered on its own keeps alpha.
- **AE passes** (`render/passes/`): one frame-stepped sweep renders each top-level layer alone (beauty), 3D scenes in ID colours (three objects per render; depth-correct puzzle mattes) and depth (white = near; range fixed over the shot); mattes are visible coverage (alpha × what's above leaves). Puzzles hold three elements; a scene layer whose objects have channels stays out. The `.jsx` puts beauty layers in the comp, mattes and depth in a hidden shy "Mattes" precomp, the puzzle legend in the comp comment and a disabled Camera Lens Blur next to the depth map. **Not yet run in real After Effects** (the gate). The Camera Lens Blur "Blur Map Layer" matchName (`ADBE Camera Lens Blur-0002`) is a guess, wrapped in try/catch.
- **Native AE export (frozen)**: v1's baker (`export/anime-ae-bake.es3.js`) bakes channels into AE bezier keys; one layer per drawable; 3D layers export as ProRes passes in their own precomp. Mock-AE tested only.

## 9. Fonts and 3D text

Bundled variable fonts (Inter, Inter Tight, JetBrains Mono via fontsource), registered under plain family names. 3D text outlines come from the same WOFF2 files: `wawoff2` (Google's decoder, wasm; in the browser its binding is loaded as text and run with our own `Module` because its wrapper only exports under Node; copy its output, it's a view into wasm memory) → TTF → `fontkit` (pinned **2.0.4**; its own WOFF2 variation path breaks on variable fonts) for weight + kerning. Outline widths match `canvasMeasure` exactly. Adding a family = add it to `render/fonts.ts`.

## 10. Dependencies that are pinned on purpose

`three@0.186.1` (+ `@types/three@0.186.0`), `fontkit@2.0.4` (+ `@types/fontkit@2.0.8`), `wawoff2@2.0.1`. Pinned exactly because newer releases were too fresh or broken for our use. Others: React 19, zustand 5, immer 11, zod 4, @xyflow/react 12, Tailwind 4, Vite 8, vitest 5, lucide-react, mp4-muxer.

## 11. Testing and verification

- `npm test` runs everything in Node: core evaluation, phase parity with v1 (bit-exact), ease parity, schema/migration, store/undo, every edit recipe (timeline, inspector, network, materials, presets, manipulate, turn), 3D evaluation, clones, outlines (real fonts), 3D geometry (three.js headless), passes maths and plan, AE scripts against a recording mock of AE's DOM, ProRes (with ffprobe when present), batch, frame-diff helpers.
- UI changes must be shown running. Lessons for browser testing (also in `src/app/AGENTS.md`):
  - A background tab doesn't size the viewer until it paints: take a screenshot first.
  - Never use `window.confirm/alert/prompt`: embedded browser panes dismiss them silently. Confirm inline.
  - Modules imported by hand in the console can be a different instance from the app's (Vite `?t=`): read state through the DOM. The 3D pass is shared on `globalThis` for this reason.
  - Test in a separate tab so a real session's doc isn't replaced (there is no save yet).

## 12. Roadmap status and what to do next

Done: phase 0 (foundation), 1 (comp editor a–f), 2 output (ProRes, MP4; native AE frozen), 2b (batch from a sheet), UI redesign A and B, 3D-a (scene layer, outlines, three.js pass, renders, materials), AE passes and AOVs (built; real-AE check open), 3D-b (cloners, effectors, fields, Reveal, 2D cloners, field overlay).

**Recommended next, in order:**
1. **Save / load** (highest value, nothing is persisted yet): save the doc as JSON (File System Access or download) + open (through `validateDoc` and `migrate`), autosave to IndexedDB, version duplicates (`_v02`, `versionOf`). The status pill in the top bar already counts edits.
2. **Real After Effects check** of the passes export (gate) and fix the Camera Lens Blur map wiring if needed. Later: contact-sheet comp of all passes (Guy asked for it as a nice-to-have).
3. **3D-d look**: metals are dark (raise environment for metals or add a reflection environment), glass doesn't refract layers behind it, ambient occlusion (GTAO) is missing, maybe a path-traced final render.
4. **3D-c**: splines/helix, cloner along a spline, text on path, twist/bend deformers (gate: the helix type reference).
5. **UI phase C** (Graph: ease preset grid, overshoot slider, motion preview from core eases) and **phase E** (Import, Draft, Edit mode for designers, Deliver screen, Materials editor screens from `docs/ui-reference`).
6. Phases 3–7: exact import (Figma plugin, SVG/PDF), AI first draft (three choreographies), assets + subtitles, more procedural nodes (data → cloner), reference video input.

Open smaller items: object cloner, separate Delay effector, picking a single clone; batch rendering in workers and the 1000-row gate run; glyph coverage QC; animated colours/text in the frozen native AE export; memory for very long AE pass exports (all encoded frames are held until written).

Open decisions: materials in Edit mode for designers (approved short list?), theme default for the team (light + remembered per browser is what's built).

## 13. Notes for continuing in Lovable

- **Connect the GitHub repo** (`guybruggemann-pixel/motion-builder-2`) rather than re-creating the project; Lovable edits the repo directly.
- **Project layout**: Lovable's templates expect `index.html` and `src/main.tsx` at the root with a standard Vite config. This repo keeps the app in `src/app` (Vite `root: src/app`) and the pure engine in `src/core`. If Lovable's preview can't start, the smallest fix is a root `index.html` that loads `/src/app/main.tsx` and removing `root` from `vite.config.ts` (keep the `@core` and `@` aliases). Don't merge `src/core` into the app: its purity is what makes renders, tests and workers work.
- **Give Lovable the rules**: paste §3 (or `CLAUDE.md`) into its project knowledge / custom instructions, plus the "lessons" bullets in §11. The ones most likely to be broken by a general agent: no `Math.random`/DOM/three.js in `src/core`; every edit through `docStore.edit(...)` (never mutate the doc); new node types catalog-first; don't edit `fixtures/*.es3.js` or the verbatim ES3 files (`render/prores/anime-ae-prores.es3.js`, `export/anime-ae-bake.es3.js`); don't upgrade the pinned packages casually; no `window.confirm`.
- **Keep the tests**: Lovable doesn't run `npm test` on its own. Run it locally (or in CI) after each Lovable change; consider adding a GitHub Action that runs `npm ci && npm test && npm run typecheck` on push.
- **Styling**: use the design-system tokens and components; no raw colours in UI; volt only for live state.
- **Browser features**: folder export, MP4 and 3D need Chrome/Edge; Lovable's preview iframe may block `showDirectoryPicker` (File System Access needs a top-level window) — open the preview in its own tab to test exports.

## 14. Known issues (honest list)

- Nothing is saved; a reload loses the doc.
- AE passes and the frozen native AE export have only run against a mock AE.
- Metal and glass looks need tuning; no ambient occlusion yet.
- Text 3D "parts" stop at the whole word (no per-letter 3D split yet).
- Large AE pass exports keep all encoded frames in memory until written.
- The Graph tab has no ease preset grid yet (UI phase C).
- Edit mode (designer view with promoted controls only) is a disabled button for now.
