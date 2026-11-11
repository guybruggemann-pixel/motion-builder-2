# src/app rules

- The doc lives in `store/docStore.ts` only. Change it with `docStore.getState().edit(label, recipe, { coalesce })`; never mutate it or keep a copy in component state. Edits that fail `validateDoc` are rejected.
- Drags and typing: pass the same `coalesce` key on every intermediate edit and call `commit()` on release, so one gesture is one undo step.
- `store/uiStore.ts` is view state (playhead, open subnet path, toggles). Nothing in it may change what gets rendered or exported.
- Pixels come from `evaluateFrame` through a `FrameCache`. Render code (`render/`) maps drawables to canvas calls and holds no scene logic; it must stay free of React because the phase 2 web render reuses it.
- Measure text with `canvasMeasure()` only after `loadFonts()` resolves; a cache built on fallback metrics lays text out wrong.
- Styling: brandbook tokens and components from `design-system/` (see its `system.md` rules in the Nodal reference): tokens only, no raw colours in UI, Volt (`primary`) only for live/active state.
- Ease names in the UI come from `MENU_EASES` (Motion Builder v1 vocabulary).
