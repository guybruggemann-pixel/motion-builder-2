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
