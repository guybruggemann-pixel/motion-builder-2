<!-- LOVABLE:BEGIN -->
> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.

## What Lovable manages

Rules outside this block are the project's own. Change the pieces below in
Lovable, not by hand. With the [Lovable MCP](https://mcp.lovable.dev)
connected, `send_message` asks Lovable to do it; otherwise ask the user to
use the editor.

- **Database.** Do not add or edit `supabase/migrations/` or `drizzle/`.
  Ask Lovable to change the schema.
- **Generated files.** Do not edit a file whose header says it is automatically
  generated.
- **AI gateway.** Keep model calls on Lovable's gateway, and keep
  `LOVABLE_API_KEY` out of browser code.
- **Connectors.** Lovable provides native connectors. `list_connectors` shows
  which are enabled; `add_connector` only returns the dashboard link. When a
  connector is enabled, calls go through the connector gateway and need
  `LOVABLE_API_KEY`. When Lovable does not provide one, users can bring their
  own key and store it in Secrets.
- **Secrets.** Lovable manages them. Do not put secret values in the repo.
<!-- LOVABLE:END -->

## Motion Builder (imported from github.com/guybruggemann-pixel/motion-builder-2)
- Preset craft changes live in pure builders with motion regression tests; shared transforms keep compound artwork together, and periodic motion completes whole cycles. Why: timing refinements must remain editable and render identically without changing the engine or uploaded designs.
- Procedural assetFactory builds deterministic subnet docs; alphaThreshold isolates subnet pixels after blur, and Shape3D capsules use shared real capsule geometry. Why: fused artwork and 3D accents must match preview and final renders without raster imports.
- Stagger modifiers may opt into explicit index/parts for sequences across independent nodes; default split/clone indices remain unchanged. Why: separate grid tiles need sequential key timing without changing legacy parity.
- Curated artwork lives in the browser-only asset catalog; insertAsset embeds image bytes and license metadata through one validated edit, never replacing existing layers. Why: documents remain portable and supplied designs stay authoritative.
- Version snapshots clone every reachable subnet; version families follow explicit lineage rather than display names, so old work remains independent.
- Reference transfers use validated per-layer phases and key tracks with exact design context; unsupported SVG artwork defaults to a raster fallback rather than silently losing geometry.
- Custom fonts are embedded as font assets and restored before measuring, previewing or rendering; outline loading accepts raw and WOFF2 fonts for consistent 3D lettering.
- Library destination is shared view state; composition changes reset playback and subnet navigation to prevent stale selections.
- Follow MOTION_BUILDER_RULES.md and docs/HANDOVER.md; also src/core/AGENTS.md and src/app/AGENTS.md. Why: the engine's purity, parity and validated-edit rules keep renders correct.
- src/core is pure (alias @core); the UI lives in src/app (imported as @/app/...) and loads browser-only via ClientOnly + lazy in src/routes/index.tsx. Why: it needs canvas/WebGL/workers, which SSR can't evaluate.
- Run the engine tests with `bunx vitest run -c vitest.mb.config.ts` after changes. Why: 565 parity/edit tests guard behaviour the default config doesn't include.
- Save/open/autosave live in src/app/file (docFile.ts pure, persist.ts browser): files go through validateDoc; persist.ts only tracks the last-saved doc and mirrors the doc to IndexedDB. Why: the doc store must stay the single source of truth.
- AI calls: Lovable's AI gateway (in the block above) is no longer used. Every model call goes through `generate()` in `src/lib/ai/provider.ts` (Gemini / bridge / replay, keys in `.env`); read `src/lib/ai/AGENTS.md` first.
- AI keys ("Describe the motion", `src/app/ai/`): the server fn in `src/lib/ai/motion.functions.ts` only returns the model's JSON text; `checkProposal` (pure, tested) filters it to the layer's animatable params, frames and known eases, and `applyTracks` writes plain keys in one `docStore.edit`. Why: AI output must be indistinguishable from hand-set keys and never bypass validation.
- Import/Draft (`src/app/import/`, `@core/scene` importDraft.ts): file parsing and video frame grabs are browser-side; `buildDesignDoc`, `guessRoles`, `applyDraftSpec` and the `checkDraftSpec`/`checkReferenceLayers` filters are pure and tested. The AI (prompt drafts, picture/video rebuilds in `src/lib/ai/import.functions.ts`) only returns JSON text that those filters clean. Drafts are plain Phase/Split nodes and re-drafting replaces them; the open project only changes when a draft is picked (`docStore.load`). Why: AI output must be ordinary editable nodes and Import must never touch work by surprise.
- Import preset library (`@core/scene` presets/library.ts, UI `src/app/import/PresetLibrary.tsx`): presets are pure builders returning plain valid docs (2D = buildDesignDoc + applyDraftSpec, 3D = the 3D title restyled); an enhance prompt goes through the normal Draft AI path on the preset's layers. Why: presets must be ordinary editable docs and never bypass validation.
- Deformers (`@core/scene` deform.ts, `Deformer` node into an object's `deformer` port) act in scene space after clones; the 3D pass bakes deformed copies into one merged geometry per frame (no instancing). Wave field and Deformer phases come from comp time via `wavePhase` (loop = whole cycles per span). Why: one wave must run continuously through all clones and stay frame-identical in preview, render and AE passes.
- Pattern rebuilds: the reference AI may answer `pattern` (e.g. wave-wall) instead of flat layers; `checkPatternRecipe` cleans it and `waveWall` builds the cloner/field/deformer doc. Why: repeat-pattern references rebuild far closer as procedural setups, and AI output stays filtered.
- Type sequences and grunge titles (`@core/scene` presets/kinetic.ts): a sequence is one comp with a Subnet instance per scene laid end to end via `timing`, transitions are position keys on the instances; glitch = random-order stepped Phases, jitter = seeded noise modifiers. `checkSequenceRecipe`/`checkLowerThirdRecipe` clean the reference AI's `pattern` answer. Why: they stay ordinary editable nodes that export to AE as precomps and keys, no new engine node needed.
- Gradients and counters are plain Text/Shape params (`gradient`, `fill2`, `gradientAngle`; `count` + `{n}` in text) resolved in `evaluate.ts` and painted in `canvas2d.ts`; second-reference builders live in `@core/scene` presets/showcase.ts with `checkShowcaseRecipe`. Why: no schema bump, old docs stay valid, and AI rebuilds stay filtered.
- Type cube (`@core/scene` presets/cube.ts): row words pivot round the box centre through their anchor with shared rotation keys, no 3D group node. Why: rows turn as solid slices without a schema/engine change.
