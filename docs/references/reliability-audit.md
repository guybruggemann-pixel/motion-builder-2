# Reference fidelity and reliability audit

## Reference motion grammar
- Wave poster: continuously deformed condensed 3D type, repeated with cloners; one field crosses the entire wall. Do not replace continuous motion with staggered entrances.
- Grunge lower thirds: fragmented letter/stroke build, short jittering hold, reverse/glitch exit. Preserve artwork textures rather than approximating them as clean rectangles.
- Square promo: countdown, repeated scrolling words, full-frame line builds and information scenes; cuts and pushes connect separate compositions.
- Floating cards: image-backed faces with independent tilt and slow looping field motion. The uploaded faces should not be replaced by placeholder colours.
- Diagonal trail: repeated tiles flowing on a diagonal; distinguish global flow from animation inside a tile.
- SaaS text: word-by-word choreography with reframing, gradients, cursor click, counter and ring accents; timed scenes rather than one entrance.
- Run By The Sun: fixed cells, edge-to-edge type, squash/stretch and per-cell tickers; cell clipping remains a fidelity gap.
- Black/white typography: alternating solid/outlined stacked rows collapse, letters jumble, then a split-screen hold; preserve distinct scene timing.
- Main_v01 comparison: flat fading rows do not reproduce the wave reference's repeated geometry or continuous deformation.

## Implemented
- Compositions are accessible from the rail and library, with new-comp creation and version snapshots.
- Versions deep-copy reachable subnet networks and use explicit lineage; stale navigation is truncated.
- Material Library opens Materials directly. Object Look controls expose material keys, including held kind changes; preset application preserves existing animation.
- Prompt/reference drafts support validated per-layer start, exit and key tracks. Exact design words, fonts, positions and dimensions are supplied to AI; design rebuild is opt-in.
- Twenty timestamped frames replace six; source duration is retained. Missing seek notifications can resolve only when the requested decoded frame is actually ready.
- Unsupported SVG artwork defaults to one preserved artwork layer, with the editable approximation available explicitly.
- Used uploaded font bytes are embedded in project assets and restored before previews/renders. 3D outlines accept raw fonts as well as WOFF2.
- File open resets navigation/playback; IndexedDB transactions close their connections.
- Long preset names no longer produce colliding ids.

## Verification
- 691 engine/edit/export regression tests passed; one existing test skipped.
- Browser: Comps opens, a new version is created, switching back works, and no page errors occur.
- Browser: selected 3D title's Library opens Materials; Roughness key diamond switches to its keyed state.
- Real AI flow: uploaded SVG plus black/white video, explicitly prompted to move only “techonomy” 60 px right, hold, and return. Draft selected and opened in Refine; autosave readback confirmed keys at 0/1/2/3 seconds, unchanged Outfit font, size, fill and resting position, unchanged “is awesome” and background, source duration 4.016667 s. No page errors.
- Latest automatic build check passes.

## Remaining limitations
This is improved prompting and editable motion representation, not model-weight training. Exact recreation of every reference is not established by one successful motion-transfer check.
- Four original reference rebuilds still need individual visual comparison.
- Card-image replacement, poster-cell clipping, faithful paint textures and fine 3D deformation still need dedicated work.
- Imported-font embedding and raw 3D outline support have code/tests, but a saved custom-font project has not been browser-tested through a reload.
- Real After Effects, directory-picker batch output and exhaustive narrow-screen checks are not verified in this audit.
- Multi-scene/procedural reference motion cannot always be transferred faithfully onto an arbitrary flat design; a preserved single artwork layer cannot animate its internal letters independently.