# Motion craft: research and feature priorities

## Scope and evidence
Research session: 12 November 2026. This is reference study and product planning, not training model weights. No new animation features were implemented in this research session.

Read the public collections on [Giphy](https://giphy.com/explore/motion-design), [Dribbble](https://dribbble.com/search/motion-gif), [Behance](https://www.behance.net/galleries/motion) and [Pinterest](https://ca.pinterest.com/avidcreative/motion-graphics-animated-gifs/). Dribbble and Behance exposed project listings; Pinterest exposed board thumbnails, not sufficient playback evidence to infer exact easing. Do not claim those collections were exhaustively watched.

Downloaded and inspected timestamped frames of three Giphy examples as research-only assets, not reusable application artwork:
- Matthew Butler's [ABCD typography](https://giphy.com/gifs/abc-text-typography-YAXXpVM8r4xJxUUHw5): 71 frames, 2.84 seconds. Letter fragments reveal progressively, a readable hold follows, and the word fades at the end. A single fade or word-scale entrance misses the construction of the glyphs.
- ArtSqb's [CIRCLES spiral](https://giphy.com/gifs/circle-spiral-circles-YnTYjYvJwkfB36AtKu): 150 frames, 9.99 seconds. Repeated type follows concentric/spiralling paths; the scene is already composed at the opening and changes continuously. Repetition, layout along a curve and temporal phase are more important than entrance presets. Sampled frames do not establish exact endpoint velocity continuity.
- David Urbinati's [Google icons](https://giphy.com/gifs/animation-icons-google-3oEdvdA2SrUuz0FB2o): 118 frames, 4.72 seconds. A cluster collapses into a folder and re-emerges. Separate object timing and a container relationship create a story; applying the same animation to every layer would lose it.

## Craft principles to apply
Sources: [Adobe's animation principles](https://www.adobe.com/creativecloud/animation/discover/principles-of-animation.html), [Figma's easing guide](https://help.figma.com/hc/en-us/articles/41238219562007-Motion-design-fundamentals-Easing), [Andrew Glassner on anticipation and elasticity](https://imaginary-institute.com/resources/AULibrary/Tech%20Note%2004%20Blending%20and%20Easing.pdf), and [Val Head on purposeful animation](https://www.creativebloq.com/web-design/beginners-guide-designing-interface-animations-61617793). Sources guide reasoning, not exact universal duration rules.

1. **Timing is composition.** Establish what is visible at frame zero, what moves first, what the eye follows, and how long text stays readable. Motion needs action, hold and resolution, not compulsory entrance/exit on every layer.
2. **Spacing determines speed.** Easing maps normalized time to progress; path length and duration determine actual speed. Identical curves on different distances do not imply identical motion.
3. **Choose easing by intent.** Deceleration often suits arrivals; acceleration often suits departures; ease-in/out suits a visible reposition; linear suits constant-speed tickers or rotation. Hard cuts and stepped animation are intentional alternatives, not faulty smoothness.
4. **Do not stop at every key.** Chained movement needs speed continuity where appropriate. Independent ease-out segments can create repeated braking. Holds and impacts may intentionally break continuity.
5. **Overshoot is not a default.** Anticipation, squash/stretch and follow-through express weight or elasticity; a sober editorial reveal should not inherit the same bounce as a playful icon.
6. **Temporal and spatial curves differ.** A straight path can accelerate; an arc can run at constant speed. A path tool must control geometry independently from its progress curve.
7. **Repetition needs phase, not clutter.** Cloners, per-copy offsets and fields describe wave walls and spirals much more clearly than many unrelated keys.
8. **Texture is artwork, not choreography.** Scanned paint and surface maps improve visual fidelity but cannot repair wrong timing. Preserve the supplied artwork and license restrictions.

## Art forms and reusable capabilities
| Family | Important mechanism | Product gap or next step |
| --- | --- | --- |
| Editorial / Swiss typography | restrained hierarchy, masked lines, readable holds | reliable text fitting and clipping |
| Kinetic / brutalist type | scale contrast, hard cuts, letter deformation | per-letter choreography and scene timing |
| Optical / geometric loops | repetition, phase, curved paths | type on paths and loop diagnostics |
| Collage / grunge | textures, stepped motion, displacement | curated finished texture assets and reveal masks |
| Product / icon storytelling | grouping, anticipation, follow-through | motion paths and reusable object choreography |
| Sculptural 3D type | extrusion, lighting, fields, surface character | material maps and finer deformation |

## Prioritized feature proposals
These are proposals, not claims that the application has them.

### 1. Reference comparison and motion score
Side-by-side synchronized reference/result, frame stepping and difference overlays. Separate assessments for artwork (text, font, spacing, colour), timing (cuts, holds, starts), motion (trajectory, easing, stagger) and loop seams. Analyse change around cuts more densely, not just a fixed number of evenly spaced stills. Permit explicit overrides where reference analysis is uncertain.

### 2. Better easing authoring
Extend the existing Graph editor rather than replacing the engine: speed display, linked continuity controls, editable influence, ease previews at the actual travel distance, and clearly separated hold/linear/spring behaviours. Keep outgoing-key easing semantics. A spring's settling duration should be intelligible, with overshoot visible before applying it. Preserve AE parity and export fidelity; schema additions need migrations.

### 3. Masks, text fitting and paths
Clipping to poster cells, masks linked to artwork, stroke trim/draw-on, type-on-path and motion-along-path with optional tangent orientation. Fit text to a defined box without silently changing the chosen font; make constraints explicit. This addresses the glyph-reveal and spiral examples as well as existing poster references.

### 4. Choreography and scene timing
Reusable anticipation → action → hold → follow-through → exit arrangements, each optional. Per-layer and per-part delays, beat markers, scene transitions and common time scaling. Keep these ordinary editable keys/nodes where possible. Prompt language such as “already visible”, “keep the subline still”, and “hold before the next scene” must map to concrete edits.

### 5. Texture-backed artwork and materials
Use supplied splatters inside finished title artwork, not a public redistribution of standalone PNGs. Add roughness/normal/displacement maps with texture scale and orientation, colour-space handling, save/open portability and explicit renderer/export limitations. Do not assume a roughness image can be used by the existing scalar roughness control.

### 6. Loop and fidelity checks
Check both values and sampled velocities across the seam, distinguish cyclic motion from ping-pong, flag clipping/overflow and missing assets/fonts. Add reference benchmark cases that compare rendered frames at meaningful timestamps; existing engine parity tests alone do not prove a visually close recreation.

## Practical sequence
Start with comparison tools and clipping/text fit because they expose and repair existing fidelity problems. Follow with easing/speed authoring and choreography. Add path-based type and richer material maps with their own exporter checks. Only then expand the preset library using those capabilities; more presets alone will not improve reference understanding.

## Safeguards
Keep the pure engine, immutable validated document edits and unchanged parity fixtures. Uploaded design remains authoritative. Research examples stay external references unless reuse is licensed. This session does not establish exact easing curves from thumbnails, does not claim every collection was watched, and does not imply continued background learning after the session ends.