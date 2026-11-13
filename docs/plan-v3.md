# Motion Builder 2.0 — plan v3: prompt-first (summary)

Full plan with diagrams: https://claude.ai/artifact/DnRUjhGEjxW51N8FoYFBbv (tab "Plan v3: prompt-first").
Decided 2026-11-13. Replaces the phase order in `docs/plan.md` from here on; the v2 plan stays
as history.

## Direction
An AI motion designer with an editor behind it. Describe or show what you want, the engine
builds it, you steer it in words; the timeline is there for the last 10 percent. Target: smooth
single assets (2D and 3D) that make you enjoy the fluency of motion, not long high-end pieces.

## Principles
1. Words first, handles second: every timeline change can also be asked for.
2. The AI edits, it doesn't rewrite: typed edit operations on the existing doc, each validated.
3. The engine is the only renderer: the AI writes nodes and keys, never pixels or code.
4. Show, then compare: every generation is rendered and scored before the user sees it.
5. Learn from what you do: library + retrieval + taste memory (references, picks, steers, edits, exports, stars). No model training.
6. The editor stays honest: anything the AI made can be opened and changed by hand.

## Roadmap v3 (each step ends with a gate)
- [x] A Sync + CI — GitHub is the source of truth; CI runs both test suites and typecheck. Gate: CI green on main with the Lovable export merged.
- [ ] B Asset library — Anthropic API instead of Lovable's gateway, headless render job, package format (`docs/asset-library.md`), AE + C4D importers (deterministic, from `tools/`), taste memory, 20 seed assets. Gate: an AE comp becomes an asset that renders the same.
  - [x] One AI connection (`src/lib/ai/provider.ts`): Gemini for now, bridge and replay for tests; Anthropic backend still to add.
  - [x] Headless render job (`bun run render`, `tools/render/`); headless and browser renders match exactly (`bun run render:check`).
  - [x] Package format, checks and index (`src/core/library/`, `bun run library:index`).
  - [x] AE importer (`importAe.ts`, `bun run library:import-ae`), tested on a hand-made dump. Still to check against a real AE export (the gate).
  - [x] C4D importer (`importC4d.ts`, `bun run library:import-c4d`), tested on a hand-made dump. Still to check against a real C4D export.
  - [ ] Library panel, taste memory, seed assets.
- [ ] C Edit operations — typed ops the model calls (`addFromLibrary`, `setPhase`, `setKeys`, `retime`, `setEase`, `applyPreset`, `setMaterial`, `groupInto`, …); selection-aware steering chat. Gate: 9 of 10 steering asks land as the right edit.
- [ ] D Reference loop — analysis (cuts, holds, optical-flow motion curves, OCR, loop detection), ease fitting, render, compare + motion score, iterate. Gate: 8 of 10 references judged close by Guy.
- [ ] E Learning loop — retrieval from the library, taste memory → `library/motion-skills.md`. Gate: library-informed drafts beat the baseline in 7 of 10 blind comparisons.
- [ ] F Prompt-first UI — Claude Design round (`prompts/3-claude-design-ui-v3.md`), then build. Gate: a designer makes an asset without opening the timeline.
- [ ] G AE hybrid export — passes + AOVs by default; native editable layers only where a per-layer check passes; first run in real After Effects. Gate: passes and editable text line up in real AE.
- [ ] H Engine package — headless render API / CLI for other apps (explainers, social posts). Gate: another app renders from a doc + overrides.

## Export rule
Passes and AOVs are the default AE route. "Editable where possible" checks each layer at export:
2D text/shape layers with plain keys or Phase/Split and AE-representable eases go out as native
layers (their pass included, hidden, for comparison); everything else is a pass. Never design an
engine feature around AE.

## Decided 13 Nov
- AI model: Claude Fable runs the app's AI; Claude Opus 5.5 runs tests and comparisons. Calls go to the Anthropic API (key server-side), not Lovable's gateway.
- Renders for previews, batch, CI and long reference loops: a headless job (Playwright + Chromium) running the app's own renderer. The live loop renders in the browser.
- No Teach button: taste memory records references, picks, steers, edits, exports and stars automatically; only Guy approves into the shared library.
- Lovable is not connected to GitHub. This repo is the only source of truth; Lovable work arrives as exports through `prompts/1-claude-code-sync.md`.
