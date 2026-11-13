# Build plan: kinetic type sequences and grunge lower thirds

## What the two references show

**Reference A: "Live Now" promo (720x720, 9s, square)**
A fast sequence of full-frame type scenes, joined by hard cuts and pushes:
1. Countdown **3-2-1**: huge grey numbers on light grey, each pushed off sideways by the next one.
2. **LIVE / NOW**: giant condensed red type on dark red, one copy in the middle of the frame, then repeated side by side (LIVE LIVE / NOW NOW) and scrolling sideways.
3. Black card with one small line ("Watch your favorite artists"), drifting slowly.
4. **FRONT ROW IS WHERE YOU ARE**: line-by-line build, dark red on red, text filling the frame, the whole block easing upward.
5. **TONIGHT** repeated in a column that scrolls up endlessly (a vertical ticker).
6. A clean info card (icon + text rows: date, rewatch, audio, length, count), the rows coming in one after another.
7. Closing line ("Only on veeps.com").

Look: two-colour palettes, condensed heavy type set very tight (lines touching), text sized to fill the frame, hard timing with snappy eases.

**Reference B: grunge lower thirds (9 variations, 6s)**
Each title: a name in two parts (a brush font plus a block font), a small role tag, painted brush strokes and splatter behind them, a few thin speed lines.
- **In:** glitchy build in about 0.5s: white boxes flash in, letters come in out of order with sideways offsets, colour bars wipe across.
- **Hold:** small jitter on the paint and lines.
- **Out:** the same glitch backwards: letters drop out at random, boxes slice away.
Look: gradient fills (pink to green), white tag boxes, textures that aren't flat shapes.

## What we already have
Split into letters/words, stagger (including random order), springs and ease presets, mask/wipe reveals, cloners with row offset and scroll, Phase/Split drafts, the preset library, the reference rebuild with checked AI output.

## What's missing

### 1. Scenes in a row (for A)
- A **Sequence** building block: a list of scenes, each with its own length, joined by a transition: **cut**, **push** (left/right/up/down), **slide-over** or **wipe**. One timeline: scenes don't overlap except during the transition.
- Every scene is an ordinary comp you can open and edit, the same way as the lower third.
- In AE it becomes a precomp per scene laid out on the main timeline, transitions as plain position/mask keys.

### 2. Type that fills the frame (for A)
- **Fit to frame** on text: width, height or both, with tight **line spacing** (down to touching lines) and tracking.
- A condensed heavy font close to the reference (Anton or similar, alongside Oswald).
- **Text ticker:** repeat a word in a row or column and scroll it seamlessly (built from the cloner with scroll, packed as one setup with tidy settings: direction, speed, gap).

### 3. Out animations (A and B)
- Every animation style gets a matching **Out** (reverse, or its own), placed at the end of the layer. This was already on the open list from Import.

### 4. Glitch build (for B)
- A **Glitch** reveal for text and shapes: letters in random order, short sideways jumps, stepped (held) frames, optional flash boxes in front of letters. Uses the existing random stagger and stepped ease, so it stays frame-identical and exports to AE as keys.
- **Jitter** (wiggle) for the hold: small random movement per frame from a seed, exported to AE as baked keys.

### 5. Texture and paint (for B)
- **Gradient fills** on shapes and text (linear, two to three colours). Also fixes the "gradients are skipped" Import gap.
- **Brush stroke / splatter shapes:** a small set of built-in grunge stroke shapes (drawn as vector paths, no image files), recolourable, revealed with a wipe that follows the stroke.
- **Speed lines:** thin lines that streak in and fade.
- **Picture masks:** use a picture's transparency as the matte for a layer (needed for paint textures later).

### 6. Info rows (for A, scene 6)
- A small **icon set** (calendar, clock, replay, audio, people) as shapes, and a "list" layout that stacks icon + text rows with even gaps and staggers them in.

### 7. Presets and rebuild
- New presets in the library:
  - Kinetic type: **Countdown push**, **Repeat & scroll**, **Line build fill**, **Vertical ticker**, **Info card**, and **Promo sequence** (the full A-style piece, with your own words).
  - Lower thirds: **Grunge glitch** in three looks (brush + block name, tag box, paint behind), each with in, hold jitter and out.
- **Rebuild:** the reference AI may answer `sequence` (list of scenes, each picking a scene type with its words and colours, plus transitions) or `lowerThirdSet` (name, role, style). These get checked like the wave-wall recipe and built from the presets above. Other references still rebuild as before.

## Order of work
1. Sequence + transitions (biggest unlock for A).
2. Fit-to-frame type, tight leading, condensed font, text ticker.
3. Out animations.
4. Glitch reveal + jitter.
5. Gradient fills, brush/splatter shapes, speed lines.
6. Icon set + info rows.
7. Presets (6 kinetic type, 3 grunge lower thirds).
8. Rebuild recipes for sequences and lower-third sets, then a test rebuild of both your videos.

## What won't match yet
- Real scanned paint textures (we'd draw them as vector strokes; photo-like grit would need image texture support).
- Your exact fonts (brush font and the reference's condensed face) — we'd use the closest free fonts unless you upload yours.

## Technical details
- Sequence node in `@core/scene`: pure; scene ranges and transition offsets come from comp time so preview, render and AE stay identical; AE plan emits one precomp per scene.
- Text: `fit` (`none|width|height|contain`) resolved in layout from measured outlines; `leading` and `tracking` animatable.
- Glitch/jitter: seeded, pure functions of frame; jitter baked to keys on AE export; glitch built from random stagger + stepped ease.
- Gradient fill: new fill kind in render and AE (Gradient Ramp / shape gradient fill); SVG import maps `linearGradient`.
- Brush shapes: path library in `@core`, revealed via trim-path-style progress.
- New recipes `checkSequenceRecipe` and `checkLowerThirdRecipe` (pure, tested), same pattern as `checkPatternRecipe`.
- Tests for each block: sequence timing/transitions, fit-to-frame, glitch determinism, jitter seeds, gradient parse, recipe filters, all new presets valid.
