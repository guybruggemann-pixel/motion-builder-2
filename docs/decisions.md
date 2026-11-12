# Decisions

| Topic | Decision |
| --- | --- |
| Base model | Houdini-style nested networks; a comp is a network, a Subnet node is a precomp |
| Animation | Every parameter = base value → keyframes → modifiers; keys and procedural motion combine |
| Motion vocabulary | anime-ae core (anime.js v4.5 port), Motion Builder v1 ease menu and amount mapping |
| Renderer | Canvas 2D / SVG for layers and type; three.js only as an optional 3D layer type |
| AE export | Native layers, keys at key times, bake only what AE can't express; one layer per character when it looks better; no expressions |
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
| UI styling | MotionBuilder Brandbook design system (from the Nodal prototype) on Tailwind 4 + class-variance-authority, in `src/app/design-system` |
| Fonts | Bundled variable web fonts registered under their plain family names (`src/app/render/fonts.ts`); no CDN, so preview and render measure the same glyphs |
| Batch data | A live Google Sheet is the main source (CSV as fallback). Rows map to a motion asset's promoted controls; the doc stays one template and each render is template + row overrides. Batch renders through the web render (master for batch); AE stays the master for single hero comps |
| Batch order | Data-driven batch comes right after phase 2 output (2b), before the AI phases; it needs the renderer and layout that follows content (1f), nothing from the AI |
| Sheet access | Google Sheet shared as "anyone with the link can view", read as CSV (gviz endpoint), polled while the batch panel is open. No Google sign-in for now |
| Batch output | Files go into a folder the user picks (File System Access, Chrome/Edge); a manifest there skips rows whose output wouldn't change |
