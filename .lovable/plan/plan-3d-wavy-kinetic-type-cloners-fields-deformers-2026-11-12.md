# Plan: 3D wavy kinetic type (cloners, fields, deformers)

## What the reference actually is

```text
 one word, condensed, extruded 3D  ->  repeated along a row (Cloner, linear)
 rows stacked down the frame       ->  Cloner, grid / second axis
 whole wall tilted ~-70 degrees    ->  one rotation on the cloner
 each row bends into a sine wave   ->  Wave field / Bend deformer
 the wave travels over time        ->  field phase driven by time, loops
 dark gaps between rows            ->  real depth + soft shadows / AO
```

It is one word, one material, one light and about five building blocks, not dozens of layers.

## Why our result missed

- The rebuild made **13 flat 2D text layers**, with fake extrusion and shadow made from stacked copies, and a separate Animate in on each. That is slow to edit, can't bend and isn't 3D.
- The AI rebuild only knows flat shapes and text. It has no way to answer "this is a cloner with a wave".
- The engine is missing three things the look needs:
  - a wave that moves over time
  - a way to bend letters themselves
  - splitting 3D text into letters
- The font is the default Inter. The reference uses a tall condensed face.

## What we already have

Text 3D, Cloner (grid, linear, radial, row slide), effectors (Plain, Random, Step), fields (Linear, Spherical, Noise), materials, a key light, ambient occlusion, and 3D passes to After Effects.

## Build steps (in order)

**1. Wave field.** A new field that gives every clone a 0 to 1 value from a sine wave across the scene. Settings: direction, wavelength, amplitude, speed, and a Loop toggle (a whole number of cycles over the comp, so it loops seamlessly). Wired into a Plain effector, it moves and rotates clones in a travelling wave. This alone gets the "wave running through rows of words" feeling.

**2. Deformers: Bend, Twist, Wave.** New 3D nodes that change an object's shape, not only its position. A Wave deformer curves a whole row of extruded letters smoothly, like the reference, instead of stepping block by block. Text 3D and Shape 3D get a "detail" setting so curved shapes stay smooth. Deformers can also be driven by a field.

**3. Split 3D text into letters.** Text 3D gets a Split by letters / words setting, so a Cloner or effector can treat each letter as its own clone. This is needed for per-letter waves, staggers and the "letters fan out" presets in 3D.

**4. Cloner upgrades.**
- "Clone a word along a row, then rows down": the grid mode keeps letter spacing tight, from the word's real width.
- An offset per row, so rows don't line up.
- A loop-friendly scroll setting.

**5. Look.**
- Bundle one or two free condensed display fonts (for example Anton and Bebas Neue, open licence) so the type reads like the reference.
- A "studio grey" preset: matte white plastic, one soft key light, shadows on and ambient occlusion around 0.7, which gives the dark gaps between rows.

**6. "Wave wall" preset + recipe.** Add it to the 3D type section of the preset library: one Text 3D, a Cloner, a Wave field into a Plain effector, a Bend or Wave deformer, a camera, a light and a material. That's about 8 nodes instead of 26. Typing a word changes the whole wall.

**7. Smarter rebuild from references.** Teach the picture and video rebuild to recognise repeat patterns: walls of type, grids, rings, waves. When it sees one, it answers with a recipe instead of flat layers: the word, rows, columns, tilt, wave strength and speed, and material. The editor checks the recipe like every other AI answer and builds the node setup above. Flat layers stay the fallback for designs that really are flat.

**8. Check against your reference.** Re-run your poster video through Import and compare frames side by side. Then tune the recipe defaults until the rebuild lands close.

## What you'll be able to do after

Drop a reference like this, get a 3D wave wall made of real cloners and fields, change the word, and adjust the wave in a handful of settings. Export goes to After Effects as a 3D pass, as now.

## Limits

- The test browser renders 3D slowly and softly, so the final look and smoothness need checking on your machine.
- Deformed 3D text is heavier to render. Very large walls (hundreds of words) may need a lower detail setting.
- After Effects gets the 3D as rendered video, not as live AE 3D layers. That's the same as today.

## Technical notes

- Pure engine work in `src/core/scene` (catalog, clone.ts, scene3d, evaluate): WaveField sampling, deformer nodes as data on 3D objects (`deform` list: kind, axis, amount, field weight), and per-glyph Text 3D runs. Renderer work in `src/app/render/three` for vertex deformation on subdivided extrusions (geometry cache keyed on deform inputs).
- Time-driven phase uses comp time, so preview, render and AE pass stay frame-identical. Loop rounds the wave speed to whole cycles per comp.
- AI recipe: a new `checkPatternRecipe` filter (pure, tested) clamps counts, angles and speeds and builds the nodes. The server fn still returns only JSON text.
- Tests for each step: field values at known points and frames, deformer vertex offsets, split counts, recipe building, preset validity.
