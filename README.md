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

## Known limits

The AI features ("Describe the motion", prompt drafts, picture and video rebuilds) call Lovable's
AI gateway (`@lovable.dev/ai-gateway`, `LOVABLE_API_KEY`) and only work inside Lovable for now.
