# Type cube: text on the faces of a box, rows turning one by one

## What the reference does
- Five rows of extruded white type ("HOOP" / "CITIES"), stacked into a tall box seen from slightly above and to the side.
- Each row wraps a corner: one word on the front face, the other on the side face, meeting at the edge, so the stack reads as a solid cube.
- Each row turns on its own vertical axis (about 90° per move), with a short delay from row to row, then holds. After a full turn the faces line up again, so it loops.
- Soft studio light, black floor with a dim reflection and contact shadow.

## Why our version came out flat
- The AI could only answer with flat 2D text layers, so it put every word face-on and stacked them.
- The app has no way to group 3D objects so they turn together around a shared axis (a "row"), and no type-cube recipe for the AI to pick.

## What to build
1. **3D group block** – a new block inside 3D scenes that holds objects and gives them one shared position, rotation and scale. Rows become groups, so the two words on a row turn as one solid piece around the box's centre line.
2. **Type cube preset** (under 3D type) – builds the box from settings: words per face (up to 4 faces), number of rows, box size, letter depth, colour, material, turn amount (90/180/360°), turn time, delay between rows, hold time and direction (same way or alternating). Uses ordinary blocks (groups, Text 3D, camera, light, material), so you can change anything in Refine.
   - Each word is fitted to its face width, so the letters meet at the corners like in the reference.
   - Turn easing: slow start, fast middle, soft landing (in-out), with a hold between turns. Loops by ending on a whole turn.
   - Camera above and to the side, lens around 50mm; floor with a faint reflection.
3. **Rebuild from video** – teach the AI a new answer "type cube" (words per face, rows, turn amount, timing, camera angle). The app cleans it and builds the preset, like the wave wall and sequences today.
4. **Enhance prompts** – phrases like "rows turn one after another" or "spin the whole cube" map onto the preset's settings.

## Checks
- Tests: rows rotate independently, staggered by the set delay; words sit on adjacent faces at 90°; loop end matches start; old projects unchanged.
- Open it in the app and compare frames side by side with your reference video.
- Export to After Effects: groups come through as parent nulls (checked with our AE stand-in only).

## Not in this round
- Exact font from your clip (upload it in a zip to use it).
- True mirror floor reflections; we use a faint fake reflection.

## Technical details
- New `Group3D` node (category 3d, inputs Infinity, transform3d). scene3d.ts multiplies the group matrix into children (TRS · -anchor, column-major), cloners/deformers still act per object. No schema version bump: new node type only; validateDoc accepts it inside 3D networks.
- `typeCube()` pure builder in presets (new `cube.ts`), `checkCubeRecipe` filter, pattern kind "type-cube" in the analyzeReference schema + prompt.
- AE plan: Group3D → 3D null parent.
- Tests in test/typeCube.test.ts; preset count bump in presetLibrary.test.ts.
