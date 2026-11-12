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
  - [ ] B. One layer list in the timeline, selection-driven UI (contextual toolbar, inspector ordered Motion / Look / Transform / Modifiers)
  - [ ] C. Graph tab presets and motion preview from the core eases
  - [ ] D. Materials (open decisions first)
  - [ ] E. Other screens: Import, Draft, Edit mode, Deliver, Materials editor
- [ ] 3 Exact import — Figma plugin, SVG/PDF, font check, roles, Techonomy brand kit. Gate: Figma frame imports 1:1 with editable text.
- [ ] 4 AI first draft — role tagging, three options, prompt steering. Gate: usable options for 8 of 10 test designs.
- [ ] 5 Assets + subtitles — motion asset library and designer controls; subtitles from .srt (batch from sheets moved to 2b). Gate: a designer ships 20 lower thirds solo.
- [ ] 6 Procedural nodes — cloners, fields, delay, spring, loop (from the Nodal prototype), usable inside any subnet. Data node: sheet rows feed a cloner inside a comp (credits, speaker lists, leaderboards, chart bars).
- [ ] 7 Reference input — reference video (timing + speed curves), image recreate with overlay diff.

## Sources to reuse
- Motion Builder v1 (single HTML): presets (pickers, toasts, popups, counters), States, AE importer panel, ProRes path.
- Nodal prototype (React + three.js): node math for fields, delay, wave, spring, cloners and their tests; WebCodecs capture; xyflow setup.
