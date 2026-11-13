# Prompt for Claude Code: start plan v3 (steps B and C)

Use after the sync pull request (prompt 1) is merged and CI is green.

---

Read `CLAUDE.md`, `docs/plan-v3.md`, `docs/asset-library.md`, `docs/HANDOVER.md`,
`src/core/AGENTS.md` and `src/app/AGENTS.md`. Run both test suites and the typecheck first.
We're starting plan v3 (prompt-first). Work in this order, one commit per item, and show each
running in the browser where there's UI.

## Step 0: one AI connection point, and a headless renderer
1. Replace Lovable's AI gateway (`src/lib/ai/*.functions.ts`) with one provider interface on the
   server side (`src/lib/ai/provider.ts`): `generate({ task, instructions, input, tools | schema })`.
   Keys live in `.env` (server-side only, never in browser code, never in the repo; add
   `.env.example`). Providers, chosen per task in one config file:
   - **gemini** (now): `GEMINI_API_KEY` from Guy's Workspace account. Look up the current model
     names in Google's docs; don't guess them.
   - **anthropic** (later): `ANTHROPIC_API_KEY`; Claude Fable for the app, Claude Opus 5.5 for
     evaluation runs. Look up the model IDs; don't guess them.
   - **bridge**: the request is written to `.ai-bridge/pending/` and the app waits; Guy answers it
     from his Claude Code session ("answer the pending request"), which writes the response to
     `.ai-bridge/done/`. For testing without any key.
   - **replay**: plays back saved responses, so tests are repeatable and free.
   Keep the existing filters (`checkDraftSpec`, `checkReferenceLayers`…) in front of the doc.
2. **Tiered models.** The engine does the heavy lifting, so most calls should run on a small, fast
   model. Route per task:
   - steering and prompt drafts (pick library assets, emit a few typed edit operations): small tier;
   - reading a reference video or still (structure, which recipe): large tier;
   - escalate a call to the large tier automatically when the small tier's answer fails validation
     twice, and log it.
   Make small models succeed: tool schemas with enums (eases, roles, node ids, library ids from
   the current doc), only the relevant layers and the 3 to 5 retrieved library candidates in the
   context, never the whole doc.
3. A dev command `bun run ai:apply <doc.json> <ops.json>` that applies edit operations to a doc and
   renders a preview through the headless job, so the whole loop can run inside Claude Code.
4. A headless render job: Playwright + Chromium runs the app's own renderer (no second renderer)
   from a scene doc + overrides to frames, MP4 or ProRes. Used for library previews, batch, CI
   regression renders and long reference loops. The live loop while the user watches keeps
   rendering in the browser. Gate: headless and browser renders of the same doc match within the
   frame-diff tolerance.

## Step B: asset library
1. `src/core/library/`: zod schema for `asset.json` (as in `docs/asset-library.md`), a loader that
   validates a package (asset.json + doc.json through `validateDoc`), and `index.json` generation.
2. `importAe.ts` (pure): converts `tools/ae/mb-export.jsx` output into a scene doc with the asset
   as one Subnet with promoted controls. Implement the AE temporal-ease → cubicBezier conversion
   from the spec, snapping to a menu ease within tolerance. Unsupported things go to `importNotes`.
   Write the tests from a hand-made `ae.json` fixture first (I'll replace it with a real dump).
3. `importC4d.ts` (pure): same for `tools/c4d/mb_export.py` output into a Scene3D subnet.
4. Library panel in the app: browse `library/`, insert an asset as one Subnet (one validated edit),
   inbox with approve/reject (only the owner approves). Previews come from the headless job.
5. Taste memory (no Teach button): store every dropped reference with its analysis in
   `library/references/`, and log picks, steers, hand edits, exports and stars per project
   (`library/taste/`). Starred and exported results are proposed to the inbox as packages.
6. Seed: convert the 50 presets into packages so the library isn't empty.

Gate: I export a real AE comp with the dumper, import it, and the engine render matches
`source/reference.mp4` within the frame-diff tolerance.

## Step C: edit operations
1. `src/core/ops/`: a typed list of edit operations (`addFromLibrary`, `setPhase`, `setKeys`,
   `retime`, `setEase`, `applyPreset`, `setMaterial`, `setText`, `groupInto`, `removeNode`…), each
   a pure function doc → doc with a zod schema for its arguments, and an `applyOps` that runs a
   list through `validateDoc` after each op and reports which op failed.
2. Expose them to the model as tools (function calling) instead of the single JSON proposal.
   Keep the existing `checkDraftSpec` path working until the new one is better.
3. Selection-aware steer: the request carries the selected nodes, parts (word/character index)
   and time range.
4. A test set of 10 steering requests on 3 reference docs, with the expected ops, run as a test.

Gate: 9 of 10 steering requests land as the right edits.

Run the steering test set with Claude Opus 5.5 as the judge, and report pass rates per request.

## Model test
Once step C's steering test set exists, run it with the small Gemini tier, the large Gemini tier
and (when the key is there) Claude Fable, and report the pass rate and cost per request for each.
The cheapest setup that passes 9 of 10 wins.
