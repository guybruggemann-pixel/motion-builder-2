# Prompt for Claude Code: bring the Lovable build into GitHub

Paste everything below the line into Claude Code, opened in your local clone of
`guybruggemann-pixel/motion-builder-2`. Put the Lovable zip somewhere outside the repo first
(for example `~/Downloads/mb2-lovable.zip`) and change the path in the first step if needed.

---

The Lovable project has moved ahead of this repo. GitHub `main` is at `8852b76` (handover, 12 Nov).
The Lovable export in `~/Downloads/mb2-lovable.zip` contains everything since then: presets, reference
rebuilds, kinetic type, asset library, wave field, deformers, type cube (740 engine tests). Bring it in
without losing anything the repo has and Lovable dropped.

1. `git status` must be clean. Create a branch `lovable-sync-2026-11-13` from `main`.
2. Unzip the export to a temp folder outside the repo. Copy it over the repo with
   `rsync -a --delete --exclude .git --exclude node_modules --exclude reference --exclude .claude <tmp>/ ./`
   (the excludes keep `.git`, the local `reference/` folder and `.claude/launch.json`).
3. Restore what Lovable renamed or dropped, then check each one still makes sense:
   - `CLAUDE.md`: Lovable renamed it to `MOTION_BUILDER_RULES.md` (identical content). Restore
     `CLAUDE.md` from `main` (`git checkout main -- CLAUDE.md`) and keep `MOTION_BUILDER_RULES.md`
     too, because Lovable's root `AGENTS.md` points at it.
   - `KICKOFF.md`: restore from `main` and mark it as historical at the top.
   - `src/app/index.html` and `src/app/main.tsx`: the app now boots through TanStack Start
     (`src/routes/index.tsx`). Don't restore them unless `bun run dev` needs them; say what you decided.
   - `package-lock.json`: Lovable uses `bun.lock`. `npm install` currently fails on this tree
     (an npm bug with the `overrides` field); `bun install` works. Remove `package-lock.json`, and
     document "use bun" in `README.md` and `CLAUDE.md`.
4. Fix the scripts Lovable changed in `package.json`:
   - `npm test` now runs only `src/**` tests. Add `"test:engine": "vitest run -c vitest.mb.config.ts"`
     and make `"test"` run both (`vitest run && vitest run -c vitest.mb.config.ts`).
   - Add back `"typecheck": "tsc --noEmit"`.
5. `bun install`, `bun run test`, `bun run typecheck`, `bun run build`. Expected: 740 engine tests
   passing (1 skipped) and a clean typecheck. Fix only what the merge broke; don't refactor.
6. Add a GitHub Action `.github/workflows/ci.yml` that runs `bun install --frozen-lockfile`,
   the two test suites and the typecheck on every push and pull request.
7. Copy the files from the v3 pack (`docs/`, `prompts/`, `tools/`, `library/`) into the repo.
8. Commit in logical steps (sync, restores, scripts, CI, v3 docs). Show me `git diff --stat main`
   and a summary of anything you weren't sure about. Push the branch and open a pull request.
   Don't merge without my OK, and never force-push `main`.

Context: Lovable is not connected to this repo (it runs on a work account). This repo is the
only source of truth from now on; any later Lovable work arrives as a new export and goes through
this same prompt. Note that the AI features call Lovable's AI gateway (`@lovable.dev/ai-gateway`,
`LOVABLE_API_KEY`), which won't work outside Lovable. Don't fix that here; it's the first item of
the next prompt (`prompts/4-claude-code-next.md`). Just list in the PR which features depend on it.
