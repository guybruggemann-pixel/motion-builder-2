# Decisions

| Topic | Decision |
| --- | --- |
| Base model | Houdini-style nested networks; a comp is a network, a Subnet node is a precomp |
| Animation | Every parameter = base value → keyframes → modifiers; keys and procedural motion combine |
| Motion vocabulary | anime-ae core (anime.js v4.5 port), Motion Builder v1 ease menu and amount mapping |
| Renderer | Canvas 2D for 2D layers and type, and the compositor. three.js renders 3D scene layers (a Scene3D subnet drawn into the comp as one layer) and layers with non-solid materials. The core evaluates everything (transforms, clones, colours at time t) and never imports three.js; preview and final render run the same three.js code, frame-stepped. Decided 2026-11-12, replacing "three.js only as an optional 3D layer type" |
| AE export | Native layers, keys at key times, bake only what AE can't express; one layer per character when it looks better; no expressions. 3D scene layers and layers with non-solid materials export as a ProRes 4444 pass with alpha in their own precomp; everything 2D stays native |
| Web output | Master for social and web jobs; MP4 via WebCodecs, ProRes 4444 with alpha, sub-frame motion blur |
| AE output | Master for broadcast and client comps |
| Designer access | Motion assets: subnets with promoted controls |
| AI | Writes scene doc JSON only, always through `validateDoc`; three characters: smooth, punchy, playful (`CHARACTERS`) |
| Inputs | Figma and SVG/PDF exact import first; reference video and image recreate later (phase 7) |
| Team | 2 motion designers + 2 designers |
| Motion Builder v1 | Retired; only its core and ideas carry over |
| Dev environment | Claude Code in this repo |
| Promoted control values | Stored on the Subnet instance as params named after the promoted id (full parameter stacks, keys in parent time); `validateDoc` checks them against the target param |
| App stack | Vite 8 + React 19 + TypeScript, zustand store, immer patches for undo/redo |
| UI styling | MotionBuilder Brandbook structure (Tailwind 4 + class-variance-authority, `src/app/design-system`) with the soft tokens from `docs/ui-handover.md`: floating cards on a grey canvas, light by default, dark via `.dark` on `<html>`. Black pill = where you are / main action, white raised pill = selected, Volt only for live state (playhead, key at the playhead, running progress) and always with ink. Theme and the library panel are per-browser view state (localStorage), never in the doc |
| Fonts | Bundled variable web fonts registered under their plain family names (`src/app/render/fonts.ts`); no CDN, so preview and render measure the same glyphs |
| Batch data | A live Google Sheet is the main source (CSV as fallback). Rows map to a motion asset's promoted controls; the doc stays one template and each render is template + row overrides. Batch renders through the web render (master for batch); AE stays the master for single hero comps |
| Batch order | Data-driven batch comes right after phase 2 output (2b), before the AI phases; it needs the renderer and layout that follows content (1f), nothing from the AI |
| Sheet access | Google Sheet shared as "anyone with the link can view", read as CSV (gviz endpoint), polled while the batch panel is open. No Google sign-in for now |
| Batch output | Files go into a folder the user picks (File System Access, Chrome/Edge); a manifest there skips rows whose output wouldn't change |
| 3D and procedural | Cinema 4D style inside the node model: Text 3D / Extrude, Camera, Light, physical Material nodes, Cloner, effectors and fields (seeded, deterministic). Cloners, effectors and fields come before import and AI (roadmap 3D-a to 3D-c), and work on 2D layers too |
| Materials | Material nodes (three.js `MeshPhysicalMaterial` params) wired into a layer's `material` input; no wire = the layer's `fill` (a Solid). Reusable materials live in the brand kit. Open: whether designers can pick a material in Edit mode, from an approved list |
