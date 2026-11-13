# Build plan: four new reference styles

## What the references show

**A. Floating cards (720x540, 9s)**
About 12 rounded cards (photos, UI screenshots, big "100th", "MatterJS" with coloured dots, a mascot) scattered on black, each tilted at its own angle. The whole field drifts slowly up and across in a loop, and new cards keep coming in from the edge. Soft depth: some cards are a bit bigger/closer.

**B. Diagonal card trail (720x480, 15s)**
A stack of square tiles (type card, portrait photo, word list, big red letters, a yellow product, a green globe icon, a blue tile) running in a diagonal line from top left to bottom right. The line slides along so tiles keep flowing out of one corner and into the other, each tile overlapping the one before it. The content inside some tiles also moves on its own (scrolling word lists, letters sliding through).

**C. SaaS text promo (736x414, 7.6s)**
A sentence told word by word: each new word slides in from the right and the camera pans to follow ("Give your team superpowers"). Words have pink-to-purple gradient fills. Soft blurred colour blobs move behind. A hand cursor flies in and "clicks" a word. Then a number counts up in a pill ("2x" to "10x better"), with rings of soft rounded rectangles pulsing out behind it, and it ends on a "Feedback" button.

**D. Run By The Sun poster (720x900, 10s)**
A tight grid of coloured boxes, each filled edge to edge with one word (RUN, BY, THE, SUN) or a sun circle. Words squash and stretch to fill their box, and copies slide through the box (RUN RUN, SUNSUN, BY BY), like a ticker per cell. Thin white squiggle lines draw on and off over the top. Loops.

## What we can already do
Cloners with random effectors and scroll, split and stagger, glitch/stepped eases, wiggle, scene sequences with pushes, frame-filling condensed type (Anton), text tickers, images as layers, rounded rects, trim-path draw-on for lines.

## What's missing, and what we'll build

### 1. Colour gradients (C, also the grunge titles)
Linear and radial gradient fills on shapes and text, 2 to 4 colours, animatable angle. Exported to After Effects as a gradient fill / Gradient Ramp. This is the most-requested missing piece.

### 2. Soft colour blobs (C)
A **Glow blob** layer: a big blurred radial gradient that drifts on a slow seeded path. Several blobs make the soft backgrounds in C.

### 3. 2D cloner with cards (A, B)
The 2D layer version of the cloner we have in 3D: copy any layer (a card group) in a scatter, grid or line, with random rotation/scale/position, row offset and seamless scroll. Each copy can show a different image from a list (**clone variants**), so 12 different cards come from one setup.

### 4. Time offset per copy (B)
A **Delay** setting on the cloner so each copy runs the same animation a little later. That gives the trail in B, and the echo stacks you see in motion design.

### 5. Card building block (A, B)
A **Card**: a rounded box that clips an image, a colour or text inside it, with an optional shadow. Content inside can scroll by itself (word list ticker).

### 6. Camera pan in 2D (C)
A **2D camera** (null that the whole comp follows): pans and zooms, so "the camera follows the last word" is one setting instead of moving every layer. Exported to AE as a parent null.

### 7. Word-by-word follow (C)
A sentence preset where each word comes in, the camera keeps it centred, and earlier words slide off. Built from split words + stagger + the 2D camera.

### 8. Cursor and click (C)
A built-in **cursor** shape (arrow and hand) that flies to a target layer and "clicks": a small press and a ring pulse on the target. Path follows an eased curve.

### 9. Number counter (C)
A **Counter** on text: counts from one number to another with an ease, with prefix/suffix ("x better"), whole or decimal. In AE, baked as text keys.

### 10. Pulse rings (C)
Rings of rounded rectangles that scale out and fade from a centre, from the cloner with a radial/scale step and delay.

### 11. Squash to fill a box (D)
**Fit to box** on text: stretch or squash the word (non-uniform scale) to fill a given box exactly. Animatable, so a word can go from wide to tall. With the per-cell ticker this gives the RUN RUN / SUNSUN look.

### 12. Box grid layout (D)
A **Grid poster** builder: split the frame into boxes (rows/columns with spans), each box gets a colour and a word or shape; every box can run its own ticker, squash or swap.

### 13. Squiggle lines (D)
Hand-drawn wavy line shapes that draw on and off (trim path start and end) at random places, seeded.

## New presets (10)
- **Floating cards** (A): scatter of cards drifting in a loop, your own pictures.
- **Card trail** (B): diagonal line of tiles flowing corner to corner.
- **Word follow** (C): sentence word by word with a camera pan and gradient words.
- **Counter pill** (C): number counts up in a pill with pulse rings.
- **Cursor click** (C): a cursor flies in and clicks a word or button.
- **Glow background** (C): drifting soft colour blobs.
- **SaaS promo** (C, full): the above as one sequence.
- **Box poster** (D): coloured grid of squashed words with per-box tickers.
- **Squash & stretch word** (D, single): one word stretching to fill its box.
- **Squiggle overlay** (D): random white squiggles drawing on and off.

## Rebuild
The reference AI can answer with these new recipes: `cards` (layout, count, tilt, drift, colours), `trail` (direction, tile count, speed), `sentence` (words, colours, gradient, counter, cursor), `boxPoster` (grid, words, colours, squiggles). Each is cleaned by a tested filter before anything is built, like the existing ones. Pictures in the reference can't be lifted out of the video, so card and tile images become placeholders you swap for your own (drag pictures onto the cards).

## Order of work
1. Gradient fills (render, AE, SVG import).
2. Card block + 2D cloner + clone variants + per-copy delay.
3. Glow blob, 2D camera, counter, cursor.
4. Fit-to-box squash, box grid, squiggles.
5. The 10 presets.
6. Rebuild recipes, then a test rebuild of all four videos.

## What won't match exactly
- The photos and screenshots in A and B: you'll need to add your own pictures.
- Real depth of field and perspective on the floating cards: we fake depth with size and blur; true 3D cards would go through the 3D scene later.
- The exact fonts (C looks like a geometric sans, close to Inter Tight; D is close to Anton).

## Technical details
- Gradient: new fill value kind `{ type: "linear"|"radial", stops, angle }` in schema (version bump + migration), canvas2d `createLinearGradient`, AE via shape Gradient Fill / Gradient Ramp effect for text.
- 2D Cloner reuses `scene/clone.ts` records and effectors on 2D drawables; `variant` index picks from an asset list; `delay` adds a per-clone time offset (stagger semantics: time only).
- 2D camera: a `Camera2D` node that sets an inverse transform on the comp; AE plan emits a null parent.
- Counter: text param modifier (`count`) evaluated in `evaluateParam`, deterministic; baked to text keys for AE.
- Fit-to-box: `fit: "box"` with `box: [w, h]` resolved from measured outlines into scale.
- Builders in `@core/scene` presets (pure, tested); recipe filters `checkCardsRecipe`, `checkTrailRecipe`, `checkSentenceRecipe`, `checkBoxPosterRecipe`.
- Tests: gradient evaluate and migration, clone variants and delay determinism, counter values, fit-to-box scale, every new preset valid.
