# Kickoff prompt for Claude Code

Paste everything below the line into Claude Code, opened in this folder.

---

You're starting Motion Builder 2.0. Read `CLAUDE.md`, `docs/plan.md`, `docs/decisions.md` and `src/core/AGENTS.md` first. Then run `npm install`, `npm test` and `npm run typecheck`. All 169 tests should pass before you change anything.

What's already here (phase 0, mostly done):
- `src/core/motion`: the anime-ae core ported to TypeScript, bit-identical to Motion Builder v1's ES3 core (`fixtures/anime-ae-core.es3.js`).
- `src/core/scene`: scene doc v2 schema (nested networks, parameter stacks, promoted controls, brand kit), node catalog, `validateDoc`, `evaluateParam`, and a reference lower third in `examples/lowerThird.ts`.

## Step 1: finish phase 0

1. Write `src/core/scene/evaluate.ts`: `evaluateFrame(doc, networkId, t)` returns a flat list of drawable parts (text glyph runs, shapes, images) with resolved transforms, opacity, blur and fill. It must:
   - walk the network from its `output` node upstream, recursing into subnets with their timing offsets;
   - resolve promoted controls and `brand:` colour tokens;
   - implement `Split` (characters, words, lines; use a pluggable text-measure function so core stays renderer-free) and `Phase` (in/out with anime-ae stagger, ease, offsets and reveal) exactly as Motion Builder v1 behaves.
2. Add a frame cache keyed by doc identity + frame number.
3. Tests: the lower third at t = 0, 0.5, 1, 3 and 5.5 s; stagger order for "center" and "random"; subnet timing offset; promoted text override.

Gate: all eases match Motion Builder v1 (already green) and `evaluateFrame` is covered by tests.

## Step 2: phase 1, the comp editor

Set up the app in `src/app`: Vite + React 19 + TypeScript, zustand store holding the scene doc with undo/redo (patches), @xyflow/react for the network view. Layout:
- Top: canvas viewer (Canvas 2D renderer, real web fonts, safe-area guides) with transport.
- Bottom, full width: tabs for **Timeline** (layer nodes as bars, keyframe diamonds, speed/value graph editor) and **Network** (node graph; double-click a Subnet to dive in, breadcrumb to go back up).
- Right: inspector. Every animatable param has a key toggle (diamond), prev/next key, and a modifier list.
- Left: library (node catalog, motion assets, brand kit).

Build it in small steps and show it running after each: (a) store + viewer rendering the lower third, (b) timeline with playhead and keys, (c) inspector editing with undo, (d) network view with dive-in, (e) graph editor.

Gate: one of the motion designers rebuilds a Techonomy lower third in under 10 minutes.

Ask me before choosing anything not covered in `CLAUDE.md` or `docs/decisions.md` that would be hard to change later.
