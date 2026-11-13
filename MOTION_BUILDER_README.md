# Motion Builder 2.0 — starter kit

Phase 0 groundwork for Motion Builder 2.0, ready to continue in Claude Code.

## Start

1. Unzip into a new folder, for example `~/Documents/motion-builder-2`, and run `git init`.
2. `npm install && npm test`: you should see 169 passing tests.
3. Open the folder in Claude Code and paste the prompt from `KICKOFF.md`.
4. Optional: copy the Nodal prototype into `reference/nodal/` and Motion Builder v1 into `reference/motion-builder-v1.html`, so Claude Code can port from them. Add `reference/` to `.gitignore` if you don't want it in the repo.

## What's inside

| Path | What |
| --- | --- |
| `CLAUDE.md` | Project rules Claude Code follows |
| `KICKOFF.md` | Prompt for finishing phase 0 and building phase 1 |
| `docs/plan.md`, `docs/decisions.md` | Plan summary, roadmap checkboxes, decisions taken |
| `src/core/motion` | anime-ae core in TypeScript: 40 eases + bezier, steps, spring, stagger, timeline positions, v1 ease menu |
| `src/core/scene` | Scene doc v2 schema, node catalog, validation, parameter stack evaluation, reference lower third |
| `fixtures/anime-ae-core.es3.js` | Motion Builder v1's ES3 core (the After Effects runtime) |
| `test/` | Parity tests against the ES3 core, schema and parameter tests |
