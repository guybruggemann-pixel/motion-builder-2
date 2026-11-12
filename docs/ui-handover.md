# UI/UX handover: soft direction + materials

Status: design approved by Guy (2026-11-12). Ready to implement.
Design canvas (private, Guy can share): https://claude.ai/artifact/99H82Kjdzqrn981XzNJtEm

## Kickoff prompt (paste into Claude Code)

> Read `CLAUDE.md`, `docs/plan.md`, `docs/decisions.md`, `src/app/AGENTS.md` and this file (`docs/ui-handover.md`). The approved screens are in `docs/ui-reference/` (see "Reference files"). Run `npm test` and `npm run typecheck` first; everything must be green before you change anything. Then work through the phases below in order, one phase per commit, showing a running result in the browser after each. Before phase D, ask me the open decisions at the end of this file. Ask before anything else that is hard to change later.

## Reference files

`docs/ui-reference/*.dc.html` are design mockups, not app code. They are HTML with inline styles plus a small `class Component extends DCLogic { renderVals() {…} }` script (a design-tool runtime, `support.js`, which is not in the repo, so they will not open on their own). Read them for exact spacing, colours, radii, copy, states and interaction logic. Do not copy their structure or the runtime into the app; rebuild with the design system, React and the existing stores.

| File | Screen | Style |
| --- | --- | --- |
| `refine.dc.html` | 3 Refine, Animate mode. **The approved direction.** Timeline, Graph and Network tabs, library, contextual toolbar, inspector, light/dark | final |
| `materials.dc.html` | Material library + editor (physical material settings, preview, "used by") | content final, restyle to the soft language |
| `import.dc.html` | 1 Import (drop zone, recents, preset library start) | content final, restyle |
| `draft.dc.html` | 2 Draft (role check, font check, three choreographies, steer) | content final, restyle |
| `edit-mode.dc.html` | 3 Refine, Edit mode for designers (promoted controls only) | content final, restyle |
| `deliver.dc.html` | 4 Deliver (formats, single vs batch from sheet, QC, queue) | content final, restyle |

Only `refine.dc.html` is in the new visual language. The other five carry the right content and flows in the older dark style; restyle them with the same tokens and components.

## What changes, in one paragraph

The app moves from a dense dark panel grid to calm floating cards on a soft grey canvas, light by default with a one-click dark theme. The viewer gets the most space. Layers live in the timeline only (AE-style tree). The left panel becomes a Library (materials, presets, brand) that opens from an icon rail. Selecting a layer shows a small contextual toolbar on the canvas. The inspector is ordered by intent: Motion, then Look, then folded Transform and Modifiers. Layers get **materials** (three.js physical materials) instead of a fill colour; a colour is a Solid material. Materials are nodes in the network, wired into a layer's material input. The app is not about lower thirds: the lower third is test content, roles and presets are generic.

## 1. Design language

Replaces the dark-first Brandbook look. Keep the Brandbook structure (Tailwind 4 + cva in `src/app/design-system`), swap the tokens and add the variants below. Update `docs/decisions.md` ("UI styling") and the design-system `styles.css`.

### Tokens

Light is `:root`, dark is `.dark` (flip from today). Theme is view state in `uiStore` (persist in localStorage, not in the doc).

| Token | Light | Dark | Use |
| --- | --- | --- | --- |
| canvas | `#e7e8ec` | `#0b0c0f` | app background behind cards |
| card | `#ffffff` | `#15171b` | rail, library, viewer chrome, timeline, inspector |
| field | `#f1f2f4` | `#1e2126` | inputs, wells, segmented-control tracks, grouped sections |
| raised | `#ffffff` | `#2a2d33` | selected item inside a field or list (white pill) |
| stage | `#eef0f3` | `#0f1114` | viewer background (with 1px dot grid in `line2`, 22px) |
| bar | `#e9ebef` | `#24272d` | timeline layer bars |
| ink | `#16171a` | `#edeef0` | text, active pill background |
| muted | `#686c75` | `#9a9ea6` | secondary text (passes 4.5:1 on card and field) |
| faint | `#8b8f97` | `#7c8088` | counts, ruler numbers; large or non-essential only |
| line | `#ebecef` | `#22252a` | dividers |
| line2 | `#d5d7dc` | `#34373d` | tree connectors, dashed outlines, dot grids |
| volt | `#c3fc2f` | same | live only, always with an ink outline or ink text on top |
| warn-bg / warn-ink | `#ffd9c2` / `#8a3b0f` | same | warning badges |
| ok-bg / ok-ink | `#c9f0dc` / `#0f5c37` | same | ok/promoted chips; status dot `#1fbf7a` |

Shadows: `shadow` = `0 1px 2px rgba(16,17,20,.05), 0 6px 18px rgba(16,17,20,.06)` (cards, raised pills); `float` = `0 2px 4px rgba(16,17,20,.06), 0 12px 32px rgba(16,17,20,.14)` (floating toolbar, transport, dragged nodes). Dark: `0 0 0 1px rgba(255,255,255,.04)` and a stronger float.

Radii: cards 20, groups/sections 16, list rows and nodes 12, fields 10, segmented items 9, pills 999.

Type: Inter (UI), Inter Tight 600 (titles, -0.02em), JetBrains Mono (times, values, ease strings). Sizes: 22 inspector title, 13 body/section heads (sentence case, 600), 12 secondary, 11 meta. No tiny uppercase labels. Counts after a heading in `faint`: "Layers (6)".

### States (the important rule)

- **Black pill (ink bg, white text)** = where you are or the one main action: current flow step, Deliver button, open rail panel, play button.
- **White raised pill** (raised bg + shadow) = what is selected inside a list or segmented control: the selected layer row, the active tab, the chosen ease preset.
- **Volt** = live only: playhead (ink 1.5px line + volt time pill), the key at the playhead (volt diamond with ink border), the selection outline on canvas, the motion-preview dot, running render progress. Never decorative.
- Borders are rare. Separate with space and the card/field contrast instead.

### Components to add or restyle

Rail (56px, icon buttons 40px round, tooltips on hover and focus), segmented control (field track, raised active), pill button (primary ink / secondary card+shadow / ghost), filled input, section card (field bg, radius 16, collapsible with a one-line summary), tree row with connector lines (1.5px `line2`, 7px rounded elbow), badge (warn/ok, radius 6), chip (radius 999), floating toolbar, floating transport, node card for the network (card bg, radius 12, port dots 14px with 2px ink border), material sphere (CSS preview, 12/14/24/30/44px).

## 2. Refine screen layout

CSS grid on the app root, padding 12, gap 12, full viewport height:

```
columns: 56px | 232px (library, collapsible to 0) | 1fr | 296px
rows:    48px top bar | 1fr | 290px
areas:   "top  top  top  top"
         "rail lib  view insp"
         "rail tl   tl   insp"
```

When the library is closed the timeline and viewer take its width. Below ~900px everything stacks (top, viewer, inspector, timeline, library, rail).

- **Top bar** (no card): logo, project / comp switcher with version pill, save status pill ("Saved · 1 note"), centered flow stepper (Import, Draft, Refine, Deliver; done steps get a check, current is the black pill), right: Animate / Edit segmented, Deliver black pill.
- **Rail**: Library toggle (black when open), Comps and versions, Search / commands (⌘K); bottom: theme toggle, avatar.
- **Library**: segmented Materials / Presets / Brand, search, 2-column grid of material tiles (44px sphere + name). Click applies to the selected layer, drag drops onto a layer (viewer, timeline row or network).
- **Viewer**: card with stage bg and dot grid. Top-left pills: Fit / zoom, format and fps. Top-right segmented icon group: safe areas, motion blur, transparency. Comp frame centered with a soft shadow, max ~740px wide at 1440. Floating transport at the bottom center: prev key (J), play (ink circle), next key (K), timecode in mono.
- **Contextual toolbar**: floats 14px above the selected layer's bounds (from the evaluated drawable bounds): layer name, material (sphere + name, opens a material picker), in-ease (mini curve + name, opens the Graph tab), add key at the playhead. Hidden while playing.
- **Timeline card**: header with Timeline / Graph / Network segmented tabs, breadcrumb for subnets, "+ Layer". Body: 236px layer tree (connector lines, material dot, role, warning badge) next to the tracks (pill bars, phase ranges as lighter segments, key diamonds, playhead). This replaces the Library panel's layer list; there is one layer list in the app.
- **Inspector** (order matters):
  1. Title (layer name, Inter Tight 22), type and role, overflow menu.
  2. **Motion** section: In / hold / Out proportion bar, In and Out cards (mini curve + ease string; click opens the Graph tab on that phase), one sentence describing the motion.
  3. **Look** section: material card (sphere, name, kind, Edit), opacity slider.
  4. **Transform**: folded to one line ("0, −8.4 · 100% · 0°") with a volt diamond if keyed at the playhead; expands to the current controls.
  5. **Modifiers**: folded to one line; expands to the current list.
  6. "Designers can edit" toggle at the bottom = promote this layer's controls (writes `promoted` on the asset network).

Selection is the spine: selecting a layer anywhere (viewer, tree, network) updates the outline, toolbar, inspector, Graph tab and highlighted node. Keep it in `uiStore.selectedNodes`.

### Graph tab

Left: big value curve of the selected layer's animate-in (later: any selected key segment), dashed guides at 0 and 1. Right column (300px): looping motion-preview dot, Overshoot slider for amount eases, preset grid (3 columns, mini curve + name), "Save current curve as preset". Presets use `MENU_EASES` and `easeString`/amount from `src/core/motion/presets.ts`. **Draw curves and drive the preview with the real core eases (`ease()` from `src/core/motion/eases.ts`)**, not the approximations in the mockup. The preview can use CSS `linear()` built from ~30 samples, or a requestAnimationFrame loop; respect `prefers-reduced-motion`. Picking a preset writes the ease through the existing inspector/timeline edit recipes (one undo step).

### Network tab

Existing xyflow view, restyled with node cards. Adds a material shelf on the left (150px) whose items drag onto the canvas: drop on empty space creates a Material node; drop on a layer node creates it in front and wires it. Material nodes have one output port; Text and Shape layer nodes get a `material` input port on the left. Dragging from the output port draws a live wire; dropping on a layer node or its port connects. Clicking a connected material port detaches. Node × removes. One material node may feed several layers. All edits go through `network/edits.ts` and `validateDoc`.

## 3. Materials (data model)

Proposal; confirm the open decisions before building.

- New catalog category `material`, node type `Material` in `src/core/scene/catalog.ts` (catalog first, per CLAUDE.md). Params (all animatable unless noted): `kind` (choice: solid, glass, metal, plastic, iridescent, emissive; not animatable), `color` (Color, brand tokens allowed), `roughness` 0..1, `metalness` 0..1, `transmission` 0..1, `ior` 1..2.33, `thickness` 0..1, `clearcoat` 0..1, `iridescence` 0..1, `emission` 0..4, `env` (choice: studio-soft, studio-hard, overcast; not animatable). These mirror three.js `MeshPhysicalMaterial`.
- Text and Shape get a `material` input port. Wire `{ from: { node: matId, port: "out" }, to: { node: layerId, port: "material" } }`. No wire = today's `fill` colour, so existing docs and tests keep working (no doc migration needed; a v4 bump only if the schema itself changes).
- Library: materials saved for reuse live in the brand kit (`brand.materials`, each a Material param set with a name), so a project's Glass is shared and editing it updates every layer that uses it. Starter set: Primary, Glass, Frosted, Chrome, Brushed alu, Gloss plastic, Foil, Neon edge, Paper, Ink.
- `evaluateFrame` resolves the material per drawable (values at time t, brand tokens resolved) and adds it to the drawable. Core stays renderer-free.
- Render: `solid` keeps the Canvas 2D path. Other kinds need a WebGL layer pass (see open decision 1). Preview, render and AE must still match (frame-diff tests).
- AE export: solid = native fill. Non-solid: see open decision 2.
- Material editor screen (`materials.dc.html`): preview on the selected layer / sphere / flat, physical settings with key diamonds, lighting, "Used by" list, AE note that changes with the kind.

## 4. Not lower-thirds only

- Roles in the UI are generic. The schema `Role` enum already is (`title`, `subtitle`, `body`, `panel`, `logo`, …); show friendly labels (headline, subline, body, shape, logo, image, background) and keep the enum unless a rename is clearly needed.
- The example lower third is test content. Copy, empty states and names never assume a format.
- Presets (later phase): a preset is a design with motion, tagged by use ("lower third · subtitle · caption") and format (16:9, 9:16, 1:1). Same preset can serve several uses. The Library's Presets tab and the Import screen's "Start from a preset" lead there.

## 5. Phases (one commit each, tests + typecheck green, running result shown)

A. **Tokens and shell.** New light/dark tokens, theme toggle in `uiStore`, restyled primitives, new App grid (rail, library, viewer, timeline, inspector), floating transport, top bar with flow stepper. No behaviour change. Gate: every existing feature still works; screenshots in light and dark.
B. **One layer list, selection-driven UI.** Layer tree with connectors moves into the timeline, Library panel becomes Library (materials placeholder, presets placeholder, brand), contextual toolbar, inspector reordered (Motion, Look, folded Transform/Modifiers). Gate: select from viewer, tree or network and all four places follow.
C. **Graph presets and preview.** Preset grid, amount slider, motion preview from core eases, one undo step per pick. Tests for the preset-to-ease-string mapping.
D. **Materials** (after the open decisions). Catalog + evaluator + tests first, then network ports and shelf drag/wire, Library apply, inspector Look, material editor. Solid end to end first; then the non-solid render path.
E. **Other screens** restyled: Import, Draft, Edit mode, Deliver, Materials editor.

Keep `docs/plan.md` checkboxes current as items land.

## 6. Open decisions (ask Guy before phase D)

1. **three.js in the main render path.** `decisions.md` limits three.js to an optional 3D layer type. Glass that refracts the layers below it needs WebGL in preview and render. Option: Canvas 2D stays the compositor; non-solid materials render per layer in an offscreen WebGL pass (three.js) that samples the already-composited layers below, then composite back.
2. **AE export of non-solid materials.** Proposal: those layers export as a ProRes 4444 pass with alpha in their own precomp; everything else stays native. No expressions either way.
3. **Edit mode and materials.** Should the motion designer be able to promote a "material" control so designers pick from an approved short list?
4. **Theme default.** Light by default for everyone, or remember per user only?

## 7. Acceptance checklist

- Light and dark both pass 4.5:1 for text, 3:1 for UI parts; focus rings visible on every control.
- Every icon-only button has an aria-label and a tooltip.
- Volt appears only on live elements.
- One layer list in the app.
- Selecting a layer anywhere syncs viewer outline, toolbar, tree, inspector, graph and network.
- Ease previews come from the core eases and match the timeline.
- Undo: every drag, slider move or preset pick is one step.
- `npm test`, `npm run typecheck` green; frame-diff tests extended when materials render.
