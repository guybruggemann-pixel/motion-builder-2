# Roadmap: four new reference styles
- [x] Gradient fills (preview/render) — AE export still uses the first colour
- [x] Glow blobs, cursor click, counter ({n} + count keys), pulse rings
- [x] Floating cards, card trail (seamless loop), word follow with camera follow
- [x] Box poster: squash-to-box words, doubling up, squiggles that draw on
- [x] 10 presets (40 total) + rebuild recipes (cards, trail, sentence, box-poster)
- [x] AE: gradient as Gradient Ramp (matted to the layer), counters as Source Text keys
- [ ] Card pictures: drag your own images onto cards (placeholders now)
- [ ] Test rebuild of the four videos (uses AI credits; user to try)
- [x] Premium type: 10 presets in their own section (50 total)

# Reference fidelity and reliability audit
- [x] Reanalyze all supplied motion references and document their reusable motion grammar
- [x] Repair composition navigation and independent version snapshots
- [x] Open the material library reliably and expose/preserve material animation
- [x] Preserve uploaded designs when applying reference motion; improve temporal sampling and timing
- [x] Run engine regressions and browser checks; document verified flows and remaining limitations

# Curated starter assets
- [x] Add 24 MIT-licensed Tabler icons with attribution and two generated artwork textures
- [x] Add searchable Assets tab with previews and additive, undoable image-layer insertion
- [x] Verify insertion, undo, redo and reload in the running app; 696 engine tests passed, one skipped; phone-sized asset list checked

# Procedural asset presets
- [x] Add assetFactory and four Shapes presets with deterministic editable subnet nodes
- [x] Support grouped alpha threshold and genuine capsule geometry in shared preview/render
- [x] Test counts, timing and materials; inspect all four in the editor at visible frames; 705 tests passed, one skipped

# Preset motion craft pass
- [x] Refine role timing, readable holds, purposeful 3D motion and lower-third exits without replacing artwork
- [x] Correct echo opacity, click choreography, countdown timing and continuous-motion loop seams
- [x] Add 11 motion regression tests; 716 tests passed, one skipped; inspect Echo stack, Cursor click, Gold flip, Floating cards and Classic bar in the editor
- [x] Defer offscreen preset previews and use a visible still for Sparkle Burst
