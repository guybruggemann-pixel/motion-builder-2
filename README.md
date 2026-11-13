# Motion Builder 2.0

A browser motion-design app for a small team (2 motion designers, 2 designers): drop in a design,
get it rebuilt as editable layers and node networks, refine with keyframes, cloners, fields and a
Cinema 4D-style 3D layer, and deliver ProRes 4444 / MP4, batches from a Google Sheet, or After
Effects passes with AOVs.

Built in Claude Code and Lovable; this repo is the source of truth.

## Run it (use bun)

```sh
bun install
bun run dev          # http://localhost:8080
bun run test         # app tests + the engine suite (vitest.mb.config.ts)
bun run test:engine  # engine suite only
bun run typecheck
bun run build
```

`npm install` fails on this tree (an npm bug with the `overrides` field), so there is no
`package-lock.json`; `bun.lock` is the lockfile. Use Chrome or Edge: folder export, WebCodecs MP4
and WebGL 3D rely on them.

## Read first

- `CLAUDE.md` (same content as `MOTION_BUILDER_RULES.md`): the project rules.
- `docs/HANDOVER.md`: architecture, data model, UI, outputs, lessons, next steps.
- `docs/plan.md`, `roadmap.md`, `docs/decisions.md`: roadmap and decision log.
- `src/core/AGENTS.md`, `src/app/AGENTS.md`, `AGENTS.md`: folder rules.

## Layout

- `src/core`: the pure, deterministic engine (scene doc schema, evaluation, cloners, presets).
  No UI, DOM or renderer imports; runs in Node for tests.
- `src/app`: the editor UI (React, zustand), renderers (Canvas 2D, three.js), exporters.
  Loaded browser-only through TanStack Start (`src/routes/index.tsx`).
- `test/`: the engine suite. `src/**/*.test.*`: app tests.

## Render from the command line

`bun run render <doc.json>` renders a scene doc with the app's own renderer in a background
browser: MP4 by default, `--format prores` for ProRes 4444 with alpha, `--frame 30` for one PNG,
`--instance main/lt --set name="Ada Lovelace"` to fill promoted controls. `bun run render --help`
lists everything. `bun run render:check` compares background renders with a real browser window.
Needs Google Chrome. Rules: `tools/render/AGENTS.md`.

## Known limits

The AI features ("Describe the motion", prompt drafts, picture and video rebuilds) go through one
server-side provider (`src/lib/ai/provider.ts`, rules in `src/lib/ai/AGENTS.md`). Copy
`.env.example` to `.env` and set `GEMINI_API_KEY`; without a key, requests wait in `.ai-bridge/`
for a Claude Code session to answer (`AI_PROVIDER=bridge`), and tests play back saved answers
(`AI_PROVIDER=replay`).

