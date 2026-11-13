# MCP prompts: turn AE and C4D work into library assets

These replace the earlier prompts. What changed and why:

- **The model no longer converts keyframes to scene doc JSON by hand.** That loses AE's ease
  data (speed and influence), guesses ease names and invents values. Instead the MCP runs a
  dumper script that writes the raw data exactly, and the app's importer converts it
  deterministically (`docs/asset-library.md`).
- **Node names match the real catalog.** There are no `title3d`, `word` or `primitive` nodes; the
  3D nodes are `Scene3D`, `Text3D`, `Shape3D`, `Material`, `Camera`, `Light`, `Cloner`, and the
  importer creates them.
- **Output goes into the library inbox**, with metadata for retrieval, not to the desktop.
- **The reference render comes along**, so the import can be checked against the original.

Set `LIBRARY` to your local repo's `library/` folder (for example
`~/Documents/motion-builder-2/library`). New packages land in `library/_inbox/<slug>/`.

---

## After Effects (with the After Effects MCP)

> Export the After Effects composition "**COMP NAME**" as a Motion Builder library asset.
>
> 1. Use `ae_comp_info` on the comp and list its layers, precomps, duration, fps and size back to me before you write anything.
> 2. Make a slug from the comp name (lowercase, hyphens). Create `LIBRARY/_inbox/<slug>/source/`.
> 3. Run the dumper: open `tools/ae/mb-export.jsx` from the repo, set `MB_COMP_NAME` and `MB_OUT_FOLDER` at the top to the comp name and that `source/` folder, and run it in After Effects (via the MCP's script-run operation if it has one; otherwise tell me to run it from File > Scripts). It writes `ae.json`. Do not write or edit `ae.json` yourself, and do not change any numbers in it.
> 4. Render the comp to `source/reference.mp4` (H.264, comp size and frame rate) through the render queue, if the MCP can; otherwise tell me.
> 5. Write `LIBRARY/_inbox/<slug>/asset.json` following `docs/asset-library.md`. Fill `grammar` from what you observe in `ae.json` (durations between keys, which properties move, stagger between layers, the dominant ease shapes from speed/influence), `source` with the project file and comp name, `license` as "Techonomy internal" unless I say otherwise, and `status: "inbox"`. Leave `doc.json`, `preview.mp4` and `poster.png` out: the app makes those.
> 6. Tell me what you found that the engine may not support (effects, expressions, 3D layers, track mattes, blending modes), so I know what will become a pass.

## Cinema 4D (with the Cinema 4D MCP)

> Export the current Cinema 4D scene as a Motion Builder library asset.
>
> 1. List the objects, materials, animated tracks, camera, frame rate and frame range back to me before you write anything.
> 2. Make a slug from the document name. Create `LIBRARY/_inbox/<slug>/source/`.
> 3. Run `tools/c4d/mb_export.py` from the repo inside Cinema 4D (through the MCP's Python execution) with `OUT_FOLDER` set to that `source/` folder. It writes `c4d.json`. Do not write or edit `c4d.json` yourself.
> 4. Render the animation to `source/reference.mp4` with the current render settings, if the MCP can; otherwise tell me.
> 5. Write `asset.json` as in `docs/asset-library.md` (`dimension: "3d"`, `grammar` from the tracks you see: which objects rotate or move, over which frames, with which tangent shapes), `status: "inbox"`.
> 6. Tell me what the engine may not support (Redshift node materials beyond base colour, roughness, metalness, transmission, emission; deformers other than bend/twist/wave; dynamics; hair; particles), so I know what to simplify.

## Small extras that make the library better

- Name AE layers by role (`title`, `subtitle`, `panel`, `accent`, `logo`) before exporting: the importer uses names to guess roles.
- Mark the controls a designer should change by putting `[ctl]` in the layer name (for example `Name [ctl]`): the importer promotes their text and fill.
- One asset per comp. Put variations in separate comps (`_v02`), they become separate packages.
