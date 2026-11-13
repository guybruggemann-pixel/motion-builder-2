# src/core/library rules

The asset library's pure half: package format, checks, index, importers. Spec: `docs/asset-library.md` (keep it in step with `asset.ts`). Reading folders lives in `tools/library/`; nothing here touches the file system.

- `asset.ts`: zod schema of `asset.json`. `source.license` is required. Changing a field = update the spec and the packages in `library/`.
- `package.ts`: `checkPackage(folder, assetJson, docJson)` validates both files and how they fit: id = folder name, the root comp outputs exactly one Subnet (`assetNetwork`), `controls` are promoted ids of that Subnet's network, `dimension` matches the doc. `buildIndex` is sorted by id so `index.json` only changes when the library does.
- `importAe.ts`: `tools/ae/mb-export.jsx` dump → doc. **Deterministic and never silent**: anything skipped or approximated goes into `notes` in plain words (they become `importNotes`). No model is involved in conversion.
  - Result shape: `main` comp → one Subnet `asset` → the AE comp's network; precomps are Subnets inside it. Layers go back to front into a Merge.
  - Keys: a key's ease is the segment that starts at it. `aeEase.ts` holds the speed/influence → cubic-bezier formula (exact for 1-D and spatial properties) and snaps to a menu ease within 0.04 (`BEZIER_OF` in core/motion), so AE's Easy Ease reads as `inOutSine`.
  - Parenting: a parent becomes a Group carrying position, anchor, scale and rotation for itself and its children; opacity and in/out stay on the layer's own node (AE doesn't inherit them).
  - Shapes: ours draw from [0, 0] to `size`, AE centres a rect/ellipse on its own position, so the importer writes an `anchor` that makes up the difference and keys it along with a keyed size.
  - Precomp: `timing.in` is the AE start time (a Subnet plays from its in point). A trimmed start is reported.
  - `[ctl]` in a layer name promotes its text (Text) or fill (Shape, solid); controls are listed top layer first.
  - Not imported, reported instead: effects, masks, expressions, blend modes, track mattes, 3D, time remap/stretch, text animators, cameras, lights, footage, animated paths, curved motion paths (flattened), per-dimension eases (first dimension wins).
- The dumper writes enums as words since `mb-ae-dump/0.2` (`blendingMode: "normal"`, `trackMatteType: "none"`, `justification: "left"`); anything else is treated as unsupported and reported.
- `test/fixtures/aeLowerThird.ts` is hand-made, because the dumper hasn't run in After Effects yet. When a real dump exists, add it as a fixture and fix what it shows; expect property names or value shapes to differ from the guess.
- Step B's gate is not met until a real AE comp's import renders like its `source/reference.mp4`.
