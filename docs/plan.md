# Motion Builder 2.0 — plan (summary)

Full, current plan with diagrams: https://claude.ai/artifact/DnRUjhGEjxW51N8FoYFBbv

## Flow
1. Drop in a design (Figma, SVG/PDF, image) → editable layer nodes with roles.
2. AI proposes three choreographies (smooth, punchy, playful) as scene doc JSON.
3. Refine with keyframes in the timeline or inside nested networks.
4. Export: After Effects (native layers), MP4 / ProRes with alpha, batch from .srt or CSV.

## Roadmap (each phase ends with a gate)
- [x] 0 Foundation — scene doc v2, anime-ae TS core, `evaluateFrame` + frame cache. Gate: all eases match Motion Builder v1 ✅, Phase matches v1's rig bit for bit ✅, `evaluateFrame` tested ✅.
- [ ] 1 Comp editor — canvas, timeline + graph editor, network view with subnets. Gate: Techonomy lower third rebuilt in under 10 min.
  - [x] a. Store (validated edits, patch undo/redo) + Canvas 2D viewer with web fonts, safe areas, motion blur, transport
  - [x] b. Timeline: ruler scrub, playhead, layer bars (move/trim), key diamonds (drag, delete, J/K), Phase ranges per part, subnet dive-in with breadcrumb
  - [x] c. Inspector editing with undo: key diamond, prev/next key, ease of the key at the playhead (v1 menu + amount), modifier list (wave, noise, stagger), promoted controls with reset, layer timing and role, comp settings
  - [x] d. Network view (@xyflow/react): drag nodes, draw and delete wires, delete nodes, add from the library, double-click a Subnet to dive in, breadcrumb back up; wire loops rejected by `validateDoc`
  - [x] e. Graph editor (value / speed per axis): click a segment, drag bezier handles (stored as the segment's `cubicBezier` ease), "Make curve editable" turns a menu ease into its closest bezier
  - [x] f. Layout follows content (done: Text `maxWidth` + `overflow` shrink/wrap, read-only `bounds` on layers, `link` modifier with scale/offset/min/max; example `lowerThirdFit` in the library): Bounds/Fit node (shape size = measured text + padding, max width with shrink or wrap) and the `link` modifier, so animation targets the fitted size. Needed before any data-driven template.
- [ ] 2 Output — AE native layers (one per character), MP4 / ProRes with alpha, motion blur. Gate: preview, render and AE match frame by frame.
  - [x] ProRes 4444 with alpha (.mov) from the app: frame-stepped render (`render/renderComp.ts`), float premultiplied motion blur, v1's encoder (verbatim, checked with ffprobe) in parallel workers
  - [x] MP4 via WebCodecs (H.264 + mp4-muxer, over the comp background or black; checked in a <video> element: size, length, colour)
  - [~] AE export (built, not yet run in real AE): `.jsx` from the Render panel; one comp per comp, one precomp per Subnet instance, one layer per drawable (per character / word when split), every channel baked by v1's baker into AE bezier keys within tolerance, reveals as keyed masks, no expressions. Tested against a mock AE object model. Open: a run in After Effects, blur calibration (canvas blur vs AE Blurriness), animated colours and text content, non-uniform scale keys (linear for now)
  - [ ] Frame-diff tests: preview vs render vs AE on reference scenes
- [x] 2b Data-driven batch (first version): Batch panel reads a Google Sheet shared by link (polled every 30 s while open), maps columns to the asset's controls (auto-matched, Dutch and English), file name template, row preview, QC (empty cells, duplicate names, outside action safe), renders ProRes/MP4 into a chosen folder with a manifest so re-runs only render changed rows. Settings live in the doc (v3, `batches`). Open: render in workers off the page, 1000-row gate run, glyph coverage check.
- [ ] UI redesign (soft direction, `docs/ui-handover.md`, approved 2026-11-12). Gate: the acceptance checklist in the handover.
  - [x] A. Tokens and shell: light/dark tokens (light default, theme remembered per browser), restyled primitives, grid with rail, collapsible library, viewer card with view pills and floating transport, inspector and timeline cards, top bar with flow stepper; drag handles between the cards (library and inspector width, timeline height)
  - [x] B. One layer list in the timeline (tree with connectors, material dot, role), selection-driven UI: click a layer in the viewer, tree or network and the outline, contextual toolbar (material, in-ease → Graph, key position), inspector (Motion / Look / own params / folded Transform, Modifiers, Layer, "Designers can edit") and network follow. Library is Materials (solid colours: click or drag onto a layer) / Presets / Brand; the node catalog moved to + Add in the timeline card
  - [ ] C. Graph tab presets and motion preview from the core eases
  - [ ] D. Materials → now part of 3D-a below (physical materials on 3D objects; glass and metal on flat layers go through the same renderer)
  - [ ] E. Other screens: Import, Draft, Edit mode, Deliver, Materials editor
- [ ] 3D — scene layer, cloners and fields, Cinema 4D style (decided 2026-11-12, references in `docs/references/`). A **3D scene** layer is a subnet of 3D nodes that renders into the comp as one layer, so 2D type can sit above or below it. The core evaluates it (what is cloned where, which colour, every transform at time t; pure and seeded); three.js only draws it, the same code in preview and final render, frame-stepped. Gate per step below; preview and render match within tolerance (frame-diff tests).
  - [ ] a. 3D scene layer: Scene3D subnet, Text 3D (extrude depth + bevel from the real font outlines, opentype.js), Extrude Shape, Camera (position, target, lens, keyed), studio light / environment (soft, hard, overcast), physical materials as nodes wired into a layer's `material` input (solid, plastic, plaster, glass, metal, iridescent, emissive; three.js `MeshPhysicalMaterial` params; brand kit `brand.materials` for reuse). Shadows and ambient occlusion. Flat layers with a non-solid material render through the same pass. AE: the 3D layer exports as a ProRes 4444 pass with alpha in its own precomp; 2D stays native. Gate: a rotating extruded title with soft shadows, preview = render.
  - [ ] b. Cloners, effectors and fields (moved up from phase 6, work in 2D and 3D): Cloner (grid, linear, radial, object), effectors (random — seeded, plain, step, delay / spring), fields (linear, spherical, noise, random) with falloff, clone index and colour from a palette. Instanced drawing for hundreds of clones. Gate: rebuild the "UNIQUE" grid reference (`3d-cloner-grid.jpg`): cloned 3D words, random palette colours, sliding rows, camera tilt.
  - [ ] c. Splines and deformers: spline / helix nodes, cloner along a spline, text on path, twist and bend deformers. Gate: rebuild the helix type reference (`3d-helix-type.jpg`): extruded condensed type around a turning helix in a plaster material, with flat 2D labels on top.
  - [ ] d. Look: live renderer judged against the references; optional slower path-traced final render if the live look falls short (plaster, soft contact shadows). Camera / `.glb` export for C4D later.
- [ ] 3 Exact import — Figma plugin, SVG/PDF, font check, roles, Techonomy brand kit. Gate: Figma frame imports 1:1 with editable text.
- [ ] 4 AI first draft — role tagging, three options, prompt steering. Gate: usable options for 8 of 10 test designs.
- [ ] 5 Assets + subtitles — motion asset library and designer controls; subtitles from .srt (batch from sheets moved to 2b). Gate: a designer ships 20 lower thirds solo.
- [ ] 6 Procedural nodes — loop and the rest of the Nodal prototype's nodes, usable inside any subnet (cloners, effectors and fields moved to 3D-b). Data node: sheet rows feed a cloner inside a comp (credits, speaker lists, leaderboards, chart bars).
- [ ] 7 Reference input — reference video (timing + speed curves), image recreate with overlay diff.

## Order from here
UI phase C (Graph presets) → 3D-a → 3D-b → 3D-c → UI phase E (other screens) → AE run in real After Effects + 3D pass export → phases 3–7.

## Sources to reuse
- Motion Builder v1 (single HTML): presets (pickers, toasts, popups, counters), States, AE importer panel, ProRes path.
- Nodal prototype (React + three.js): node math for fields, delay, wave, spring, cloners and their tests; WebCodecs capture; xyflow setup.
- Reference looks for 3D: `docs/references/3d-helix-type.jpg` (extruded type on a turning helix, plaster, studio light) and `docs/references/3d-cloner-grid.jpg` (grid cloner of extruded words, random palette colours, camera tilt).
