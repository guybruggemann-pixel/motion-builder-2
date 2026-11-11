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
- [ ] 2 Output — AE native layers (one per character), MP4 / ProRes with alpha, motion blur. Gate: preview, render and AE match frame by frame.
- [ ] 3 Exact import — Figma plugin, SVG/PDF, font check, roles, Techonomy brand kit. Gate: Figma frame imports 1:1 with editable text.
- [ ] 4 AI first draft — role tagging, three options, prompt steering. Gate: usable options for 8 of 10 test designs.
- [ ] 5 Assets + batch — motion assets with designer controls; subtitles from .srt, lower thirds from CSV. Gate: a designer ships 20 lower thirds solo.
- [ ] 6 Procedural nodes — cloners, fields, delay, wave, spring (from the Nodal prototype), usable inside any subnet.
- [ ] 7 Reference input — reference video (timing + speed curves), image recreate with overlay diff.

## Sources to reuse
- Motion Builder v1 (single HTML): presets (pickers, toasts, popups, counters), States, AE importer panel, ProRes path.
- Nodal prototype (React + three.js): node math for fields, delay, wave, spring, cloners and their tests; WebCodecs capture; xyflow setup.
