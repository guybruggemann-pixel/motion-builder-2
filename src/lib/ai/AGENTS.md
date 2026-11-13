# src/lib/ai rules

- Every AI call goes through `generate()` in `provider.ts`. Features (`*.functions.ts`) describe the task, instructions, input and answer schema; they never pick a service or a model. That lives in `config.ts`.
- Server side only. Import `./provider` dynamically inside a `createServerFn` handler so `node:fs` and the key never reach the browser bundle. Keys come from `.env` (gitignored; `.env.example` lists them). Never log a key or put it in a URL.
- Backends (`AI_PROVIDER` in `.env`; default `gemini` when `GEMINI_API_KEY` is set, else `bridge`):
  - `gemini`: Gemini API, structured output via `responseJsonSchema`. Tiers are lists of Google's own aliases (`gemini-flash-lite-latest`, `gemini-flash-latest`, `gemini-pro-latest`); override with `GEMINI_SMALL` / `GEMINI_LARGE`. Don't pin version numbers in code.
  - `bridge`: writes `.ai-bridge/pending/<id>/request.md` (+ images) and waits up to 10 min for `.ai-bridge/done/<id>.json`. To answer from Claude Code: read the request, write JSON that matches its schema to the path it names.
  - `replay`: answers from `test/fixtures/ai-replay/<name>-<hash>.json`. Record with `AI_RECORD=1` on a live backend. The hash covers task, instructions, input and schema, so changing a prompt needs a new recording.
- Fallbacks (`runRequest`): busy (429/503/404/network) → next model in the tier; an answer that isn't JSON or fails the request's `check` → retry, and after `ESCALATE_AFTER` failures a small-tier task moves to the large tier (logged as `[ai] … escalating`). A refused key stops at once.
- The free Gemini tier has no Pro quota, so `reference` (large tier) falls through to Flash on a free key.
- The UI still validates every answer before it touches the doc (`checkDraftSpec`, `checkReferenceLayers`, the motion proposal check). Keep those in front of the doc; the server check is only "is it usable JSON".
- `test/aiProvider.test.ts` covers the fallbacks, the Gemini request shape and both file backends without calling Google.
